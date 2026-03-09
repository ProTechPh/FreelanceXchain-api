import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { clampLimit, clampOffset } from '../utils/index.js';
import { MessageService } from '../services/message-service.js';

const router = Router();

/**
 * @swagger
 * /api/messages/{contractId}:
 *   get:
 *     summary: Get messages for a contract
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of messages
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not part of contract)
 *       404:
 *         description: Contract not found
 */
router.get('/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contractId = req.params.contractId as string;
    
    const limit = clampLimit(Number(req.query.limit as string));
    const offset = clampOffset(Number(req.query.offset as string));

    const messages = await MessageService.getMessages(contractId, userId, { limit, offset });
    
    // As a bonus, mark messages as read since they are being fetched
    await MessageService.markAsRead(contractId, userId).catch(console.error);

    res.json(messages);
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
});

/**
 * @swagger
 * /api/messages/{contractId}:
 *   post:
 *     summary: Send a message in a contract
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not part of contract)
 *       404:
 *         description: Contract not found
 */
router.post('/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const senderId = req.user!.id;
    const contractId = req.params.contractId as string;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
       res.status(400).json({ error: 'Message content is required' });
       return;
    }

    const message = await MessageService.sendMessage({
      contractId,
      senderId,
      content: content.trim()
    });

    res.status(201).json(message);
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

/**
 * @swagger
 * /api/messages/{contractId}/unread:
 *   get:
 *     summary: Get unread message count for a contract
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Unread message count
 *       401:
 *         description: Unauthorized
 */
router.get('/:contractId/unread', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contractId = req.params.contractId as string;

    const count = await MessageService.getUnreadCount(contractId, userId);
    res.json({ count });
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  }
});

/**
 * @swagger
 * /api/messages/{contractId}/summary:
 *   get:
 *     summary: Get conversation summary (latest message, unread count)
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation summary
 *       401:
 *         description: Unauthorized
 */
router.get('/:contractId/summary', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contractId = req.params.contractId as string;

    const summary = await MessageService.getConversationSummary(contractId, userId);
    res.json(summary);
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else {
      console.error('Error fetching conversation summary:', error);
      res.status(500).json({ error: 'Failed to fetch conversation summary' });
    }
  }
});

/**
 * @swagger
 * /api/messages/{contractId}/read:
 *   post:
 *     summary: Mark all messages in a contract as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Messages marked as read
 *       401:
 *         description: Unauthorized
 */
router.post('/:contractId/read', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contractId = req.params.contractId as string;

    await MessageService.markAsRead(contractId, userId);
    res.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: 'Failed to mark messages as read' });
    }
  }
});

export default router;
