import { logger } from '../config/logger.js';
import { UserEntity } from '../repositories/user-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { transactionRepository } from '../repositories/transaction-repository.js';
import { reviewRepository } from '../repositories/review-repository.js';
import { auditLogRepository, CreateAuditLogEntry } from '../repositories/audit-log-repository.js';
import {
  createKycVerification,
  getKycVerificationByUserId,
  updateKycVerification,
} from '../repositories/didit-kyc-repository.js';
import type { KycVerification } from '../models/didit-kyc.js';
import { Dispute, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import crypto from 'crypto';
import { generateId } from '../utils/id.js';
import { users, Query, ID } from '../config/appwrite.js';
import { ADMIN_PERMISSIONS, type AdminPermission } from '../models/user.js';

interface PlatformStats {
  totalUsers: number;
  totalFreelancers: number;
  totalEmployers: number;
  totalProjects: number;
  totalContracts: number;
  totalDisputes: number;
  totalTransactionVolume: number;
  activeProjects: number;
  completedProjects: number;
  averageProjectBudget: number;
}

export interface UserFilters {
  role?: string;
  status?: string;
  kycStatus?: string;
  emailVerified?: boolean | string;
  search?: string;
}

interface UserManagementData {
  users: Array<UserEntity & {
    kyc_status: KycVerification['status'] | 'not_started';
    kyc_verified: boolean;
    email_verified: boolean;
  }>;
  total: number;
}

export interface DisputeFilters {
  status?: string;
  priority?: string;
}

interface DisputeManagementData {
  disputes: Dispute[];
  total: number;
  pendingCount: number;
  resolvedCount: number;
}

interface SystemHealth {
  database: 'healthy' | 'unhealthy';
  storage: 'healthy' | 'unhealthy';
  uptime: number;
  timestamp: string;
}

/**
 * Persist a durable audit log entry for a privileged admin action (BLF-12.2).
 * Best-effort: a failed audit write must never break the admin action itself,
 * so failures are logged (the structured logger already captured the event)
 * and swallowed.
 */
async function recordAdminAudit(input: {
  actorId: string;
  targetUserId: string;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const entry: CreateAuditLogEntry = {
    user_id: input.targetUserId,
    actor_id: input.actorId,
    action: input.action,
    resource_type: 'user',
    resource_id: input.targetUserId,
    payload: input.payload ?? {},
    ip_address: null,
    user_agent: null,
    status: 'success',
    error_message: null,
  };
  try {
    await auditLogRepository.create(entry);
  } catch (error) {
    logger.error('Failed to persist admin audit log entry', { error, entry: input });
  }
}

/**
 * Get platform-wide statistics
 */
export async function getPlatformStats(): Promise<ServiceResult<PlatformStats>> {
  try {
    const [allUsers, allProjects, allContracts, allDisputes, allTransactions] = await Promise.all([
      userRepository.queryAll(),
      projectRepository.queryAll(),
      contractRepository.queryAll(),
      disputeRepository.queryAll(),
      transactionRepository.queryAll(),
    ]);

    const totalUsers = allUsers.length;
    const totalFreelancers = allUsers.filter(u => u.role === 'freelancer').length;
    const totalEmployers = allUsers.filter(u => u.role === 'employer').length;

    const totalProjects = allProjects.length;
    const activeProjects = allProjects.filter(p => p.status === 'open' || p.status === 'in_progress').length;
    const completedProjects = allProjects.filter(p => p.status === 'completed').length;
    const budgets = allProjects.reduce<number[]>((acc, p) => {
      if (typeof p.budget === 'number') acc.push(p.budget);
      return acc;
    }, []);
    const averageProjectBudget = budgets.length > 0
      ? Math.round((budgets.reduce((sum, b) => sum + b, 0) / budgets.length) * 100) / 100
      : 0;

    const totalContracts = allContracts.length;
    const totalDisputes = allDisputes.length;

    const completedTransactions = allTransactions.filter(t => t.status === 'completed');
    const totalTransactionVolume = Math.round(
      completedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) * 100
    ) / 100;

    return successResult({
      totalUsers,
      totalFreelancers,
      totalEmployers,
      totalProjects,
      totalContracts,
      totalDisputes,
      totalTransactionVolume,
      activeProjects,
      completedProjects,
      averageProjectBudget,
    });
      } catch (error) {
      logger.error('Unexpected error in getPlatformStats', { error });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}

/**
 * Get user management data with filters
 */
export async function getUserManagement(filters?: UserFilters): Promise<ServiceResult<UserManagementData>> {
  try {
    const allUsers = await userRepository.queryAll('$createdAt');
    const appwriteUsersMap = new Map<string, boolean>();
    try {
      if (users && typeof users.list === 'function') {
        const listRes = await users.list([Query.limit(100)]);
        if (listRes?.users && Array.isArray(listRes.users)) {
          for (const u of listRes.users) {
            appwriteUsersMap.set(u.$id, Boolean(u.emailVerification));
          }
        }
      }
    } catch {
      // In tests or if users.list fails, fallback to per-user lookup
    }

    const usersWithKyc = await Promise.all(allUsers.map(async (user) => {
      const verificationPromise = getKycVerificationByUserId(user.id).catch(() => null);

      let emailVerified = appwriteUsersMap.has(user.id)
        ? appwriteUsersMap.get(user.id)!
        : Boolean((user as any).email_verified ?? (user as any).emailVerification ?? false);

      if (!appwriteUsersMap.has(user.id) && !emailVerified) {
        try {
          if (users && typeof users.get === 'function') {
            const appwriteUser = await users.get(user.id);
            emailVerified = Boolean(appwriteUser?.emailVerification);
          }
        } catch {
          // If Appwrite lookup fails, default to false
        }
      }

      const verification = await verificationPromise;
      return {
        ...user,
        kyc_status: verification?.status ?? 'not_started' as const,
        kyc_verified: verification?.status === 'approved',
        email_verified: emailVerified,
      };
    }));

    let filtered = usersWithKyc;

    if (filters?.role) {
      filtered = filtered.filter(u => u.role === filters.role);
    }
    if (filters?.status) {
      filtered = filtered.filter(u => u.is_suspended === (filters.status === 'suspended'));
    }
    if (filters?.kycStatus) {
      // KYC status may be mirrored onto the user document at runtime by the Didit flow.
      filtered = filtered.filter(u =>
        (u as UserEntity & { kyc_status?: string }).kyc_status === filters.kycStatus
      );
    }
    if (filters?.emailVerified !== undefined) {
      const wantVerified = typeof filters.emailVerified === 'string'
        ? filters.emailVerified === 'true'
        : Boolean(filters.emailVerified);
      filtered = filtered.filter(u => Boolean(u.email_verified) === wantVerified);
    }
    if (filters?.search) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(u =>
        (u.email?.toLowerCase().includes(term)) || (u.name?.toLowerCase().includes(term))
      );
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return successResult({
      users: filtered,
      total: filtered.length,
    });
      } catch (error) {
      logger.error('Failed to fetch user management data', { error, filters });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}

/**
 * Suspend a user
 */
export async function suspendUser(userId: string, reason: string, actorId: string = 'system-admin'): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return errorResult('NOT_FOUND', 'User not found');
    }

    const updated = await userRepository.updateUser(userId, {
      is_suspended: true,
      suspension_reason: reason,
    } as Partial<UserEntity>);

    // BLF-12.2: Attribute every privileged action to the acting admin for audit trail
    logger.info('ADMIN ACTION: user suspended', { actor: actorId, userId, reason });
    await recordAdminAudit({ actorId, targetUserId: userId, action: 'user.suspended', payload: { reason } });

    return successResult(updated as UserEntity);
  } catch (error) {
    logger.error('Unexpected error in suspendUser', { error, userId, reason });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Unsuspend a user
 */
export async function unsuspendUser(userId: string, actorId: string = 'system-admin'): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return errorResult('NOT_FOUND', 'User not found');
    }

    const updated = await userRepository.updateUser(userId, {
      is_suspended: false,
      suspension_reason: null,
    } as Partial<UserEntity>);

    // BLF-12.2: Attribute every privileged action to the acting admin for audit trail
    logger.info('ADMIN ACTION: user unsuspended', { actor: actorId, userId });
    await recordAdminAudit({ actorId, targetUserId: userId, action: 'user.unsuspended' });

    return successResult(updated as UserEntity);
  } catch (error) {
    logger.error('Unexpected error in unsuspendUser', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Manually verify a user
 */
export async function verifyUser(
  userId: string,
  adminUserId = 'system-admin',
  reason = 'Manual verification approved by administrator'
): Promise<ServiceResult<KycVerification>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return errorResult('NOT_FOUND', 'User not found');
    }

    if (userId === adminUserId) {
      return {
        success: false,
        error: {
          code: 'SELF_REVIEW_FORBIDDEN',
          message: 'Administrators cannot verify their own account',
        },
      };
    }

    const existingVerification = await getKycVerificationByUserId(userId);
    const reviewedAt = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const auditReason = reason.trim() || 'Manual verification approved by administrator';
    const approval: Partial<KycVerification> = {
      status: 'approved',
      decision: 'approved',
      reviewed_by: adminUserId,
      reviewed_at: reviewedAt,
      admin_notes: auditReason,
      completed_at: reviewedAt,
      expires_at: expiresAt.toISOString(),
    };

    let verification: KycVerification | null;
    if (existingVerification) {
      verification = await updateKycVerification(existingVerification.id, approval);
    } else {
      verification = await createKycVerification({
        id: generateId(),
        user_id: userId,
        didit_session_id: `admin-override-${generateId()}`,
        didit_session_token: null,
        didit_session_url: null,
        didit_workflow_id: 'admin-override',
        ...approval,
      } as Omit<KycVerification, 'created_at' | 'updated_at'>);
    }

    if (!verification) {
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to save KYC verification' },
      };
    }

    logger.info('ADMIN ACTION: user manually verified', { actor: adminUserId, userId });
    await recordAdminAudit({
      actorId: adminUserId,
      targetUserId: userId,
      action: 'user.verified',
      payload: { reason: auditReason },
    });

    return successResult(verification);
  } catch (error) {
    logger.error('Unexpected error in verifyUser', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Update user information
 */
export async function updateUser(
  userId: string,
  updates: { name?: string; role?: string; isActive?: boolean },
  actorId: string = 'system-admin'
): Promise<ServiceResult<UserEntity>> {
  try {
    const updatesObj: Partial<UserEntity> = {};

    if (updates.name !== undefined) {
      updatesObj.name = updates.name;
    }
    if (updates.role !== undefined) {
      const validRoles = ['freelancer', 'employer', 'admin'] as const;
      if (!(validRoles as readonly string[]).includes(updates.role)) {
        return errorResult('INVALID_ROLE', `Invalid role. Must be one of: ${validRoles.join(', ')}`);
      }
      updatesObj.role = updates.role as UserEntity['role'];
    }
    if (updates.isActive !== undefined) {
      updatesObj.is_suspended = !updates.isActive;
    }

    if (Object.keys(updatesObj).length === 0) {
      const existing = await userRepository.getUserById(userId);
      return successResult(existing as UserEntity);
    }

    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return errorResult('NOT_FOUND', 'User not found');
    }

    // BLF-12.1: Last-admin guard — never demote/remove the final remaining admin,
    // otherwise the platform can lock itself out of admin access.
    if (existing.role === 'admin' && updatesObj.role !== undefined && updatesObj.role !== 'admin') {
      const allUsers = await userRepository.queryAll();
      const adminCount = allUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return errorResult('LAST_ADMIN', 'Cannot demote the last administrator');
      }
    }

    const updated = await userRepository.updateUser(userId, updatesObj);

    // BLF-12.2: Attribute every privileged action to the acting admin for audit trail.
    logger.info('ADMIN ACTION: user updated', {
      actor: actorId,
      userId,
      changes: updatesObj,
    });
    await recordAdminAudit({
      actorId,
      targetUserId: userId,
      action: 'user.updated',
      payload: { changes: updatesObj },
    });

    return successResult(updated as UserEntity);
  } catch (error) {
    logger.error('Unexpected error in updateUser', { error, userId, updates });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Update permissions for an administrator account
 */
export async function updateAdminPermissions(
  userId: string,
  permissions: AdminPermission[],
  actorId: string = 'system-admin'
): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return errorResult('NOT_FOUND', 'User not found');
    }

    if (existing.role !== 'admin') {
      return errorResult('INVALID_ROLE', 'Permissions can only be assigned to administrators');
    }

    // Validate that all permissions are recognized members of ADMIN_PERMISSIONS
    const validSet = new Set<string>(ADMIN_PERMISSIONS);
    for (const p of permissions) {
      if (!validSet.has(p)) {
        return errorResult('INVALID_PERMISSION', `Invalid permission: ${p}`);
      }
    }

    // Guard: Prevent removing admin:manage from the only remaining super-admin
    const targetHadAdminManage =
      existing.permissions === undefined ||
      (Array.isArray(existing.permissions) && (
        (existing.permissions as string[]).includes('*') ||
        (existing.permissions as string[]).includes('admin:manage')
      ));

    const targetWillHaveAdminManage = permissions.includes('admin:manage');

    if (targetHadAdminManage && !targetWillHaveAdminManage) {
      const allAdmins = await userRepository.getUsersByRole('admin');
      const otherSuperAdmins = allAdmins.filter(u => {
        if (u.id === userId) return false;
        const perms = u.permissions;
        return (
          !perms ||
          perms.length === 0 ||
          (perms as string[]).includes('*') ||
          (perms as string[]).includes('admin:manage')
        );
      });

      if (otherSuperAdmins.length === 0) {
        return errorResult('LAST_SUPER_ADMIN', 'Cannot remove admin:manage from the last remaining super administrator');
      }
    }

    const updated = await userRepository.updateUser(userId, {
      permissions,
    } as Partial<UserEntity>);

    logger.info('ADMIN ACTION: admin permissions updated', {
      actor: actorId,
      userId,
      permissions,
    });
    await recordAdminAudit({
      actorId,
      targetUserId: userId,
      action: 'admin.permissions_updated',
      payload: { permissions },
    });

    return successResult(updated as UserEntity);
  } catch (error) {
    logger.error('Unexpected error in updateAdminPermissions', { error, userId, permissions });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

export interface InviteUserInput {
  name: string;
  email: string;
  role: 'freelancer' | 'employer' | 'admin';
  password?: string;
  permissions?: AdminPermission[];
  autoVerifyEmail?: boolean;
}

function generateTemporaryPassword(): string {
  const random = crypto.randomBytes(9).toString('base64url');
  return `Temp!${random}1`;
}

/**
 * Create or invite a new user through Appwrite Auth and register in public database.
 */
export async function inviteOrAddUser(
  input: InviteUserInput,
  actorId: string = 'system-admin'
): Promise<ServiceResult<{ user: UserEntity; temporaryPassword?: string }>> {
  try {
    const trimmedName = input.name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return errorResult('INVALID_NAME', 'Name must be at least 2 characters long');
    }

    const normalizedEmail = input.email?.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return errorResult('INVALID_EMAIL', 'A valid email address is required');
    }

    if (!['freelancer', 'employer', 'admin'].includes(input.role)) {
      return errorResult('INVALID_ROLE', 'Role must be freelancer, employer, or admin');
    }

    // Validate admin permissions if role is admin and permissions provided
    if (input.role === 'admin' && input.permissions !== undefined) {
      if (!Array.isArray(input.permissions)) {
        return errorResult('INVALID_PERMISSIONS', 'Permissions must be an array');
      }
      const validSet = new Set<string>(ADMIN_PERMISSIONS);
      for (const p of input.permissions) {
        if (!validSet.has(p)) {
          return errorResult('INVALID_PERMISSION', `Invalid permission: ${p}`);
        }
      }
    }

    // Ensure email is not already registered in our database
    const emailExists = await userRepository.emailExists(normalizedEmail);
    if (emailExists) {
      return errorResult('DUPLICATE_EMAIL', 'An account with this email already exists');
    }

    // Password handling: manual or secure auto-generated temporary password
    let passwordToUse = input.password?.trim();
    let temporaryPasswordGenerated: string | undefined = undefined;

    if (passwordToUse) {
      if (passwordToUse.length < 8) {
        return errorResult('INVALID_PASSWORD', 'Password must be at least 8 characters long');
      }
    } else {
      temporaryPasswordGenerated = generateTemporaryPassword();
      passwordToUse = temporaryPasswordGenerated;
    }

    // Create user in Appwrite Auth
    let appwriteUserId: string | undefined;
    try {
      const appwriteUser = await users.create(
        ID.unique(),
        normalizedEmail,
        undefined,
        passwordToUse,
        trimmedName
      );
      appwriteUserId = appwriteUser.$id;

      // Handle email verification
      if (input.autoVerifyEmail !== false) {
        try {
          await users.updateEmailVerification(appwriteUserId, true);
        } catch (verifyErr) {
          logger.warn('Failed to update email verification status in Appwrite', {
            userId: appwriteUserId,
            error: verifyErr,
          });
        }
      }
    } catch (appwriteErr: unknown) {
      const msg = appwriteErr instanceof Error ? appwriteErr.message : String(appwriteErr);
      if (msg.includes('already exists') || (appwriteErr as any)?.code === 409) {
        return errorResult('DUPLICATE_EMAIL', 'An account with this email already exists in Auth provider');
      }
      logger.error('Failed to create user in Appwrite Auth', { error: appwriteErr, email: normalizedEmail });
      return errorResult('INTERNAL_ERROR', 'Failed to create user in authentication provider');
    }

    // Create user record in our database
    let createdUser: UserEntity;
    try {
      const adminPermissions = input.role === 'admin'
        ? (input.permissions && input.permissions.length > 0 ? input.permissions : ['users:view', 'disputes:view', 'kyc:view', 'analytics:view'])
        : undefined;

      createdUser = await userRepository.createUser({
        id: appwriteUserId,
        email: normalizedEmail,
        password_hash: '',
        role: input.role,
        wallet_address: '',
        name: trimmedName,
        is_suspended: false,
        suspension_reason: null,
        mfa_enabled: false,
        ...(adminPermissions ? { permissions: adminPermissions } : {}),
      });
    } catch (dbErr) {
      // Compensate: Delete orphaned Appwrite user if DB persistence fails
      if (appwriteUserId) {
        try {
          await users.delete(appwriteUserId);
          logger.warn('Rolled back Appwrite user after DB insertion failure', { userId: appwriteUserId });
        } catch (delErr) {
          logger.error('CRITICAL: Failed to rollback Appwrite user', { userId: appwriteUserId, error: delErr });
        }
      }
      logger.error('Failed to create user database record', { error: dbErr, userId: appwriteUserId });
      return errorResult('INTERNAL_ERROR', 'Failed to create user record in database');
    }

    logger.info('ADMIN ACTION: user created/invited', {
      actor: actorId,
      userId: createdUser.id,
      role: createdUser.role,
      email: normalizedEmail,
    });

    await recordAdminAudit({
      actorId,
      targetUserId: createdUser.id,
      action: 'admin.user_created',
      payload: {
        role: createdUser.role,
        email: normalizedEmail,
        permissions: createdUser.permissions,
        autoVerifyEmail: input.autoVerifyEmail !== false,
      },
    });

    return successResult({
      user: createdUser,
      ...(temporaryPasswordGenerated !== undefined ? { temporaryPassword: temporaryPasswordGenerated } : {}),
    });
  } catch (error) {
    logger.error('Unexpected error in inviteOrAddUser', { error, input });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get dispute management data
 */
export async function getDisputeManagement(filters?: DisputeFilters): Promise<ServiceResult<DisputeManagementData>> {
  try {
    const disputeOptions: { limit: number; status?: string } = { limit: 1000 };
    if (filters?.status) {
      disputeOptions.status = filters.status;
    }
    const { items: disputeEntities } = await disputeRepository.getAllDisputes(disputeOptions);
    const disputes = disputeEntities.map(mapDisputeFromEntity);

    // The runtime status may include values outside the modeled union (e.g. 'pending').
    const pendingCount = disputes.filter(d => (d.status as string) === 'pending' || d.status === 'open' || d.status === 'under_review').length;
    const resolvedCount = disputes.filter(d => d.status === 'resolved').length;

    return successResult({
      disputes,
      total: disputes.length,
      pendingCount,
      resolvedCount,
    });
  } catch (error) {
    logger.error('Failed to fetch dispute management data', { error, filters });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Compute the platform satisfaction rate from review ratings.
 * Best-effort: any failure (or absence of reviews) yields 0 so the admin
 * dashboard never breaks because of the reviews read.
 */
export async function getSatisfactionRate(): Promise<number> {
  try {
    const reviews = await reviewRepository.getAllReviews();
    const positive = reviews.filter(r => r.rating >= 4.0).length;
    const total = reviews.length;
    return total > 0 ? Math.round((positive / total) * 100) : 0;
  } catch (error) {
    logger.error('Failed to compute satisfaction rate', { error });
    return 0;
  }
}

/**
 * Get system health metrics
 */
export async function getSystemHealth(): Promise<ServiceResult<SystemHealth>> {
  try {
    // Check Appwrite connectivity via a lightweight query
    let databaseHealth: 'healthy' | 'unhealthy' = 'healthy';
    try {
      await userRepository.queryAll();
    } catch (error) {
      logger.error('Database health check failed', { error });
      databaseHealth = 'unhealthy';
    }

    // Storage health - since we're on Appwrite, we could check Appwrite here
    // For now, let's assume healthy if DB is healthy
    const storageHealth: 'healthy' | 'unhealthy' = 'healthy';

    return successResult({
      database: databaseHealth,
      storage: storageHealth,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
      } catch (error) {
      logger.error('Unexpected error in getSystemHealth', { error });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}
