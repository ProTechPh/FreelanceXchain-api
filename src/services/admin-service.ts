import { logger } from '../config/logger.js';
import { UserEntity } from '../repositories/user-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { transactionRepository } from '../repositories/transaction-repository.js';
import type { ServiceResult } from '../types/service-result.js';

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
  users: UserEntity[];
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
    const budgets = allProjects.map(p => p.budget).filter(b => typeof b === 'number');
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
    const allUsers = await userRepository.queryAll();

    let filtered = allUsers;

    if (filters?.role) {
      filtered = filtered.filter(u => u.role === filters.role);
    }
    if (filters?.status) {
      filtered = filtered.filter(u => u.is_suspended === (filters.status === 'suspended'));
    }
    if (filters?.kycStatus) {
      filtered = filtered.filter(u => (u as any).kyc_status === filters.kycStatus);
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
export async function verifyUser(userId: string): Promise<ServiceResult<UserEntity>> {
  try {
    const existing = await userRepository.getUserById(userId);

    if (!existing) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    const updated = await userRepository.updateUser(userId, {
      is_verified: true,
    } as Partial<UserEntity>);

    return {
      success: true,
      data: updated as UserEntity,
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
