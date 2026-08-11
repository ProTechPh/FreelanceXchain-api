import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { getDashboardSummary } from '../services/dashboard-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get authenticated user's dashboard summary
 *     description: Aggregates unread notifications, active contracts, pending proposals, open projects, and average rating for the current user.
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadNotifications:
 *                   type: integer
 *                 activeContracts:
 *                   type: integer
 *                 pendingProposals:
 *                   type: integer
 *                 openProjects:
 *                   type: integer
 *                 averageRating:
 *                   type: number
 *                 reviewCount:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await getDashboardSummary(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
}));

export default router;
