import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  getUserFiles,
  deleteFile,
  getFileQuota,
} from '../services/file-service.js';

const router = Router();

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const bucket = req.query['bucket'] as string | undefined;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!bucket || !path) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'bucket and path are required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await deleteFile(userId, bucket, path);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ message: 'File deleted' });
});

router.get('/quota', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
