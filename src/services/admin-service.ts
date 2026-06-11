import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { UserEntity } from '../repositories/user-repository.js';
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
    const query = `
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'freelancer') as total_freelancers,
        (SELECT COUNT(*) FROM users WHERE role = 'employer') as total_employers,
        (SELECT COUNT(*) FROM projects) as total_projects,
        (SELECT COUNT(*) FROM projects WHERE status IN ('open', 'in_progress')) as active_projects,
        (SELECT COUNT(*) FROM projects WHERE status = 'completed') as completed_projects,
        (SELECT AVG(budget) FROM projects) as avg_budget,
        (SELECT COUNT(*) FROM contracts) as total_contracts,
        (SELECT COUNT(*) FROM disputes) as total_disputes,
        (SELECT SUM(amount) FROM transactions WHERE status = 'completed') as total_volume
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    return {
      success: true,
      data: {
        totalUsers: parseInt(stats.total_users, 10),
        totalFreelancers: parseInt(stats.total_freelancers, 10),
        totalEmployers: parseInt(stats.total_employers, 10),
        totalProjects: parseInt(stats.total_projects, 10),
        totalContracts: parseInt(stats.total_contracts, 10),
        totalDisputes: parseInt(stats.total_disputes, 10),
        totalTransactionVolume: Math.round(parseFloat(stats.total_volume || '0') * 100) / 100,
        activeProjects: parseInt(stats.active_projects, 10),
        completedProjects: parseInt(stats.completed_projects, 10),
        averageProjectBudget: Math.round(parseFloat(stats.avg_budget || '0') * 100) / 100,
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
    let query = 'SELECT * FROM users WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const params: any[] = [];
    let pIndex = 1;

    if (filters?.role) {
      query += ` AND role = $${pIndex}`;
      countQuery += ` AND role = $${pIndex}`;
      params.push(filters.role);
      pIndex++;
    }
    if (filters?.status) {
      query += ` AND is_suspended = $${pIndex}`;
      countQuery += ` AND is_suspended = $${pIndex}`;
      params.push(filters.status === 'suspended');
      pIndex++;
    }
    if (filters?.kycStatus) {
      query += ` AND kyc_status = $${pIndex}`;
      countQuery += ` AND kyc_status = $${pIndex}`;
      params.push(filters.kycStatus);
      pIndex++;
    }
    if (filters?.search) {
      const safeSearch = `%${filters.search.replace(/[%_]/g, '\\$&')}%`;
      query += ` AND (email ILIKE $${pIndex} OR name ILIKE $${pIndex})`;
      countQuery += ` AND (email ILIKE $${pIndex} OR name ILIKE $${pIndex})`;
      params.push(safeSearch);
      pIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const [results, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params)
    ]);

    return {
      success: true,
      data: {
        users: results.rows as UserEntity[],
        total: parseInt(countResult.rows[0].count, 10),
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
    const result = await pool.query(
      `UPDATE users 
       SET is_suspended = true, suspension_reason = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [reason, userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    return {
      success: true,
      data: result.rows[0] as UserEntity,
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
    const result = await pool.query(
      `UPDATE users 
       SET is_suspended = false, suspension_reason = NULL, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    return {
      success: true,
      data: result.rows[0] as UserEntity,
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
    const result = await pool.query(
      "UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1 RETURNING *",
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    return {
      success: true,
      data: result.rows[0] as UserEntity,
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
    const columns = [];
    const values = [];
    let pIndex = 1;

    if (updates.name !== undefined) {
      columns.push(`name = $${pIndex++}`);
      values.push(updates.name);
    }
    if (updates.role !== undefined) {
      columns.push(`role = $${pIndex++}`);
      values.push(updates.role);
    }
    if (updates.isActive !== undefined) {
      columns.push(`is_suspended = $${pIndex++}`);
      values.push(!updates.isActive);
    }

    if (columns.length === 0) {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      return { success: true, data: result.rows[0] as UserEntity };
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${columns.join(', ')}, updated_at = NOW() WHERE id = $${pIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      };
    }

    return {
      success: true,
      data: result.rows[0] as UserEntity,
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
    let query = 'SELECT * FROM disputes WHERE 1=1';
    const params: any[] = [];
    let pIndex = 1;

    if (filters?.status) {
      query += ` AND status = $${pIndex++}`;
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const disputes = result.rows;

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
    // Check database connectivity
    let databaseHealth: 'healthy' | 'unhealthy' = 'healthy';
    try {
      await pool.query('SELECT 1');
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
