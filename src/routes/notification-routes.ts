import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import {
  getNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from '../services/notification-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         type:
 *           type: string
 *           enum: [proposal_received, proposal_accepted, proposal_rejected, milestone_submitted, milestone_approved, payment_released, dispute_created, dispute_resolved, rating_received]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           additionalProperties: true
 *         isRead:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Retrieves all notifications for the authenticated user, sorted by creation time (newest first)
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: maxItemCount
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of notifications to return
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for pagination
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *                 continuationToken:
 *                   type: string
 *                 hasMore:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
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

  const maxItemCount = req.query['maxItemCount'] 
    ? parseInt(req.query['maxItemCount'] as string, 10) 
    : undefined;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  const options = {
    ...(maxItemCount && { maxItemCount }),
    ...(continuationToken && { continuationToken }),
  };

  const result = await getNotificationsByUser(userId, options);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     description: Returns the count of unread notifications for the authenticated user
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
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

  const result = await getUnreadCount(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({ count: result.data });
});


/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     description: Marks a specific notification as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Notification ID (UUID)
 *     responses:
 *       200:
 *         description: Notification marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', authMiddleware, validateUUID(), async (req: Request, res: Response) => {
  const notificationId = req.params['id'] ?? '';
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

  const result = await markNotificationAsRead(notificationId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     description: Marks all notifications for the authenticated user as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of notifications marked as read
 *       401:
 *         description: Unauthorized
 */
router.patch('/read-all', authMiddleware, async (req: Request, res: Response) => {
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

  const result = await markAllNotificationsAsRead(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
