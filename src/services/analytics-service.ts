import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';

export interface DateRangeOptions {
  startDate?: string;
  endDate?: string;
}

export interface FreelancerAnalytics {
  totalEarnings: number;
  projectsCompleted: number;
  averageRating: number;
  earningsByMonth: { month: string; amount: number }[];
  topSkills: { skill: string; projectCount: number }[];
  proposalAcceptanceRate: number;
}

export interface EmployerAnalytics {
  totalSpent: number;
  projectsPosted: number;
  projectsCompleted: number;
  averageProjectBudget: number;
  spendingByMonth: { month: string; amount: number }[];
  topHiredSkills: { skill: string; projectCount: number }[];
}

export interface SkillTrend {
  skillId: string;
  skillName: string;
  demandLevel: 'high' | 'medium' | 'low';
  projectCount: number;
  averageBudget: number;
  growthRate: number;
}

export interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalContracts: number;
  totalTransactionVolume: number;
  activeUsers: number;
  completionRate: number;
}

export interface AdminAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  activeContracts: number;
  userGrowth: number;
  projectGrowth: number;
  userGrowthData: { month: string; count: number }[];
  projectActivityData: { month: string; count: number }[];
}

/**
 * Get freelancer analytics
 */
export async function getFreelancerAnalytics(
  userId: string,
  options: DateRangeOptions = {}
): Promise<ServiceResult<FreelancerAnalytics>> {
  try {
    const { startDate, endDate } = options;

    // Get completed contracts
    let contractQuery = "SELECT id, total_amount, created_at FROM contracts WHERE freelancer_id = $1 AND status = 'completed'";
    const params: any[] = [userId];
    let pIndex = 2;

    if (startDate) {
      contractQuery += ` AND created_at >= $${pIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      contractQuery += ` AND created_at <= $${pIndex++}`;
      params.push(endDate);
    }

    const contractsResult = await pool.query(contractQuery, params);
    const contracts = contractsResult.rows;

    // Calculate total earnings
    const totalEarnings = contracts.reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
    const projectsCompleted = contracts.length;

    // Get average rating
    const reviewsResult = await pool.query(
      'SELECT rating FROM reviews WHERE reviewee_id = $1',
      [userId]
    );

    const averageRating = reviewsResult.rows.length > 0
      ? reviewsResult.rows.reduce((sum, r) => sum + r.rating, 0) / reviewsResult.rows.length
      : 0;

    // Get proposal acceptance rate
    const proposalsResult = await pool.query(
      'SELECT status FROM proposals WHERE freelancer_id = $1',
      [userId]
    );
    
    const totalProposals = proposalsResult.rows.length;
    const acceptedProposals = proposalsResult.rows.filter(p => p.status === 'accepted').length;
    const proposalAcceptanceRate = totalProposals > 0 ? (acceptedProposals / totalProposals) * 100 : 0;

    const earningsByMonth = calculateEarningsByMonth(contracts);
    const topSkills = await calculateTopSkills(userId, 'freelancer');

    return {
      success: true,
      data: {
        totalEarnings,
        projectsCompleted,
        averageRating: Math.round(averageRating * 10) / 10,
        earningsByMonth,
        topSkills,
        proposalAcceptanceRate: Math.round(proposalAcceptanceRate * 10) / 10,
      },
    };
  } catch (error) {
    logger.error('Failed to get freelancer analytics', { error, userId });
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
 * Get employer analytics
 */
export async function getEmployerAnalytics(
  userId: string,
  options: DateRangeOptions = {}
): Promise<ServiceResult<EmployerAnalytics>> {
  try {
    const { startDate, endDate } = options;

    // Projects posted
    let postedQuery = 'SELECT id, budget, created_at FROM projects WHERE employer_id = $1';
    const postedParams: any[] = [userId];
    let ppIndex = 2;

    if (startDate) {
      postedQuery += ` AND created_at >= $${ppIndex++}`;
      postedParams.push(startDate);
    }
    if (endDate) {
      postedQuery += ` AND created_at <= $${ppIndex++}`;
      postedParams.push(endDate);
    }

    const postedResult = await pool.query(postedQuery, postedParams);
    const projectsPosted = postedResult.rows.length;
    const totalBudget = postedResult.rows.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    const averageProjectBudget = projectsPosted > 0 ? totalBudget / projectsPosted : 0;

    // Completed contracts (spending)
    let contractQuery = "SELECT total_amount, created_at FROM contracts WHERE employer_id = $1 AND status = 'completed'";
    const cParams: any[] = [userId];
    let cpIndex = 2;

    if (startDate) {
      contractQuery += ` AND created_at >= $${cpIndex++}`;
      cParams.push(startDate);
    }
    if (endDate) {
      contractQuery += ` AND created_at <= $${cpIndex++}`;
      cParams.push(endDate);
    }

    const contractsResult = await pool.query(contractQuery, cParams);
    const contracts = contractsResult.rows;
    const totalSpent = contracts.reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
    const projectsCompleted = contracts.length;

    const spendingByMonth = calculateEarningsByMonth(contracts);
    const topHiredSkills = await calculateTopSkills(userId, 'employer');

    return {
      success: true,
      data: {
        totalSpent,
        projectsPosted,
        projectsCompleted,
        averageProjectBudget: Math.round(averageProjectBudget * 100) / 100,
        spendingByMonth,
        topHiredSkills,
      },
    };
  } catch (error) {
    logger.error('Failed to get employer analytics', { error, userId });
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
 * Get platform metrics
 */
export async function getPlatformMetrics(): Promise<ServiceResult<PlatformMetrics>> {
  try {
    const [
      usersResult,
      projectsResult,
      contractsResult,
      volumeResult,
      activeUsersResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM projects'),
      pool.query('SELECT COUNT(*) FROM contracts'),
      pool.query("SELECT SUM(total_amount) FROM contracts WHERE status = 'completed'"),
      pool.query("SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'")
    ]);

    const totalUsers = parseInt(usersResult.rows[0].count);
    const totalProjects = parseInt(projectsResult.rows[0].count);
    const totalContracts = parseInt(contractsResult.rows[0].count);
    const totalTransactionVolume = Number(volumeResult.rows[0].sum || 0);
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    // Calculate completion rate
    const completedContractsResult = await pool.query("SELECT COUNT(*) FROM contracts WHERE status = 'completed'");
    const completedContracts = parseInt(completedContractsResult.rows[0].count);
    const completionRate = totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0;

    return {
      success: true,
      data: {
        totalUsers,
        totalProjects,
        totalContracts,
        totalTransactionVolume,
        activeUsers,
        completionRate: Math.round(completionRate * 10) / 10,
      },
    };
  } catch (error) {
    logger.error('Failed to get platform metrics', { error });
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
 * Get admin analytics
 */
export async function getAdminAnalytics(): Promise<ServiceResult<AdminAnalytics>> {
  try {
    const [
      usersResult,
      projectsResult,
      revenueResult,
      activeContractsResult,
      userGrowthResult,
      projectGrowthResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM projects'),
      pool.query("SELECT SUM(total_amount * 0.05) as revenue FROM contracts WHERE status = 'completed'"), // 5% fee example
      pool.query("SELECT COUNT(*) FROM contracts WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"),
      pool.query("SELECT COUNT(*) FROM projects WHERE created_at >= NOW() - INTERVAL '30 days'")
    ]);

    const totalUsers = parseInt(usersResult.rows[0].count);
    const totalProjects = parseInt(projectsResult.rows[0].count);
    const totalRevenue = Number(revenueResult.rows[0].revenue || 0);
    const activeContracts = parseInt(activeContractsResult.rows[0].count);
    const userGrowth = parseInt(userGrowthResult.rows[0].count);
    const projectGrowth = parseInt(projectGrowthResult.rows[0].count);

    // Get growth data for charts
    const userGrowthDataResult = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count 
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month 
      ORDER BY month ASC
    `);

    const projectActivityDataResult = await pool.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count 
      FROM projects 
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month 
      ORDER BY month ASC
    `);

    return {
      success: true,
      data: {
        totalUsers,
        totalProjects,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        activeContracts,
        userGrowth,
        projectGrowth,
        userGrowthData: userGrowthDataResult.rows,
        projectActivityData: projectActivityDataResult.rows,
      },
    };
  } catch (error) {
    logger.error('Failed to get admin analytics', { error });
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
 * Get skill trends
 */
export async function getSkillTrends(): Promise<ServiceResult<SkillTrend[]>> {
  try {
    // This is a complex query that aggregates skill usage from projects
    const result = await pool.query(`
      WITH skill_usage AS (
        SELECT 
          jsonb_array_elements(required_skills)->>'name' as skill_name,
          budget,
          created_at
        FROM projects
      )
      SELECT 
        skill_name as "skillName",
        COUNT(*) as "projectCount",
        AVG(budget) as "averageBudget",
        'high'::text as "demandLevel", -- Simplified for example
        10.5 as "growthRate" -- Simplified for example
      FROM skill_usage
      WHERE skill_name IS NOT NULL
      GROUP BY skill_name
      ORDER BY "projectCount" DESC
      LIMIT 20
    `);

    return {
      success: true,
      data: result.rows.map(row => ({
        ...row,
        skillId: row.skillName, // Simplified
        averageBudget: Math.round(Number(row.averageBudget) * 100) / 100,
        growthRate: Number(row.growthRate),
        projectCount: parseInt(row.projectCount)
      })) as SkillTrend[],
    };
  } catch (error) {
    logger.error('Failed to get skill trends', { error });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

// Helper functions

function calculateEarningsByMonth(contracts: any[]): { month: string; amount: number }[] {
  const monthMap = new Map<string, number>();

  for (const contract of contracts) {
    const date = new Date(contract.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const current = monthMap.get(monthKey) || 0;
    monthMap.set(monthKey, current + Number(contract.total_amount || 0));
  }

  return Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function calculateTopSkills(userId: string, userType: 'freelancer' | 'employer'): Promise<{ skill: string; projectCount: number }[]> {
  try {
    const idColumn = userType === 'freelancer' ? 'freelancer_id' : 'employer_id';
    const contractsResult = await pool.query(
      `SELECT project_id FROM contracts WHERE ${idColumn} = $1 AND status = 'completed'`,
      [userId]
    );

    if (contractsResult.rows.length === 0) {
      return [];
    }

    const projectIds = contractsResult.rows.map((c: any) => c.project_id);

    const projectsResult = await pool.query(
      'SELECT required_skills FROM projects WHERE id = ANY($1)',
      [projectIds]
    );

    const skillMap = new Map<string, number>();

    for (const project of projectsResult.rows) {
      const skills = project.required_skills as any[];
      for (const skill of skills || []) {
        const skillName = typeof skill === 'string' ? skill : (skill.skill_name || skill.name);
        if (skillName) {
          skillMap.set(skillName, (skillMap.get(skillName) || 0) + 1);
        }
      }
    }

    return Array.from(skillMap.entries())
      .map(([skill, projectCount]) => ({ skill, projectCount }))
      .sort((a, b) => b.projectCount - a.projectCount)
      .slice(0, 10);
  } catch (error) {
    logger.error('Error calculating top skills', { error, userId, userType });
    return [];
  }
}

export const getSkillDemandTrends = getSkillTrends;
