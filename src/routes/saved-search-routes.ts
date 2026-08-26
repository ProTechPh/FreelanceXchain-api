import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import {
  createSavedSearch,
  getUserSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  executeSavedSearch,
} from '../services/saved-search-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const { name, searchType, filters, notifyOnNew } = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (!name || !searchType || !filters) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'name, searchType, and filters are required', { requestId });
    return;
  }

  const result = await createSavedSearch(userId, { name, searchType, filters, notifyOnNew });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(201).json(result.data);
}));

router.get('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const searchType = req.query['searchType'] as 'project' | 'freelancer' | undefined;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getUserSavedSearches(userId, searchType);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.patch('/:id', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);
  const updates = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await updateSavedSearch(searchId, userId, updates);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.delete('/:id', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await deleteSavedSearch(searchId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error?.code, result.error?.message, { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Saved search deleted' }, requestId);
}));

router.post('/:id/execute', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const searchId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await executeSavedSearch(searchId, userId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

export default router;
