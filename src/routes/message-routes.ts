import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId, validate, sendMessageSchema } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import { clampLimit } from '../utils/index.js';
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationAsRead,
  getUnreadMessageCount,
} from '../services/message-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     summary: Get user conversations
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getConversations(userId, { page, limit });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     summary: Send message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.post('/send', authMiddleware, apiRateLimiter, validate(sendMessageSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  const { receiverId, content, attachments } = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // receiverId/content presence is enforced by the middleware (sendMessageSchema).
  const result = await sendMessage({ senderId: userId, receiverId, content, attachments });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(201).json(result.data);
}));

/**
 * @swagger
 * /api/messages/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/:conversationId', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(['conversationId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const conversationId = req.params['conversationId'] ?? '';
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getConversationMessages(conversationId, userId, { page, limit });

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    sendErrorResponse(res, statusCode, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/read:
 *   patch:
 *     summary: Mark conversation as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/conversations/:conversationId/read', authMiddleware, apiRateLimiter, validateAppwriteDocumentId(['conversationId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const conversationId = req.params['conversationId'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await markConversationAsRead(conversationId, userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Conversation marked as read' }, requestId);
}));

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: Get unread message count
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.get('/unread-count', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getUnreadMessageCount(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json({ count: result.data });
}));

export default router;
