import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadFile, deleteFile, getSignedUrl, listUserFiles, getFileQuota } from '../utils/storage-uploader.js';
import { sendErrorResponse, getRequestId } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const ALLOWED_BUCKETS = [
  'profile-images',
  'contract-documents',
  'proposal-attachments',
  'project-attachments',
  'dispute-evidence',
  'milestone-deliverables',
];

function isValidBucket(bucket: string): boolean {
  return ALLOWED_BUCKETS.includes(bucket);
}

router.post(
  '/upload',
  authMiddleware,
  fileUploadRateLimiter,
  ...createFileUploadMiddleware(),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
      return;
    }

    const { bucket } = req.body as { bucket?: string };

    if (!bucket) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Bucket name is required', { requestId: getRequestId(req) });
      return;
    }

    if (!isValidBucket(bucket)) {
      sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId: getRequestId(req) });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      sendErrorResponse(res, 400, 'NO_FILES_UPLOADED', 'No file provided', { requestId: getRequestId(req) });
      return;
    }

    try {
      const file = files[0]!;
      const uploadOptions: Parameters<typeof uploadFile>[0] = {
        bucket,
        userId,
        file: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
      };
      const result = await uploadFile(uploadOptions);

      if (!result.success) {
        sendErrorResponse(res, 400, 'FILE_UPLOAD_FAILED', result.error, { requestId: getRequestId(req) });
        return;
      }

      res.status(200).json({ success: true, url: result.url, path: result.path });
    } catch {
      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload file', { requestId: getRequestId(req) });
    }
  })
);

router.delete('/:bucket/*', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = (req.params as { 0?: string })[0] ?? '';

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId: getRequestId(req) });
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid file path', { requestId: getRequestId(req) });
    return;
  }

  try {
    // BLF-11.2: Ownership is verified server-side from the stored file name
    // (files are uploaded with a {userId}_ prefix), not from the raw path.
    const result = await deleteFile(bucket, filePath || userId, userId);
    if (!result.success) {
      const statusCode = result.error === 'FORBIDDEN' ? 403 : result.error === 'FILE_NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error === 'FORBIDDEN' ? 'FORBIDDEN' : 'FILE_DELETE_FAILED', result.error, { requestId: getRequestId(req) });
      return;
    }
    res.status(200).json({ success: true });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete file', { requestId: getRequestId(req) });
  }
}));

router.get('/signed-url/:bucket/*', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = (req.params as { 0?: string })[0] ?? '';

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId: getRequestId(req) });
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid file path', { requestId: getRequestId(req) });
    return;
  }

  try {
    // BLF-11.2: Ownership is verified server-side from the stored file name.
    const result = await getSignedUrl(bucket, filePath || userId, userId);
    if (!result.success) {
      const statusCode = result.error === 'FORBIDDEN' ? 403 : result.error === 'FILE_NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error === 'FORBIDDEN' ? 'FORBIDDEN' : 'SIGNED_URL_FAILED', result.error, { requestId: getRequestId(req) });
      return;
    }
    res.status(200).json({ success: true, url: result.url });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get signed URL', { requestId: getRequestId(req) });
  }
}));

router.get('/list/:bucket', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
    return;
  }

  const bucket = req.params['bucket'] as string;

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, { requestId: getRequestId(req) });
    return;
  }

  try {
    const result = await listUserFiles(bucket, userId);
    if (!result.success) {
      sendErrorResponse(res, 400, 'FILE_LIST_FAILED', result.error, { requestId: getRequestId(req) });
      return;
    }
    res.status(200).json({ success: true, files: result.files });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list files', { requestId: getRequestId(req) });
  }
}));

router.get('/quota', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
    return;
  }

  try {
    const result = await getFileQuota(userId);
    if (!result.success) {
      sendErrorResponse(res, 400, 'QUOTA_FAILED', result.error, { requestId: getRequestId(req) });
      return;
    }
    res.status(200).json({ success: true, used: result.used, limit: result.limit, percentage: result.percentage, files: result.files });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get file quota', { requestId: getRequestId(req) });
  }
}));

export default router;
