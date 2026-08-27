import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { listUserFiles, getFileQuota, deleteFile } from '../utils/storage-uploader.js';
import { BUCKETS, BucketId } from '../config/appwrite.js';
import { config } from '../config/env.js';
import { sendErrorResponse, sendSuccessResponse, getRequestId } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const ALLOWED_MANAGED_BUCKETS: BucketId[] = [
  BUCKETS.PORTFOLIO_IMAGES,
  BUCKETS.PROPOSAL_ATTACHMENTS,
  BUCKETS.PROJECT_ATTACHMENTS,
  BUCKETS.MILESTONE_DELIVERABLES,
  BUCKETS.DISPUTE_EVIDENCE,
];

function cleanFileName(rawName: string, userId: string): string {
  const prefixRegex = new RegExp(`^${userId}_[a-f0-9-]+_`);
  return rawName.replace(prefixRegex, '');
}

/**
 * GET /api/file-management
 * Lists files uploaded by the authenticated user across buckets
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const requestedBucket = req.query['bucket'] as string | undefined;
  const targetBuckets = requestedBucket
    ? (ALLOWED_MANAGED_BUCKETS.filter((b) => b === requestedBucket) as BucketId[])
    : ALLOWED_MANAGED_BUCKETS;

  try {
    const results = await Promise.all(
      targetBuckets.map(async (bucketId) => {
        const result = await listUserFiles(bucketId, userId);
        if (!result.success) return [];
        return result.files.map((file) => ({
          name: cleanFileName(file.name, userId),
          bucket: bucketId,
          path: file.$id,
          size: file.sizeOriginal || 0,
          createdAt: file.$createdAt,
          updatedAt: file.$updatedAt,
          publicUrl: `${config.appwrite.endpoint}/storage/buckets/${bucketId}/files/${file.$id}/view?project=${config.appwrite.projectId}`,
        }));
      })
    );

    const flatFiles = results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.status(200).json(flatFiles);
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve file list', { requestId });
  }
}));

/**
 * GET /api/file-management/quota
 * Returns storage usage and quota for the authenticated user
 */
router.get('/quota', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  try {
    const result = await getFileQuota(userId);
    if (!result.success) {
      sendErrorResponse(res, 400, 'QUOTA_FAILED', result.error || 'Failed to calculate quota', { requestId });
      return;
    }

    res.status(200).json({
      used: result.used,
      limit: result.limit,
      percentage: result.percentage,
      files: result.files,
    });
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve storage quota', { requestId });
  }
}));

/**
 * DELETE /api/file-management/:bucket/:path
 * Deletes a file owned by the authenticated user
 */
router.delete('/:bucket/:path', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { bucket, path: fileId } = req.params;
  if (!bucket || !fileId) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Bucket and file path are required', { requestId });
    return;
  }

  try {
    const result = await deleteFile(bucket as BucketId, fileId, userId);
    if (!result.success) {
      const statusCode = result.error === 'FORBIDDEN' ? 403 : result.error === 'FILE_NOT_FOUND' ? 404 : 400;
      sendErrorResponse(res, statusCode, result.error || 'FILE_DELETE_FAILED', result.error, { requestId });
      return;
    }

    sendSuccessResponse(res, 200, { message: 'File deleted successfully' }, requestId);
  } catch {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete file', { requestId });
  }
}));

export default router;
