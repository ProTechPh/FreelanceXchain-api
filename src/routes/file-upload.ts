import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { createFileUploadMiddleware } from '../middleware/file-upload-middleware.js';
import { fileUploadRateLimiter } from '../middleware/rate-limiter.js';
import { uploadFile, deleteFile, getSignedUrl, listUserFiles } from '../utils/storage-uploader.js';
import { sendErrorResponse, getRequestId } from '../utils/response-helpers.js';

const router = Router();

const ALLOWED_BUCKETS = [
  'profile-images',
  'contract-documents',
  'proposal-attachments',
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
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
      return;
    }

    const { bucket, folder } = req.body as { bucket?: string; folder?: string };

    if (!bucket) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Bucket name is required', getRequestId(req));
      return;
    }

    if (!isValidBucket(bucket)) {
      sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, getRequestId(req));
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      sendErrorResponse(res, 400, 'NO_FILES_UPLOADED', 'No file provided', getRequestId(req));
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
      // BLF-11.1: Sanitize folder parameter to prevent path traversal
      if (folder) {
        const sanitizedFolder = folder
          .replace(/\.\./g, '')           // Remove traversal sequences
          .replace(/[^a-zA-Z0-9/_-]/g, '') // Only allow safe characters
          .replace(/^\/+|\/+$/g, '');       // Trim leading/trailing slashes
        if (sanitizedFolder) {
          uploadOptions.folder = sanitizedFolder;
        }
      }
      const result = await uploadFile(uploadOptions);

      if (!result.success) {
        sendErrorResponse(res, 400, 'FILE_UPLOAD_FAILED', result.error, getRequestId(req));
        return;
      }

      res.status(200).json({ success: true, url: result.url, path: result.path });
    } catch {
      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to upload file', getRequestId(req));
    }
  }
);

router.delete('/:bucket/*', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = (req.params as { 0?: string })[0] ?? '';

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, getRequestId(req));
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid file path', getRequestId(req));
    return;
  }

  try {
    // BLF-11.2: Ownership is verified server-side from the stored file name
    // (files are uploaded with a {userId}_ prefix), not from the raw path.
    const result = await deleteFile(bucket, filePath || userId, userId);
    if (!result.success) {
      const statusCode = result.error === 'FORBIDDEN' ? 403 : result.error === 'FILE_NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error === 'FORBIDDEN' ? 'FORBIDDEN' : 'FILE_DELETE_FAILED', result.error, getRequestId(req));
      return;
    }
    res.status(200).json({ success: true });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete file', getRequestId(req));
  }
});

router.get('/signed-url/:bucket/*', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
    return;
  }

  const bucket = req.params['bucket'] as string;
  const filePath = (req.params as { 0?: string })[0] ?? '';

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, getRequestId(req));
    return;
  }

  if (filePath.includes('..') || filePath.includes('\\')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid file path', getRequestId(req));
    return;
  }

  try {
    // BLF-11.2: Ownership is verified server-side from the stored file name.
    const result = await getSignedUrl(bucket, filePath || userId, userId);
    if (!result.success) {
      const statusCode = result.error === 'FORBIDDEN' ? 403 : result.error === 'FILE_NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error === 'FORBIDDEN' ? 'FORBIDDEN' : 'SIGNED_URL_FAILED', result.error, getRequestId(req));
      return;
    }
    res.status(200).json({ success: true, url: result.url });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get signed URL', getRequestId(req));
  }
});

router.get('/list/:bucket', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', getRequestId(req));
    return;
  }

  const bucket = req.params['bucket'] as string;

  if (!isValidBucket(bucket)) {
    sendErrorResponse(res, 400, 'INVALID_BUCKET', `Invalid bucket: ${bucket}`, getRequestId(req));
    return;
  }

  const folder = req.query['folder'] as string | undefined;

  try {
    const listOptions: Parameters<typeof listUserFiles> = [bucket, userId];
    if (folder) listOptions.push(folder);
    const result = await listUserFiles(...listOptions);
    if (!result.success) {
      sendErrorResponse(res, 400, 'FILE_LIST_FAILED', result.error, getRequestId(req));
      return;
    }
    res.status(200).json({ success: true, files: result.files });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to list files', getRequestId(req));
  }
});

export default router;
