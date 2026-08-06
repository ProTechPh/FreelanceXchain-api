import { logger } from '../config/logger.js';
import { UserEntity } from '../repositories/user-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { transactionRepository } from '../repositories/transaction-repository.js';
import {
  createKycVerification,
  getKycVerificationByUserId,
  updateKycVerification,
} from '../repositories/didit-kyc-repository.js';
import type { KycVerification } from '../models/didit-kyc.js';
import type { ServiceResult } from '../types/service-result.js';
import { generateId } from '../utils/id.js';

export interface PlatformStats {
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
  search?: string;
}

export interface UserManagementData {
  users: Array<UserEntity & {
    kyc_status: KycVerification['status'] | 'not_started';
    kyc_verified: boolean;
  }>;
  total: number;
}

export interface DisputeFilters {
  status?: string;
  priority?: string;
}

export interface DisputeManagementData {
  disputes: any[];
  total: number;
  pendingCount: number;
  resolvedCount: number;
}

export interface SystemHealth {
  database: 'healthy' | 'unhealthy';
  storage: 'healthy' | 'unhealthy';
  uptime: number;
  timestamp: string;
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

    return {
      success: true,
      data: {
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
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getPlatformStats', { error });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get user management data with filters
 */
export async function getUserManagement(filters?: UserFilters): Promise<ServiceResult<UserManagementData>> {
  try {
    const allUsers = await userRepository.queryAll('$createdAt');
    const usersWithKyc = await Promise.all(allUsers.map(async (user) => {
      const verification = await getKycVerificationByUserId(user.id);
      return {
        ...user,
        kyc_status: verification?.status ?? 'not_started' as const,
        kyc_verified: verification?.status === 'approved',
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
      filtered = filtered.filter(u => u.kyc_status === filters.kycStatus);
    }
    if (filters?.search) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(u =>
        (u.email?.toLowerCase().includes(term)) || (u.name?.toLowerCase().includes(term))
      );
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      success: true,
      data: {
        users: filtered,
        total: filtered.length,
      },
    };
  } catch (error) {
    logger.error('Failed to fetch user management data', { error, filters });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Suspend a user
 */
export async function suspendUser(userId: string, reason: string): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    const updated = await userRepository.updateUser(userId, {
      is_suspended: true,
      suspension_reason: reason,
    } as Partial<UserEntity>);

    logger.info('ADMIN ACTION: user suspended', { actor: 'admin', userId, reason });

    return {
      success: true,
      data: updated as UserEntity,
    };
  } catch (error) {
    logger.error('Unexpected error in suspendUser', { error, userId, reason });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Unsuspend a user
 */
export async function unsuspendUser(userId: string): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    const updated = await userRepository.updateUser(userId, {
      is_suspended: false,
      suspension_reason: null,
    } as Partial<UserEntity>);

    logger.info('ADMIN ACTION: user unsuspended', { actor: 'admin', userId });

    return {
      success: true,
      data: updated as UserEntity,
    };
  } catch (error) {
    logger.error('Unexpected error in unsuspendUser', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
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

    return {
      success: true,
      data: verification,
    };
  } catch (error) {
    logger.error('Unexpected error in verifyUser', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Update user information
 */
export async function updateUser(
  userId: string,
  updates: { name?: string; role?: string; isActive?: boolean }
): Promise<ServiceResult<UserEntity>> {
  try {
    const updatesObj: Partial<UserEntity> = {};

    if (updates.name !== undefined) {
      updatesObj.name = updates.name;
    }
    if (updates.role !== undefined) {
      const validRoles = ['freelancer', 'employer', 'admin'] as const;
      if (!validRoles.includes(updates.role as any)) {
        return {
          success: false,
          error: { code: 'INVALID_ROLE', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        };
      }
      updatesObj.role = updates.role as any;
    }
    if (updates.isActive !== undefined) {
      updatesObj.is_suspended = !updates.isActive;
    }

    if (Object.keys(updatesObj).length === 0) {
      const existing = await userRepository.getUserById(userId);
      return { success: true, data: existing as UserEntity };
    }

    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    const updated = await userRepository.updateUser(userId, updatesObj);

    // BUG-6: audit admin-initiated privilege/status changes for traceability.
    logger.info('ADMIN ACTION: user updated', {
      actor: 'admin',
      userId,
      changes: updatesObj,
    });

    return {
      success: true,
      data: updated as UserEntity,
    };
  } catch (error) {
    logger.error('Unexpected error in updateUser', { error, userId, updates });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
    const { items: disputes } = await disputeRepository.getAllDisputes(disputeOptions);

    const pendingCount = disputes.filter((d: any) => d.status === 'pending').length;
    const resolvedCount = disputes.filter((d: any) => d.status === 'resolved').length;

    return {
      success: true,
      data: {
        disputes,
        total: disputes.length,
        pendingCount,
        resolvedCount,
      },
    };
  } catch (error) {
    logger.error('Failed to fetch dispute management data', { error, filters });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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

    return {
      success: true,
      data: {
        database: databaseHealth,
        storage: storageHealth,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getSystemHealth', { error });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
