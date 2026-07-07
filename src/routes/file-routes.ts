import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendError, sendServiceError, sendValidationError } from '../utils/response.js';
import {
  getUserFiles,
  deleteFile,
  getFileQuota,
} from '../services/file-service.js';

const router = Router();

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const bucket = req.query['bucket'] as string | undefined;

  /* istanbul ignore next */
  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getUserFiles(userId, bucket);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.delete('/:bucket/:path', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { bucket, path } = req.params;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  if (!bucket || !path) {
    sendValidationError(res, 'bucket and path are required', requestId);
    return;
  }

  const result = await deleteFile(userId, bucket, path);

  if (!result.success) {
    sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json({ message: 'File deleted' });
});

router.get('/quota', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  /* istanbul ignore next */
  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getFileQuota(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
