import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole, requirePermission } from '../middleware/auth-middleware.js';
import { validateAppwriteDocumentId } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import type { AdminPermission } from '../models/user.js';

import {
  getPlatformStats,
  getUserManagement,
  suspendUser,
  unsuspendUser,
  verifyUser,
  updateUser,
  updateAdminPermissions,
  inviteOrAddUser,
  getDisputeManagement,
  getSystemHealth,
  getSatisfactionRate,
  type UserFilters,
  type DisputeFilters,
} from '../services/admin-service.js';
import type { UserEntity } from '../repositories/user-repository.js';
import { getAdminAnalytics } from '../services/analytics-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/** Transform a user entity into the admin frontend shape */
function mapAdminUser(user: (UserEntity & { kyc_verified?: boolean; kyc_status?: string; email_verified?: boolean; permissions?: string[] }) | null | undefined) {
  if (!user) return null;

  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : typeof user.permissions === 'string' && (user.permissions as string).trim()
      ? (() => { try { const p = JSON.parse(user.permissions as string); return Array.isArray(p) ? p : []; } catch { return []; } })()
      : (user.role === 'admin' ? ['*'] : []);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    walletAddress: user.wallet_address || '',
    createdAt: user.created_at,
    name: user.name || '',
    kycVerified: Boolean(user.kyc_verified),
    kycStatus: user.kyc_status ?? (user.kyc_verified ? 'approved' : 'not_started'),
    emailVerified: Boolean(user.email_verified),
    isActive: !user.is_suspended, // Active means NOT suspended
    permissions,
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
router.get('/stats', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getPlatformStats();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get admin analytics dashboard metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/analytics', authMiddleware, requirePermission('analytics:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getAdminAnalytics();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get user management data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', authMiddleware, requirePermission('users:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const status = req.query['status'] as string | undefined;
  const role = req.query['role'] as string | undefined;
  const kycStatus = req.query['kycStatus'] as string | undefined;
  const emailVerified = req.query['emailVerified'] as string | undefined;

  const filters: UserFilters = {};
  if (status) filters.status = status;
  if (role) filters.role = role;
  if (kycStatus) filters.kycStatus = kycStatus;
  if (emailVerified !== undefined) filters.emailVerified = emailVerified;
  const result = await getUserManagement(filters);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  // Transform database entities to frontend format
  res.status(200).json({
    users: result.data.users.map(mapAdminUser),
    total: result.data.total,
  });
}));

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create or invite a new user (freelancer, employer, or admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users', authMiddleware, requirePermission('users:manage'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = req.user?.userId;
  const requestId = getRequestId(req);
  const { name, email, role, password, permissions, autoVerifyEmail } = req.body;

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Privilege escalation check:
  // Creating an 'admin' account strictly requires 'admin:manage' (Super Admin).
  // Sub-admins with only 'users:manage' are blocked from creating administrators.
  if (role === 'admin') {
    const userPerms = req.user?.permissions as AdminPermission[] | undefined;
    const isSuperAdmin = !userPerms || userPerms.length === 0 || (userPerms as string[]).includes('*') || userPerms.includes('admin:manage');
    if (!isSuperAdmin) {
      sendErrorResponse(res, 403, 'INSUFFICIENT_PERMISSIONS', 'Only super administrators with admin:manage permission can create admin accounts', { requestId });
      return;
    }
  }

  const result = await inviteOrAddUser({
    name,
    email,
    role,
    password,
    permissions,
    autoVerifyEmail: autoVerifyEmail ?? true,
  }, adminUserId);

  if (!result.success) {
    const code = result.error?.code ?? 'UNKNOWN';
    const statusCode = code === 'DUPLICATE_EMAIL' ? 409
      : ['INVALID_EMAIL', 'INVALID_NAME', 'INVALID_ROLE', 'INVALID_PERMISSION', 'INVALID_PASSWORD', 'INVALID_PERMISSIONS'].includes(code) ? 400
      : 500;
    sendErrorResponse(res, statusCode, code, result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(201).json({
    user: mapAdminUser(result.data.user),
    ...(result.data.temporaryPassword !== undefined ? { temporaryPassword: result.data.temporaryPassword } : {}),
  });
}));

/**
 * @swagger
 * /api/admin/users/{userId}:
 *   patch:
 *     summary: Update user information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:userId', authMiddleware, requirePermission('users:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const adminUserId = req.user?.userId;
  const { name, role, isActive } = req.body;
  const requestId = getRequestId(req);

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const validRoles = ['freelancer', 'employer'];
  if (role !== undefined && !validRoles.includes(role)) {
    sendErrorResponse(res, 400, 'INVALID_ROLE', `Invalid role. Must be one of: ${validRoles.join(', ')}`, { requestId });
    return;
  }

  const result = await updateUser(userId, { name, role, isActive }, adminUserId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  // Transform to frontend format
  res.status(200).json(mapAdminUser(result.data));
}));

/**
 * @swagger
 * /api/admin/users/{userId}/suspend:
 *   post:
 *     summary: Suspend user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/suspend', authMiddleware, requirePermission('users:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const adminUserId = req.user?.userId;
  const { reason } = req.body;
  const requestId = getRequestId(req);

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await suspendUser(userId, reason, adminUserId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/users/{userId}/unsuspend:
 *   post:
 *     summary: Unsuspend user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/unsuspend', authMiddleware, requirePermission('users:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const adminUserId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await unsuspendUser(userId, adminUserId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/users/{userId}/verify:
 *   post:
 *     summary: Manually verify user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 500
 *                 description: Audit reason for the manual KYC approval
 * */
router.post('/users/:userId/verify', authMiddleware, requirePermission('kyc:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = getRequestId(req);
  const adminUserId = req.user?.userId;
  const submittedReason = req.body?.reason;

  if (!adminUserId) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  if (
    submittedReason !== undefined &&
    (typeof submittedReason !== 'string' || submittedReason.trim().length < 10 || submittedReason.trim().length > 500)
  ) {
    sendErrorResponse(res, 400, 'INVALID_REASON', 'Reason must be between 10 and 500 characters', { requestId });
    return;
  }

  const reason = typeof submittedReason === 'string'
    ? submittedReason.trim()
    : 'Manual verification approved by administrator';

  const result = await verifyUser(userId, adminUserId, reason);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND'
      ? 404
      : result.error?.code === 'SELF_REVIEW_FORBIDDEN'
        ? 403
        : ['DATABASE_ERROR', 'INTERNAL_ERROR'].includes(result.error?.code ?? '')
          ? 500
          : 400;
    sendErrorResponse(res, statusCode, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/users/{userId}/permissions:
 *   patch:
 *     summary: Update granular permissions for an admin user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/users/:userId/permissions', authMiddleware, requirePermission('admin:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const adminUserId = req.user?.userId;
  const requestId = getRequestId(req);
  const { permissions } = req.body;

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (!Array.isArray(permissions)) {
    sendErrorResponse(res, 400, 'INVALID_PERMISSIONS', 'Permissions must be an array of permission strings', { requestId });
    return;
  }

  const result = await updateAdminPermissions(userId, permissions as AdminPermission[], adminUserId);

  if (!result.success) {
    const statusCode = result.error?.code === 'NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(mapAdminUser(result.data));
}));

/**
 * @swagger
 * /api/admin/disputes:
 *   get:
 *     summary: Get dispute management dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/disputes', authMiddleware, requirePermission('disputes:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const status = req.query['status'] as string | undefined;

  const filters: DisputeFilters = {};
  if (status) filters.status = status;
  const result = await getDisputeManagement(filters);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/system/health:
 *   get:
 *     summary: Get system health metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/system/health', authMiddleware, requirePermission('system:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getSystemHealth();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/admin/platform-stats:
 *   get:
 *     summary: Get platform stats (users, projects, contracts, etc)
 *     tags: [Admin]
 *     description: Used on the landing page and admin dashboard to show aggregate platform statistics. Open to public.
 */
router.get('/platform-stats', authMiddleware, requireRole('admin'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);

  const result = await getPlatformStats();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code ?? 'UNKNOWN', result.error.message ?? 'An error occurred', { requestId });
    return;
  }

  const satisfactionRate = await getSatisfactionRate();

  res.status(200).json({
    ...result.data,
    totalPaidOut: result.data.totalTransactionVolume.toFixed(2),
    satisfactionRate,
  });
}));

export default router;
