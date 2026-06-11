import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import { platformMetricsCache, skillTrendsCache, adminAnalyticsCache } from '../utils/cache.js';
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

    // Get completed contracts for this freelancer
    const contractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal('freelancer_id', userId),
        Query.equal('status', 'completed'),
        Query.limit(1000),
      ]
    );

    // Filter by date range in memory
    let contracts = contractsResponse.documents;
    if (startDate) {
      contracts = contracts.filter((c: any) => new Date(c.created_at) >= new Date(startDate));
    }
    if (endDate) {
      contracts = contracts.filter((c: any) => new Date(c.created_at) <= new Date(endDate));
    }

    // Calculate total earnings
    const totalEarnings = contracts.reduce((sum: number, c: any) => sum + Number(c.total_amount || 0), 0);
    const projectsCompleted = contracts.length;

    // Get average rating
    const reviewsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.limit(1000),
      ]
    );

    const reviews = reviewsResponse.documents;
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
      : 0;

    // Get proposal acceptance rate
    const proposalsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROPOSALS,
      [
        Query.equal('freelancer_id', userId),
        Query.limit(1000),
      ]
    );
    
    const totalProposals = proposalsResponse.documents.length;
    const acceptedProposals = proposalsResponse.documents.filter((p: any) => p.status === 'accepted').length;
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
    const postedResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJECTS,
      [
        Query.equal('employer_id', userId),
        Query.limit(1000),
      ]
    );

    let projectsPostedData = postedResponse.documents;
    if (startDate) {
      projectsPostedData = projectsPostedData.filter((p: any) => new Date(p.created_at) >= new Date(startDate));
    }
    if (endDate) {
      projectsPostedData = projectsPostedData.filter((p: any) => new Date(p.created_at) <= new Date(endDate));
    }

    const projectsPosted = projectsPostedData.length;
    const totalBudget = projectsPostedData.reduce((sum: number, p: any) => sum + Number(p.budget || 0), 0);
    const averageProjectBudget = projectsPosted > 0 ? totalBudget / projectsPosted : 0;

    // Completed contracts (spending)
    const contractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal('employer_id', userId),
        Query.equal('status', 'completed'),
        Query.limit(1000),
      ]
    );

    let contracts = contractsResponse.documents;
    if (startDate) {
      contracts = contracts.filter((c: any) => new Date(c.created_at) >= new Date(startDate));
    }
    if (endDate) {
      contracts = contracts.filter((c: any) => new Date(c.created_at) <= new Date(endDate));
    }

    const totalSpent = contracts.reduce((sum: number, c: any) => sum + Number(c.total_amount || 0), 0);
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
  // Check cache first
  const cached = platformMetricsCache.get('platform_metrics');
  if (cached) {
    return { success: true, data: cached };
  }

  try {
    const [
      usersResponse,
      projectsResponse,
      contractsResponse,
      completedContractsResponse,
      auditLogsResponse,
    ] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJECTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [
        Query.equal('status', 'completed'),
        Query.limit(1),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.AUDIT_LOG_ENTRIES, [
        Query.limit(1000),
      ]),
    ]);

    const totalUsers = usersResponse.total;
    const totalProjects = projectsResponse.total;
    const totalContracts = contractsResponse.total;
    const completedContracts = completedContractsResponse.total;

    // Calculate total transaction volume from completed contracts
    const completedDocs = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal('status', 'completed'),
        Query.limit(1000),
      ]
    );
    const totalTransactionVolume = completedDocs.documents.reduce(
      (sum: number, c: any) => sum + Number(c.total_amount || 0), 0
    );

    // Count active users (those with audit log entries in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserIds = new Set(
      auditLogsResponse.documents
        .filter((log: any) => new Date(log.created_at) >= thirtyDaysAgo)
        .map((log: any) => log.user_id)
        .filter(Boolean)
    );
    const activeUsers = activeUserIds.size;

    const completionRate = totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0;

    const data = {
      totalUsers,
      totalProjects,
      totalContracts,
      totalTransactionVolume,
      activeUsers,
      completionRate: Math.round(completionRate * 10) / 10,
    };

    // Cache the result
    platformMetricsCache.set('platform_metrics', data);

    return {
      success: true,
      data,
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
      usersResponse,
      projectsResponse,
      completedContractsResponse,
      activeContractsResponse,
    ] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJECTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [
        Query.equal('status', 'completed'),
        Query.limit(1000),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [
        Query.equal('status', 'active'),
        Query.limit(1),
      ]),
    ]);

    const totalUsers = usersResponse.total;
    const totalProjects = projectsResponse.total;
    const activeContracts = activeContractsResponse.total;

    // Calculate total revenue (5% fee on completed contracts)
    const totalRevenue = completedContractsResponse.documents.reduce(
      (sum: number, c: any) => sum + Number(c.total_amount || 0) * 0.05, 0
    );

    // Calculate user growth (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allUsersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.limit(1000)]
    );
    const userGrowth = allUsersResponse.documents.filter(
      (u: any) => new Date(u.created_at) >= thirtyDaysAgo
    ).length;

    const allProjectsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJECTS,
      [Query.limit(1000)]
    );
    const projectGrowth = allProjectsResponse.documents.filter(
      (p: any) => new Date(p.created_at) >= thirtyDaysAgo
    ).length;

    // Get growth data for charts (last 12 months, group by month)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const userGrowthData = computeMonthlyCounts(
      allUsersResponse.documents.filter((u: any) => new Date(u.created_at) >= twelveMonthsAgo)
    );
    const projectActivityData = computeMonthlyCounts(
      allProjectsResponse.documents.filter((p: any) => new Date(p.created_at) >= twelveMonthsAgo)
    );

    return {
      success: true,
      data: {
        totalUsers,
        totalProjects,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        activeContracts,
        userGrowth,
        projectGrowth,
        userGrowthData,
        projectActivityData,
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
  // Check cache first
  const cached = skillTrendsCache.get('skill_trends');
  if (cached) {
    return { success: true, data: cached };
  }

  try {
    // Fetch all open projects and compute skill trends in memory
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PROJECTS,
      [
        Query.equal('status', 'open'),
        Query.limit(1000),
      ]
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Extract skill usage from projects
    const skillMap = new Map<string, {
      projectCount: number;
      totalBudget: number;
      recentCount: number;
      olderCount: number;
    }>();

    for (const project of response.documents) {
      const skills = typeof (project as any).required_skills === 'string'
        ? JSON.parse((project as any).required_skills)
        : (project as any).required_skills || [];
      const budget = Number((project as any).budget || 0);
      const createdAt = new Date((project as any).created_at);
      const isRecent = createdAt >= thirtyDaysAgo;

      for (const skill of skills) {
        const skillName = typeof skill === 'string' ? skill : (skill.skill_name || skill.name);
        if (!skillName) continue;

        const existing = skillMap.get(skillName) || { projectCount: 0, totalBudget: 0, recentCount: 0, olderCount: 0 };
        existing.projectCount++;
        existing.totalBudget += budget;
        if (isRecent) {
          existing.recentCount++;
        } else {
          existing.olderCount++;
        }
        skillMap.set(skillName, existing);
      }
    }

    // Convert to SkillTrend array
    const data: SkillTrend[] = Array.from(skillMap.entries())
      .map(([skillName, stats]) => {
        const avgBudget = stats.projectCount > 0 ? stats.totalBudget / stats.projectCount : 0;
        const growthRate = stats.olderCount > 0
          ? Math.round(((stats.recentCount - stats.olderCount) / stats.olderCount) * 100 * 10) / 10
          : stats.recentCount > 0 ? 100.0 : 0.0;

        let demandLevel: 'high' | 'medium' | 'low';
        if (stats.projectCount >= 10) {
          demandLevel = 'high';
        } else if (stats.projectCount >= 3) {
          demandLevel = 'medium';
        } else {
          demandLevel = 'low';
        }

        return {
          skillId: skillName,
          skillName,
          demandLevel,
          projectCount: stats.projectCount,
          averageBudget: Math.round(avgBudget * 100) / 100,
          growthRate,
        };
      })
      .sort((a, b) => b.projectCount - a.projectCount)
      .slice(0, 20);

    // Cache the result
    skillTrendsCache.set('skill_trends', data);

    return {
      success: true,
      data,
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

function computeMonthlyCounts(documents: any[]): { month: string; count: number }[] {
  const monthMap = new Map<string, number>();

  for (const doc of documents) {
    const date = new Date(doc.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
  }

  return Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function calculateTopSkills(userId: string, userType: 'freelancer' | 'employer'): Promise<{ skill: string; projectCount: number }[]> {
  try {
    const idField = userType === 'freelancer' ? 'freelancer_id' : 'employer_id';

    // Fetch completed contracts for this user
    const contractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal(idField, userId),
        Query.equal('status', 'completed'),
        Query.limit(1000),
      ]
    );

    if (contractsResponse.documents.length === 0) {
      return [];
    }

    // Fetch projects for these contracts
    const projectIds = contractsResponse.documents.map((c: any) => c.project_id);
    const skillMap = new Map<string, number>();

    // Fetch each project (Appwrite doesn't support IN queries)
    for (const projectId of projectIds) {
      try {
        const projectDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJECTS, projectId);
        const skills = typeof (projectDoc as any).required_skills === 'string'
          ? JSON.parse((projectDoc as any).required_skills)
          : (projectDoc as any).required_skills || [];

        for (const skill of skills) {
          const skillName = typeof skill === 'string' ? skill : (skill.skill_name || skill.name);
          if (skillName) {
            skillMap.set(skillName, (skillMap.get(skillName) || 0) + 1);
          }
        }
      } catch {
        // Skip projects that can't be fetched
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
