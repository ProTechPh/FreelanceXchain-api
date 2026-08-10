import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  isFavorited,
} from '../services/favorite-service.js';

const router = Router();

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Add favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.body;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  if (!targetType || !targetId) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'targetType and targetId are required', requestId);
    return;
  }

  const result = await addFavorite(userId, targetType, targetId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, requestId);
    return;
  }

  res.status(201).json(result.data);
});


/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get user favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const targetType = req.query['targetType'] as 'project' | 'freelancer' | undefined;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await getUserFavorites(userId, targetType);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/favorites/{targetType}/{targetId}:
 *   delete:
 *     summary: Remove favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:targetType/:targetId', authMiddleware, apiRateLimiter, validateUUID(['targetId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.params;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await removeFavorite(userId, targetType as 'project' | 'freelancer', targetId ?? '');

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, requestId);
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Favorite removed' }, requestId);
});

/**
 * @swagger
 * /api/favorites/check/{targetType}/{targetId}:
 *   get:
 *     summary: Check if favorited
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.get('/check/:targetType/:targetId', authMiddleware, apiRateLimiter, validateUUID(['targetId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.params;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await isFavorited(userId, targetType as 'project' | 'freelancer', targetId ?? '');

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, requestId);
    return;
  }

  res.status(200).json({ isFavorited: result.data });
});

export default router;
