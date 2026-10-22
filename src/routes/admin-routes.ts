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
import { getEmployerProfileByUserId } from '../services/employer-profile-service.js';
import {
  listBusinessDocuments,
  getBusinessProfileCompleteness,
  listBusinessProfilesForAdmin,
  verifyBusinessProfileByAdmin,
  rejectBusinessProfileByAdmin,
  ADMIN_BUSINESS_PROFILE_STATUSES,
  type AdminBusinessProfileStatus,
} from '../services/employer-business-document-service.js';

const router = Router();

const USER_ROLES = ['freelancer', 'employer', 'admin'] as const;
const USER_STATUSES = ['active', 'suspended'] as const;
const KYC_STATUSES = ['not_started', 'pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired'] as const;
const DISPUTE_STATUSES = ['open', 'under_review', 'resolved'] as const;

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

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

  if (status !== undefined && !isOneOf(status, USER_STATUSES)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `Invalid status. Must be one of: ${USER_STATUSES.join(', ')}`, { requestId });
    return;
  }
  if (role !== undefined && !isOneOf(role, USER_ROLES)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `Invalid role. Must be one of: ${USER_ROLES.join(', ')}`, { requestId });
    return;
  }
  if (kycStatus !== undefined && !isOneOf(kycStatus, KYC_STATUSES)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `Invalid KYC status. Must be one of: ${KYC_STATUSES.join(', ')}`, { requestId });
    return;
  }
  if (emailVerified !== undefined && !isOneOf(emailVerified, ['true', 'false'] as const)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'emailVerified must be true or false', { requestId });
    return;
  }

  const filters: UserFilters = {};
  if (status) filters.status = status;
  if (role) filters.role = role;
  if (kycStatus) filters.kycStatus = kycStatus;
  if (emailVerified !== undefined) filters.emailVerified = emailVerified === 'true';
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
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { name, email, role, password, permissions, autoVerifyEmail, grantPro } = body;

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (grantPro !== undefined && typeof grantPro !== 'boolean') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'grantPro must be a boolean', { requestId });
    return;
  }
  if (autoVerifyEmail !== undefined && typeof autoVerifyEmail !== 'boolean') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'autoVerifyEmail must be a boolean', { requestId });
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
    grantPro: grantPro ?? true,
  }, adminUserId);

  if (!result.success) {
    const code = result.error?.code ?? 'UNKNOWN';
    const statusCode = code === 'DUPLICATE_EMAIL' ? 409
      : ['VALIDATION_ERROR', 'INVALID_EMAIL', 'INVALID_NAME', 'INVALID_ROLE', 'INVALID_PERMISSION', 'INVALID_PASSWORD', 'INVALID_PERMISSIONS'].includes(code) ? 400
      : 500;
    sendErrorResponse(res, statusCode, code, result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  res.status(201).json({
    user: mapAdminUser(result.data.user),
    plan: result.data.plan,
    emailSent: result.data.emailSent,
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
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { name, role, isActive } = body;
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
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
    sendErrorResponse(res, 400, 'INVALID_NAME', 'Name must be between 2 and 100 characters', { requestId });
    return;
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'isActive must be a boolean', { requestId });
    return;
  }
  if (name === undefined && role === undefined && isActive === undefined) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'At least one supported field is required', { requestId });
    return;
  }

  const updates: { name?: string; role?: string; isActive?: boolean } = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof role === 'string') updates.role = role;
  if (typeof isActive === 'boolean') updates.isActive = isActive;
  const result = await updateUser(userId, updates, adminUserId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  // Transform to frontend format
  res.status(200).json(mapAdminUser(result.data));
}));

/**
 * @swagger
 * /api/admin/users/{userId}/impersonate:
 *   post:
 *     summary: Sign in as / impersonate a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:userId/impersonate', authMiddleware, requirePermission('admin:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const adminUserId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { userRepository } = await import('../repositories/user-repository.js');
  const user = await userRepository.getUserById(userId);
  if (!user) {
    sendErrorResponse(res, 404, 'USER_NOT_FOUND', 'User not found', { requestId });
    return;
  }

  let sessionSecret: string;
  try {
    const { users } = await import('../config/appwrite.js');
    const session = await users.createSession(user.id);
    if (!session.secret) throw new Error('Appwrite returned an empty session secret');
    sessionSecret = session.secret;
  } catch {
    sendErrorResponse(res, 502, 'SESSION_CREATION_FAILED', 'Unable to create an impersonation session', { requestId });
    return;
  }

  res.status(200).json({
    user: mapAdminUser(user),
    accessToken: sessionSecret,
  });
}));

/**
 * @swagger
 * /api/admin/impersonate:
 *   post:
 *     summary: Sign in as / impersonate a user by ID or email
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/impersonate', authMiddleware, requirePermission('admin:manage'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const rawUserId = body.userId ?? body.id;
  const email = body.email;
  const requestId = getRequestId(req);

  if ((rawUserId !== undefined && typeof rawUserId !== 'string') || (email !== undefined && typeof email !== 'string')) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'userId and email must be strings', { requestId });
    return;
  }
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  if (!userId && !(typeof email === 'string' && email.trim())) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'A userId or email is required', { requestId });
    return;
  }

  const { userRepository } = await import('../repositories/user-repository.js');
  let user = userId ? await userRepository.getUserById(userId) : null;
  if (!user && email) {
    user = await userRepository.getUserByEmail(email.trim().toLowerCase());
  }
  if (!user) {
    sendErrorResponse(res, 404, 'USER_NOT_FOUND', 'User not found', { requestId });
    return;
  }

  let sessionSecret: string;
  try {
    const { users } = await import('../config/appwrite.js');
    const session = await users.createSession(user.id);
    if (!session.secret) throw new Error('Appwrite returned an empty session secret');
    sessionSecret = session.secret;
  } catch {
    sendErrorResponse(res, 502, 'SESSION_CREATION_FAILED', 'Unable to create an impersonation session', { requestId });
    return;
  }

  res.status(200).json({
    user: mapAdminUser(user),
    accessToken: sessionSecret,
  });
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
  const reason = req.body?.reason;
  const requestId = getRequestId(req);

  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500) {
    sendErrorResponse(res, 400, 'INVALID_REASON', 'Reason must be between 10 and 500 characters', { requestId });
    return;
  }

  const result = await suspendUser(userId, reason.trim(), adminUserId);

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

  if (status !== undefined && !isOneOf(status, DISPUTE_STATUSES)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `Invalid status. Must be one of: ${DISPUTE_STATUSES.join(', ')}`, { requestId });
    return;
  }

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
    sendErrorResponse(res, 400, result.error?.code ?? 'UNKNOWN', result.error?.message ?? 'An error occurred', { requestId });
    return;
  }

  const satisfactionRate = await getSatisfactionRate();

  res.status(200).json({
    ...result.data,
    totalPaidOut: result.data.totalTransactionVolume.toFixed(2),
    satisfactionRate,
  });
}));

/**
 * @swagger
 * /api/admin/employers/business-profiles:
 *   get:
 *     summary: List employer business profiles and documents on file (read-only)
 *     description: Every employer profile with completeness and document counts, including users currently acting as freelancers. Documents are not checked against BIR, DTI or SEC records.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile summaries and filter counts
 *       400:
 *         description: Invalid status filter
 */
router.get('/employers/business-profiles', authMiddleware, requirePermission('users:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : 'all';
  const search = typeof req.query['search'] === 'string' ? req.query['search'].trim().slice(0, 100) : '';

  if (!(ADMIN_BUSINESS_PROFILE_STATUSES as readonly string[]).includes(status)) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', `Status must be one of: ${ADMIN_BUSINESS_PROFILE_STATUSES.join(', ')}`, { requestId });
    return;
  }

  const result = await listBusinessProfilesForAdmin({
    status: status as AdminBusinessProfileStatus,
    ...(search ? { search } : {}),
  });
  res.status(200).json(result);
}));

/**
 * @swagger
 * /api/admin/employers/{userId}/business-profile:
 *   get:
 *     summary: View an employer's business information and documents (read-only)
 *     description: Documents are collected for transparency and are not checked against BIR, DTI or SEC records.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employer business profile, documents and completeness
 *       404:
 *         description: Employer profile not found
 */
router.get('/employers/:userId/business-profile', authMiddleware, requirePermission('users:view'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const userId = req.params['userId'] ?? '';

  const profileResult = await getEmployerProfileByUserId(userId);
  if (!profileResult.success) {
    sendErrorResponse(res, 404, profileResult.error.code, profileResult.error.message, { requestId });
    return;
  }

  const [documents, completeness] = await Promise.all([
    listBusinessDocuments(userId),
    getBusinessProfileCompleteness(userId),
  ]);

  res.status(200).json({
    profile: profileResult.data,
    documents,
    completeness: completeness.success ? completeness.data : null,
  });
}));

router.post('/employers/:userId/business-profile/verify', authMiddleware, requirePermission('users:manage', 'kyc:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const adminUserId = req.user?.userId;
  const targetUserId = req.params['userId'] ?? '';
  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
  const result = await verifyBusinessProfileByAdmin(adminUserId, targetUserId, notes);
  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }
  res.status(200).json({ success: true, profile: result.data.profile });
}));

router.post('/employers/:userId/business-profile/reject', authMiddleware, requirePermission('users:manage', 'kyc:manage'), apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const adminUserId = req.user?.userId;
  const targetUserId = req.params['userId'] ?? '';
  if (!adminUserId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }
  const notes = req.body?.notes;
  if (!notes || typeof notes !== 'string' || notes.trim().length < 5) {
    sendErrorResponse(res, 400, 'INVALID_NOTES', 'Please provide feedback notes explaining what the employer needs to correct (at least 5 characters)', { requestId });
    return;
  }
  const result = await rejectBusinessProfileByAdmin(adminUserId, targetUserId, notes);
  if (!result.success) {
    const statusCode = result.error.code === 'PROFILE_NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }
  res.status(200).json({ success: true, profile: result.data.profile });
}));

export default router;
