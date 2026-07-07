import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendError, sendServiceError } from '../utils/response.js';
import { clampLimit } from '../utils/index.js';
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationAsRead,
  getUnreadMessageCount,
} from '../services/message-service.js';

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
router.get('/conversations', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getConversations(userId, { page, limit });

  if (!result.success) {
    sendError(res, 400, {
      code: result.error?.code ?? 'UNKNOWN',
      message: result.error?.message ?? 'An error occurred',
    }, requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     summary: Send message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.post('/send', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  const { receiverId, content, attachments } = req.body;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  if (!receiverId || !content) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'receiverId and content are required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await sendMessage({ senderId: userId, receiverId, content, attachments });

  if (!result.success) {
    sendError(res, 400, {
      code: result.error?.code ?? 'UNKNOWN',
      message: result.error?.message ?? 'An error occurred',
    }, requestId);
    return;
  }

  res.status(201).json(result.data);
});

/**
 * @swagger
 * /api/messages/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/:conversationId', authMiddleware, apiRateLimiter, validateUUID(['conversationId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const conversationId = req.params['conversationId'] ?? '';
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getConversationMessages(conversationId, userId, { page, limit });

  if (!result.success) {
    if (result.error) {
      sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    } else {
      sendError(res, 400, { code: 'UNKNOWN', message: 'An error occurred' }, requestId);
    }
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/read:
 *   patch:
 *     summary: Mark conversation as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/conversations/:conversationId/read', authMiddleware, apiRateLimiter, validateUUID(['conversationId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const conversationId = req.params['conversationId'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await markConversationAsRead(conversationId, userId);

  if (!result.success) {
    sendError(res, 400, {
      code: result.error?.code ?? 'UNKNOWN',
      message: result.error?.message ?? 'An error occurred',
    }, requestId);
    return;
  }

  res.status(200).json({ message: 'Conversation marked as read' });
});

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: Get unread message count
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 */
router.get('/unread-count', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getUnreadMessageCount(userId);

  if (!result.success) {
    sendError(res, 400, {
      code: result.error?.code ?? 'UNKNOWN',
      message: result.error?.message ?? 'An error occurred',
    }, requestId);
    return;
  }

  res.status(200).json({ count: result.data });
});

export default router;
