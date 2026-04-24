import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { clampLimit, _clampOffset } from '../utils/index.js';
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getConversations(userId, { page, limit });

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const { receiverId, content, attachments } = req.body;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
    res.status(400).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = req.query['page'] ? Number(req.query['page']) : 1;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getConversationMessages(conversationId, userId, { page, limit });

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : result.error?.code === 'UNAUTHORIZED' ? 403 : 400;
    res.status(statusCode).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await markConversationAsRead(conversationId, userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getUnreadMessageCount(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ count: result.data });
});

export default router;
