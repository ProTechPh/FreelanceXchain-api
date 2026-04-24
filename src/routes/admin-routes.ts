import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';

import {
  getPlatformStats,
  getUserManagement,
  suspendUser,
  unsuspendUser,
  verifyUser,
  updateUser,
  getDisputeManagement,
  getSystemHealth,
} from '../services/admin-service.js';
import { getAdminAnalytics } from '../services/analytics-service.js';

const router = Router();

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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getPlatformStats();

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
 * /api/admin/analytics:
 *   get:
 *     summary: Get admin analytics dashboard metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getAdminAnalytics();

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
 * /api/admin/users:
 *   get:
 *     summary: Get user management data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const status = req.query['status'] as string | undefined;
  const role = req.query['role'] as string | undefined;

  const filters: any = {};
  if (status) filters.status = status;
  if (role) filters.role = role;
  const result = await getUserManagement(filters);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code ?? 'UNKNOWN', message: result.error.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Transform database entities to frontend format
  const transformedUsers = result.data.users.map((user: any) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    walletAddress: user.wallet_address || '',
    createdAt: user.created_at,
    name: user.name || '',
    kycVerified: false, // TODO: Join with KYC table
    isActive: !user.is_suspended, // Active means NOT suspended
  }));

  res.status(200).json({
    users: transformedUsers,
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const validRoles = ['freelancer', 'employer', 'admin'];
  if (role !== undefined && !validRoles.includes(role)) {
    res.status(400).json({
      error: { code: 'INVALID_ROLE', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await updateUser(userId, { name, role, isActive });

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error?.code ?? 'UNKNOWN', message: result.error?.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Transform to frontend format
  const user = result.data;
  res.status(200).json({
    id: user?.id,
    email: user?.email,
    role: user?.role,
    walletAddress: user?.wallet_address || '',
    createdAt: user?.created_at,
    name: user?.name || '',
    kycVerified: false,
    isActive: !user?.is_suspended,
  });
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
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await suspendUser(userId, reason);

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
 * /api/admin/users/{userId}/unsuspend:
 *   post:
 *     summary: Unsuspend user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/unsuspend', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await unsuspendUser(userId);

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
 * /api/admin/users/{userId}/verify:
 *   post:
 *     summary: Manually verify user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/verify', authMiddleware, requireRole('admin'), apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await verifyUser(userId);

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
 * /api/admin/disputes:
 *   get:
 *     summary: Get dispute management dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/disputes', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const status = req.query['status'] as string | undefined;

  const filters: any = {};
  if (status) filters.status = status;
  const result = await getDisputeManagement(filters);

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
 * /api/admin/system/health:
 *   get:
 *     summary: Get system health metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/system/health', authMiddleware, requireRole('admin'), apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getSystemHealth();

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
 * /api/admin/platform-stats:
 *   get:
 *     summary: Get platform stats (users, projects, contracts, etc)
 *     tags: [Admin]
 *     description: Used on the landing page and admin dashboard to show aggregate platform statistics. Open to public.
 */
router.get('/platform-stats', apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getPlatformStats();

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code ?? 'UNKNOWN', message: result.error.message ?? 'An error occurred' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({
    ...result.data,
    totalPaidOut: result.data.totalTransactionVolume.toFixed(2),
    satisfactionRate: 100,
  });
});

export default router;
