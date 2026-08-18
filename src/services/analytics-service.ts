import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import type { Models } from 'node-appwrite';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import {
  platformMetricsCache,
  skillTrendsCache,
  freelancerAnalyticsCache,
  employerAnalyticsCache,
  adminAnalyticsCache,
} from '../utils/cache.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

/**
 * Fetch ALL documents matching the queries using cursor-based pagination (the
 * base-repository.fetchAll pattern, for this service's raw collection scans).
 * The old Query.limit(1000) silently undercounted: a user with more than 1000
 * completed contracts saw truncated earnings/spend totals (the limit(1000)
 * truncation class). Errors propagate to the caller.
 */
async function fetchAllCollection(collectionId: string, baseQueries: string[], pageSize = 100): Promise<Models.DefaultDocument[]> {
  const allDocs: Models.DefaultDocument[] = [];
  let lastId: string | undefined;

  while (true) {
    const queries = [...baseQueries, Query.limit(pageSize)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

    const response = await databases.listDocuments(DATABASE_ID, collectionId, queries);
    allDocs.push(...response.documents);

    if (response.documents.length < pageSize) break;
    lastId = response.documents[response.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return allDocs;
}

interface DateRangeOptions {
  startDate?: string;
  endDate?: string;
}

interface FreelancerAnalytics {
  totalEarnings: number;
  projectsCompleted: number;
  averageRating: number;
  earningsByMonth: { month: string; amount: number }[];
  topSkills: { skill: string; projectCount: number }[];
  proposalAcceptanceRate: number;
}

interface EmployerAnalytics {
  totalSpent: number;
  projectsPosted: number;
  projectsCompleted: number;
  averageProjectBudget: number;
  spendingByMonth: { month: string; amount: number }[];
  topHiredSkills: { skill: string; projectCount: number }[];
}

interface SkillTrend {
  skillId: string;
  skillName: string;
  demandLevel: 'high' | 'medium' | 'low';
  projectCount: number;
  averageBudget: number;
  growthRate: number;
}

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalContracts: number;
  totalTransactionVolume: number;
  activeUsers: number;
  completionRate: number;
}

interface AdminAnalytics {
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
 *
 * Cached per user + date range for 60s — this scans contracts, reviews, and
 * proposals (full cursor fetch each) plus per-project lookups, so a
 * frequently-polled dashboard shouldn't re-scan on every request. Only
 * successful results are cached; a failed computation is re-attempted on the
 * next request.
 */
export async function getFreelancerAnalytics(
  userId: string,
  options: DateRangeOptions = {}
): Promise<ServiceResult<FreelancerAnalytics>> {
  const cacheKey = `freelancer:${userId}:${options.startDate ?? ''}:${options.endDate ?? ''}`;
  const cached = freelancerAnalyticsCache.get(cacheKey);
  if (cached) {
    return successResult(cached);
  }

  try {
    const { startDate, endDate } = options;

    let contracts = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('freelancer_id', userId),
      Query.equal('status', 'completed'),
    ]);
    if (startDate) {
      contracts = contracts.filter(c => new Date(c.created_at) >= new Date(startDate));
    }
    if (endDate) {
      contracts = contracts.filter(c => new Date(c.created_at) <= new Date(endDate));
    }

    const totalEarnings = contracts.reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
    const projectsCompleted = contracts.length;

    const reviews = await fetchAllCollection(COLLECTIONS.REVIEWS, [
      Query.equal('reviewee_id', userId),
    ]);
    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
      : 0;

    const proposals = await fetchAllCollection(COLLECTIONS.PROPOSALS, [
      Query.equal('freelancer_id', userId),
    ]);

    const totalProposals = proposals.length;
    const acceptedProposals = proposals.filter(p => p.status === 'accepted').length;
    const proposalAcceptanceRate = totalProposals > 0 ? (acceptedProposals / totalProposals) * 100 : 0;

    const earningsByMonth = calculateEarningsByMonth(contracts);
    const topSkills = await calculateTopSkills(userId, 'freelancer');

    const data: FreelancerAnalytics = {
      totalEarnings,
      projectsCompleted,
      averageRating: Math.round(averageRating * 10) / 10,
      earningsByMonth,
      topSkills,
      proposalAcceptanceRate: Math.round(proposalAcceptanceRate * 10) / 10,
    };
    freelancerAnalyticsCache.set(cacheKey, data);
    return successResult(data);
      } catch (error) {
      logger.error('Failed to get freelancer analytics', { error, userId });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}

/**
 * Get employer analytics
 *
 * Cached per user + date range for 60s — this scans projects and contracts
 * (full cursor fetch each) plus per-project lookups, so a frequently-polled
 * dashboard shouldn't re-scan on every request. Only successful results are
 * cached.
 */
export async function getEmployerAnalytics(
  userId: string,
  options: DateRangeOptions = {}
): Promise<ServiceResult<EmployerAnalytics>> {
  const cacheKey = `employer:${userId}:${options.startDate ?? ''}:${options.endDate ?? ''}`;
  const cached = employerAnalyticsCache.get(cacheKey);
  if (cached) {
    return successResult(cached);
  }

  try {
    const { startDate, endDate } = options;

    const posted = await fetchAllCollection(COLLECTIONS.PROJECTS, [
      Query.equal('employer_id', userId),
    ]);

    let projectsPostedData = posted;
    if (startDate) {
      projectsPostedData = projectsPostedData.filter(p => new Date(p.created_at) >= new Date(startDate));
    }
    if (endDate) {
      projectsPostedData = projectsPostedData.filter(p => new Date(p.created_at) <= new Date(endDate));
    }

    const projectsPosted = projectsPostedData.length;
    const totalBudget = projectsPostedData.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    /* istanbul ignore next -- tested via getEmployerAnalytics with zero projects */
    const averageProjectBudget = projectsPosted > 0 ? totalBudget / projectsPosted : 0;

    let contracts = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('employer_id', userId),
      Query.equal('status', 'completed'),
    ]);
    if (startDate) {
      contracts = contracts.filter(c => new Date(c.created_at) >= new Date(startDate));
    }
    if (endDate) {
      contracts = contracts.filter(c => new Date(c.created_at) <= new Date(endDate));
    }

    const totalSpent = contracts.reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
    const projectsCompleted = contracts.length;

    const spendingByMonth = calculateEarningsByMonth(contracts);
    const topHiredSkills = await calculateTopSkills(userId, 'employer');

    const data: EmployerAnalytics = {
      totalSpent,
      projectsPosted,
      projectsCompleted,
      averageProjectBudget: Math.round(averageProjectBudget * 100) / 100,
      spendingByMonth,
      topHiredSkills,
    };
    employerAnalyticsCache.set(cacheKey, data);
    return successResult(data);
      } catch (error) {
      logger.error('Failed to get employer analytics', { error, userId });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}

/**
 * Get platform metrics
 */
export async function getPlatformMetrics(): Promise<ServiceResult<PlatformMetrics>> {
  const cached = platformMetricsCache.get('platform_metrics');
  if (cached) {
    return successResult(cached);
  }

  try {
    const [
      usersResponse,
      projectsResponse,
      contractsResponse,
      completedContractsResponse,
    ] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJECTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [
        Query.equal('status', 'completed'),
        Query.limit(1),
      ]),
    ]);

    const totalUsers = usersResponse.total;
    const totalProjects = projectsResponse.total;
    const totalContracts = contractsResponse.total;
    const completedContracts = completedContractsResponse.total;

    // Full cursor fetches — the old Query.limit(1000) undercounted volume and
    // active users past 1000 records (the limit(1000) truncation class).
    const completedDocs = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('status', 'completed'),
    ]);
    const totalTransactionVolume = completedDocs.reduce(
      (sum, c) => sum + Number(c.total_amount || 0), 0
    );

    const auditLogs = await fetchAllCollection(COLLECTIONS.AUDIT_LOG_ENTRIES, []);

    // Count active users (those with audit log entries in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUserIds = new Set<string>();
    for (const log of auditLogs) {
      if (new Date(log.created_at) >= thirtyDaysAgo && log.user_id) {
        activeUserIds.add(log.user_id);
      }
    }
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

    platformMetricsCache.set('platform_metrics', data);

    return successResult(data);
  } catch (error) {
    logger.error('Failed to get platform metrics', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get admin analytics
 *
 * Cached globally for 60s — this scans users, projects, contracts, and audit
 * logs (full cursor fetch each), so the admin dashboard shouldn't re-scan on
 * every poll. Only successful results are cached.
 */
export async function getAdminAnalytics(): Promise<ServiceResult<AdminAnalytics>> {
  const cached = adminAnalyticsCache.get('admin_analytics');
  if (cached) {
    return successResult(cached);
  }

  try {
    const [
      usersResponse,
      projectsResponse,
      activeContractsResponse,
    ] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTIONS.USERS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.PROJECTS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTIONS.CONTRACTS, [
        Query.equal('status', 'active'),
        Query.limit(1),
      ]),
    ]);

    const totalUsers = usersResponse.total;
    const totalProjects = projectsResponse.total;
    const activeContracts = activeContractsResponse.total;

    // Full cursor fetches — the old Query.limit(1000) undercounted revenue and
    // growth metrics past 1000 records (the limit(1000) truncation class).
    const completedContracts = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('status', 'completed'),
    ]);
    // Calculate total revenue (5% fee on completed contracts)
    const totalRevenue = completedContracts.reduce(
      (sum, c) => sum + Number(c.total_amount || 0) * 0.05, 0
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allUsers = await fetchAllCollection(COLLECTIONS.USERS, []);
    const userGrowth = allUsers.filter(
      u => new Date(u.created_at) >= thirtyDaysAgo
    ).length;

    const allProjects = await fetchAllCollection(COLLECTIONS.PROJECTS, []);
    const projectGrowth = allProjects.filter(
      p => new Date(p.created_at) >= thirtyDaysAgo
    ).length;

    // Get growth data for charts (last 12 months, group by month)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const userGrowthData = computeMonthlyCounts(
      allUsers.filter(u => new Date(u.created_at) >= twelveMonthsAgo)
    );
    const projectActivityData = computeMonthlyCounts(
      allProjects.filter(p => new Date(p.created_at) >= twelveMonthsAgo)
    );

    const data: AdminAnalytics = {
      totalUsers,
      totalProjects,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      activeContracts,
      userGrowth,
      projectGrowth,
      userGrowthData,
      projectActivityData,
    };
    adminAnalyticsCache.set('admin_analytics', data);
    return successResult(data);
      } catch (error) {
      logger.error('Failed to get admin analytics', { error });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}

/**
 * Get skill trends
 */
export async function getSkillTrends(): Promise<ServiceResult<SkillTrend[]>> {
  const cached = skillTrendsCache.get('skill_trends');
  if (cached) {
    return successResult(cached);
  }

  try {
    // Full cursor fetch — the old Query.limit(1000) counted demand only from
    // the newest 1000 open projects (the limit(1000) truncation class).
    const projects = await fetchAllCollection(COLLECTIONS.PROJECTS, [
      Query.equal('status', 'open'),
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const skillMap = new Map<string, {
      projectCount: number;
      totalBudget: number;
      recentCount: number;
      olderCount: number;
    }>();

    for (const project of projects) {
      const requiredSkills = project.required_skills;
      const skills: Array<string | { skill_name?: string; name?: string }> = typeof requiredSkills === 'string'
        ? JSON.parse(requiredSkills)
        : requiredSkills || [];
      const budget = Number(project.budget || 0);
      const createdAt = new Date(project.created_at);
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

    const data: SkillTrend[] = Array.from(skillMap.entries())
      .map(([skillName, stats]) => {
        /* istanbul ignore next -- skill in skillMap always has projectCount>0; :0 is structurally unreachable */
        const avgBudget = stats.projectCount > 0 ? stats.totalBudget / stats.projectCount : 0;
        /* istanbul ignore next -- skill in skillMap always has recentCount or olderCount>0; 0.0 branch is structurally unreachable */
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

    skillTrendsCache.set('skill_trends', data);

    return successResult(data);
  } catch (error) {
    logger.error('Failed to get skill trends', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}


function calculateEarningsByMonth(contracts: Models.DefaultDocument[]): { month: string; amount: number }[] {
  const monthMap = new Map<string, number>();

  for (const contract of contracts) {
    const date = new Date(contract.created_at);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    const current = monthMap.get(monthKey) || 0;
    monthMap.set(monthKey, current + Number(contract.total_amount || 0));
  }

  return Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function computeMonthlyCounts(documents: Models.DefaultDocument[]): { month: string; count: number }[] {
  const monthMap = new Map<string, number>();

  for (const doc of documents) {
    const date = new Date(doc.created_at);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
  }

  return Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function calculateTopSkills(userId: string, userType: 'freelancer' | 'employer'): Promise<{ skill: string; projectCount: number }[]> {
  try {
    const idField = userType === 'freelancer' ? 'freelancer_id' : 'employer_id';

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

    const projectIds = contractsResponse.documents.map(c => c.project_id);
    const skillMap = new Map<string, number>();

    // Fetch each project (Appwrite doesn't support IN queries)
    const projectSkillSets = await Promise.all(
      projectIds.map(async (projectId: string) => {
        try {
          const projectDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJECTS, projectId);
          const requiredSkills = projectDoc.required_skills;
          const skills: Array<string | { skill_name?: string; name?: string }> = typeof requiredSkills === 'string'
            ? JSON.parse(requiredSkills)
            : requiredSkills || [];

          return skills;
        } catch {
          return [] as Array<string | { skill_name?: string; name?: string }>;
        }
      })
    );

    for (const skills of projectSkillSets) {
      for (const skill of skills) {
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
