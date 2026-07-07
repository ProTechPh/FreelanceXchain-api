import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendError, sendServiceError, sendValidationError } from '../utils/response.js';
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
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  if (!name || !searchType || !filters) {
    sendValidationError(res, 'name, searchType, and filters are required', requestId);
    return;
  }

  const result = await createSavedSearch(userId, { name, searchType, filters, notifyOnNew });

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
    return;
  }

  res.status(201).json(result.data);
});

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const searchType = req.query['searchType'] as 'project' | 'freelancer' | undefined;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getUserSavedSearches(userId, searchType);

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
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
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await updateSavedSearch(searchId, userId, updates);

  if (!result.success) {
    sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json(result.data);
});

router.delete('/:id', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await deleteSavedSearch(searchId, userId);

  if (!result.success) {
    sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json({ message: 'Saved search deleted' });
});

router.post('/:id/execute', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await executeSavedSearch(searchId, userId);

  if (!result.success) {
    sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
