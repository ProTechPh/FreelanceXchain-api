import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import {
  addFavorite,
  removeFavorite,
  getUserFavorites,
  isFavorited,
} from '../services/favorite-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Add a project or freelancer to favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetType
 *               - targetId
 *             properties:
 *               targetType:
 *                 type: string
 *                 enum: [project, freelancer]
 *               targetId:
 *                 type: string
 *                 description: Target ID (project ID or freelancer ID)
 *     responses:
 *       201:
 *         description: Added to favorites
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Already favorited
 */
router.post('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.body;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (!targetType || !['project', 'freelancer'].includes(targetType)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'targetType must be either "project" or "freelancer"', { requestId });
    return;
  }

  if (!targetId || typeof targetId !== 'string') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'targetId is required', { requestId });
    return;
  }

  const result = await addFavorite(userId, targetType, targetId);

  if (!result.success) {
    const statusCode = result.error?.code === 'DUPLICATE_FAVORITE' ? 409 : 400;
    sendErrorResponse(res, statusCode, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(201).json(result.data);
}));

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get user favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: targetType
 *         schema:
 *           type: string
 *           enum: [project, freelancer]
 *     responses:
 *       200:
 *         description: List of favorites
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const targetType = req.query['targetType'] as 'project' | 'freelancer' | undefined;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getUserFavorites(userId, targetType);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/favorites/{targetType}/{targetId}:
 *   delete:
 *     summary: Remove favorite
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:targetType/:targetId', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(['targetId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.params;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await removeFavorite(userId, targetType as 'project' | 'freelancer', targetId ?? '');

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json({ message: 'Favorite removed' });
}));

/**
 * @swagger
 * /api/favorites/check/{targetType}/{targetId}:
 *   get:
 *     summary: Check if favorited
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 */
router.get('/check/:targetType/:targetId', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(['targetId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const { targetType, targetId } = req.params;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await isFavorited(userId, targetType as 'project' | 'freelancer', targetId ?? '');

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code, result.error?.message, { requestId });
    return;
  }

  res.status(200).json({ isFavorited: result.data });
}));

export default router;
