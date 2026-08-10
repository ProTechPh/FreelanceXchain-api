import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { reviewRepository } from '../repositories/review-repository.js';

import {
  getPlatformStats,
  getUserManagement,
  suspendUser,
  unsuspendUser,
  verifyUser,
  updateUser,
  getDisputeManagement,
  getSystemHealth,
  type UserFilters,
  type DisputeFilters,
} from '../services/admin-service.js';
import type { UserEntity } from '../repositories/user-repository.js';
import { getAdminAnalytics } from '../services/analytics-service.js';

const router = Router();

/** Transform a user entity into the admin frontend shape */
function mapAdminUser(user: UserEntity | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    walletAddress: user.wallet_address || '',
    createdAt: user.created_at,
    name: user.name || '',
    kycVerified: false, // TODO: Join with KYC table
    isActive: !user.is_suspended, // Active means NOT suspended
  };
}

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get platform statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getPlatformStats();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get admin analytics dashboard metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getAdminAnalytics();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get user management data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const status = req.query['status'] as string | undefined;
  const role = req.query['role'] as string | undefined;

  const filters: UserFilters = {};
  if (status) filters.status = status;
  if (role) filters.role = role;
  const result = await getUserManagement(filters);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  // Transform database entities to frontend format
  res.status(200).json({
    users: result.data.users.map(mapAdminUser),
    total: result.data.total,
  });
});

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   patch:
 *     summary: Update user information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:userId', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const { name, role, isActive } = req.body;
  const requestId = getRequestId(req);

  const validRoles = ['freelancer', 'employer'];
  if (role !== undefined && !validRoles.includes(role)) {
    sendErrorResponse(res, 400, 'INVALID_ROLE', `Invalid role. Must be one of: ${validRoles.join(', ')}`, requestId);
    return;
  }

  const result = await updateUser(userId, { name, role, isActive });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  // Transform to frontend format
  res.status(200).json(mapAdminUser(result.data));
});

/**
 * @swagger
 * /api/admin/users/{userId}/suspend:
 *   post:
 *     summary: Suspend user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/suspend', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const { reason } = req.body;
  const requestId = getRequestId(req);

  const result = await suspendUser(userId, reason);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/users/{userId}/unsuspend:
 *   post:
 *     summary: Unsuspend user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/unsuspend', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = getRequestId(req);

  const result = await unsuspendUser(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/users/{userId}/verify:
 *   post:
 *     summary: Manually verify user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/verify', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = getRequestId(req);

  const result = await verifyUser(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/disputes:
 *   get:
 *     summary: Get dispute management dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/disputes', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const status = req.query['status'] as string | undefined;

  const filters: DisputeFilters = {};
  if (status) filters.status = status;
  const result = await getDisputeManagement(filters);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/system/health:
 *   get:
 *     summary: Get system health metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/system/health', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getSystemHealth();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', requestId);
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/admin/platform-stats:
 *   get:
 *     summary: Get platform stats (users, projects, contracts, etc)
 *     tags: [Admin]
 *     description: Used on the landing page and admin dashboard to show aggregate platform statistics. Open to public.
 */
router.get('/platform-stats', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getPlatformStats();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code ?? 'UNKNOWN', result.error.message ?? 'An error occurred', requestId);
    return;
  }

  let satisfactionRate = 0;
  try {
    const reviews = await reviewRepository.getAllReviews();
    const positive = reviews.filter(r => r.rating >= 4.0).length;
    const total = reviews.length;
    satisfactionRate = total > 0 ? Math.round((positive / total) * 100) : 0;
  } catch {
    satisfactionRate = 0;
  }

  res.status(200).json({
    ...result.data,
    totalPaidOut: result.data.totalTransactionVolume.toFixed(2),
    satisfactionRate,
  });
});

export default router;
