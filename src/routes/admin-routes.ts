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
  getDisputeManagement,
  getSystemHealth,
} from '../services/admin-service.js';

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

export default router;
