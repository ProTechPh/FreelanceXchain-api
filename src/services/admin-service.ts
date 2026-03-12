import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { UserEntity } from '../repositories/user-repository.js';

const supabase = getSupabaseClient();

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

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
    // Total users by role
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: totalFreelancers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'freelancer');

    const { count: totalEmployers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'employer');

    // Projects
    const { count: totalProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true });

    const { count: activeProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);

    const { count: completedProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    // Average project budget
    const { data: projects } = await supabase
      .from('projects')
      .select('budget');

    const averageProjectBudget = projects && projects.length > 0
      ? projects.reduce((sum, p) => sum + p.budget, 0) / projects.length
      : 0;

    // Contracts
    const { count: totalContracts } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true });

    // Disputes
    const { count: totalDisputes } = await supabase
      .from('disputes')
      .select('*', { count: 'exact', head: true });

    // Transaction volume
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('status', 'completed');

    const totalTransactionVolume = (transactions || []).reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalFreelancers: totalFreelancers || 0,
        totalEmployers: totalEmployers || 0,
        totalProjects: totalProjects || 0,
        totalContracts: totalContracts || 0,
        totalDisputes: totalDisputes || 0,
        totalTransactionVolume: Math.round(totalTransactionVolume * 100) / 100,
        activeProjects: activeProjects || 0,
        completedProjects: completedProjects || 0,
        averageProjectBudget: Math.round(averageProjectBudget * 100) / 100,
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
    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.role) {
      query = query.eq('role', filters.role);
    }
    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch user management data', { error, filters });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch users',
        },
      };
    }

    return {
      success: true,
      data: {
        users: (data || []) as UserEntity[],
        total: count || 0,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getUserManagement', { error, filters });
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
    // Update user status
    const { data, error } = await supabase
      .from('users')
      .update({
        is_suspended: true,
        suspension_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to suspend user', { error, userId, reason });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to suspend user',
        },
      };
    }

    // TODO: Log audit trail
    logger.info('User suspended', { userId, reason });

    return {
      success: true,
      data: data as UserEntity,
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
    const { data, error } = await supabase
      .from('users')
      .update({
        is_suspended: false,
        suspension_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to unsuspend user', { error, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to unsuspend user',
        },
      };
    }

    // TODO: Log audit trail
    logger.info('User unsuspended', { userId });

    return {
      success: true,
      data: data as UserEntity,
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
    const { data, error } = await supabase
      .from('users')
      .update({
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to verify user', { error, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to verify user',
        },
      };
    }

    // TODO: Log audit trail
    logger.info('User manually verified', { userId });

    return {
      success: true,
      data: data as UserEntity,
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
 * Get dispute management data
 */
export async function getDisputeManagement(filters?: DisputeFilters): Promise<ServiceResult<DisputeManagementData>> {
  try {
    let query = supabase
      .from('disputes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch dispute management data', { error, filters });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch disputes',
        },
      };
    }

    // Count by status
    const pendingCount = (data || []).filter(d => d.status === 'pending').length;
    const resolvedCount = (data || []).filter(d => d.status === 'resolved').length;

    return {
      success: true,
      data: {
        disputes: data || [],
        total: count || 0,
        pendingCount,
        resolvedCount,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getDisputeManagement', { error, filters });
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
 * Get system health status
 */
export async function getSystemHealth(): Promise<ServiceResult<SystemHealth>> {
  try {
    // Check database connectivity
    let databaseHealth: 'healthy' | 'unhealthy' = 'healthy';
    try {
      await supabase.from('users').select('id').limit(1);
    } catch {
      databaseHealth = 'unhealthy';
    }

    // Check storage connectivity
    let storageHealth: 'healthy' | 'unhealthy' = 'healthy';
    try {
      await supabase.storage.listBuckets();
    } catch {
      storageHealth = 'unhealthy';
    }

    // Calculate uptime (in seconds)
    const uptime = process.uptime();

    return {
      success: true,
      data: {
        database: databaseHealth,
        storage: storageHealth,
        uptime: Math.round(uptime),
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
