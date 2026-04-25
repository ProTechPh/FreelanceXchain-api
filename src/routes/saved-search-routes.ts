import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import {
  createSavedSearch,
  getUserSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  executeSavedSearch,
} from '../services/saved-search-service.js';

const router = Router();

router.post('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const { name, searchType, filters, notifyOnNew } = req.body;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (!name || !searchType || !filters) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'name, searchType, and filters are required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await createSavedSearch(userId, { name, searchType, filters, notifyOnNew });

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const searchType = req.query['searchType'] as 'project' | 'freelancer' | undefined;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getUserSavedSearches(userId, searchType);

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

router.patch('/:id', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);
  const updates = req.body;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateSavedSearch(searchId, userId, updates);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.delete('/:id', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await deleteSavedSearch(searchId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ message: 'Saved search deleted' });
});

router.post('/:id/execute', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await executeSavedSearch(searchId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code, message: result.error?.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
