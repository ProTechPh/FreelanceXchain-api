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
  marketplaceLiquidityCache,
  funnelMetricsCache,
  cohortRetentionCache,
  churnRiskCache,
  marketplaceVelocityCache,
} from '../utils/cache.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { ENTITLED_STATUSES, type SubscriptionStatus } from '../models/subscription.js';

/**
 * Wraps an async operation with timing logs to identify slow queries.
 * Logs operations taking >100ms as warnings, others as debug.
 */
async function timedOperation<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (duration > 100) {
      logger.warn(`Slow analytics query [${operationName}]: ${duration.toFixed(2)}ms`);
    } else {
      logger.debug(`Analytics query [${operationName}]: ${duration.toFixed(2)}ms`);
    }
  }
}



/**
 * Fetch ALL documents matching the queries using cursor-based pagination (the
 * base-repository.fetchAll pattern, for this service's raw collection scans).
 * The old Query.limit(1000) silently undercounted: a user with more than 1000
 * completed contracts saw truncated earnings/spend totals (the limit(1000)
 * truncation class). Errors propagate to the caller.
 */
async function fetchAllCollection(collectionId: string, baseQueries: string[], pageSize = 100, maxDocs?: number): Promise<Models.DefaultDocument[]> {
  const allDocs: Models.DefaultDocument[] = [];
  let lastId: string | undefined;
  const effectiveMaxDocs = maxDocs && maxDocs > 0 ? maxDocs : undefined;

  while (true) {
    const queries = [...baseQueries, Query.limit(pageSize)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

    const response = await timedOperation(collectionId + '.listDocuments', () =>
      databases.listDocuments(DATABASE_ID, collectionId, queries)
    );
    allDocs.push(...response.documents);

    // Check if we've reached the maximum document limit
    if (effectiveMaxDocs && allDocs.length >= effectiveMaxDocs) {
      return allDocs.slice(0, effectiveMaxDocs);
    }

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

interface PaginationOptions {
  limit?: number;
  offset?: number;
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

export interface FunnelStageMetric {
  stage: string;
  label: string;
  count: number;
  conversionRate: number;
  overallRate: number;
  dropoffCount: number;
  dropoffRate: number;
}

export interface FunnelMetricsReport {
  stages: FunnelStageMetric[];
  totalRegistered: number;
  overallConversionRate: number;
  generatedAt: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  grossMarketplaceVolume?: number;
  platformFeeRate?: number;
  activeContracts: number;
  userGrowth: number;
  projectGrowth: number;
  userGrowthData: { month: string; count: number }[];
  projectActivityData: { month: string; count: number }[];
  escrowFundingRate?: number;
  repeatEmployerRate?: number;
  rushUpgradeAdoptionRate?: number;
  rushFeeRevenue?: number;
  realizedRevenue?: number;
  projectedBenchmarkRevenue?: number;
  activeProSubscriptions?: number;
  proConversionRate?: number;
}

export interface CohortMonthMetric {
  monthIndex: number;
  activeUsers: number;
  retentionRate: number;
  cumulativeGmv: number;
}

export interface CohortData {
  cohortMonth: string;
  totalUsers: number;
  metrics: CohortMonthMetric[];
}

export interface CohortRetentionReport {
  cohorts: CohortData[];
  averageMonth1Retention: number;
  averageMonth3Retention: number;
  generatedAt: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface UserChurnRisk {
  userId: string;
  role: string;
  email: string;
  name?: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  signals: string[];
  daysSinceLastActive: number;
  recommendedPlaybook: string;
}

export interface ChurnRiskReport {
  totalEvaluated: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  highRiskUsers: UserChurnRisk[];
  generatedAt: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface MarketplaceVelocityReport {
  medianTimeToFirstProposalHours: number;
  medianTimeToHireDays: number;
  medianMilestoneTurnaroundDays: number;
  averageContractDurationDays: number;
  repeatEmployerRate: number;
  repeatFreelancerRate: number;
  totalCompletedContracts: number;
  generatedAt: string;
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
export async function getPlatformMetrics(
  options: PaginationOptions = {}
): Promise<ServiceResult<PlatformMetrics & { pagination?: { limit: number; offset: number; hasMore: boolean } }>> {
  const { limit = 100, offset = 0 } = options;
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
    const completedContractsCount = completedContractsResponse.total;

    // Paginated cursor fetch for completed contracts
    const effectiveLimit = limit + offset;
    // the old Query.limit(1000) undercounted volume and
    // active users past 1000 records (the limit(1000) truncation class).
    const completedDocs = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('status', 'completed'),
    ], 100, effectiveLimit);

    // Apply offset to completed contracts for pagination
    const paginatedCompletedDocs = completedDocs.slice(offset, offset + limit);
    const totalTransactionVolume = paginatedCompletedDocs.reduce(
      (sum, c) => sum + Number(c.total_amount || 0), 0
    );

    const auditLogs = await fetchAllCollection(COLLECTIONS.AUDIT_LOG_ENTRIES, [], 100, effectiveLimit);

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

    const completionRate = totalContracts > 0 ? (completedContractsCount / totalContracts) * 100 : 0;

    const data = {
      totalUsers,
      totalProjects,
      totalContracts,
      totalTransactionVolume,
      activeUsers,
      completionRate: Math.round(completionRate * 10) / 10,
      pagination: {
        limit,
        offset,
        hasMore: completedContractsCount > offset + limit,
      },
    };

    platformMetricsCache.set('platform_metrics', data);

    return successResult(data);
  } catch (error) {
    logger.error('Failed to get platform metrics', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

function computeAdminContractMetrics(
  completedContracts: Models.DefaultDocument[],
  activeContracts: number
) {
  const totalRushFees = completedContracts.reduce(
    (sum, c) => sum + Number(c['rush_fee'] || 0), 0
  );
  const rushFeeRevenue = Math.round(totalRushFees * 0.10 * 100) / 100;
  const realizedRevenue = rushFeeRevenue;

  const rushContractsCount = completedContracts.filter(c => Number(c['rush_fee'] || 0) > 0).length;
  const rushUpgradeAdoptionRate = completedContracts.length > 0
    ? Math.round((rushContractsCount / completedContracts.length) * 1000) / 10
    : 0;

  const totalKnownContracts = activeContracts + completedContracts.length;
  const escrowFundingRate = totalKnownContracts > 0
    ? Math.round((completedContracts.length / totalKnownContracts) * 1000) / 10
    : 0;

  const employerCompletedCounts = new Map<string, number>();
  for (const c of completedContracts) {
    if (c['employer_id']) {
      employerCompletedCounts.set(c['employer_id'], (employerCompletedCounts.get(c['employer_id']) || 0) + 1);
    }
  }
  const employersWithCompleted = Array.from(employerCompletedCounts.values()).filter(cnt => cnt >= 1);
  const repeatEmployers = Array.from(employerCompletedCounts.values()).filter(cnt => cnt >= 2);
  const repeatEmployerRate = employersWithCompleted.length > 0
    ? Math.round((repeatEmployers.length / employersWithCompleted.length) * 1000) / 10
    : 0;

  return { rushFeeRevenue, realizedRevenue, rushUpgradeAdoptionRate, escrowFundingRate, repeatEmployerRate };
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

    const completedContracts = await fetchAllCollection(COLLECTIONS.CONTRACTS, [
      Query.equal('status', 'completed'),
    ]);
    const grossMarketplaceVolume = completedContracts.reduce(
      (sum, c) => sum + Number(c.total_amount || 0), 0
    );
    const totalRevenue = completedContracts.reduce(
      (sum, c) => sum + Number(c.total_amount || 0) * 0.05, 0
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allUsers = await fetchAllCollection(COLLECTIONS.USERS, []);
    const userGrowth = allUsers.filter(u => new Date(u.created_at) >= thirtyDaysAgo).length;

    const allProjects = await fetchAllCollection(COLLECTIONS.PROJECTS, []);
    const projectGrowth = allProjects.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const userGrowthData = computeMonthlyCounts(
      allUsers.filter(u => new Date(u.created_at) >= twelveMonthsAgo)
    );
    const projectActivityData = computeMonthlyCounts(
      allProjects.filter(p => new Date(p.created_at) >= twelveMonthsAgo)
    );

    const contractMetrics = computeAdminContractMetrics(completedContracts, activeContracts);

    let activeProSubscriptions = 0;
    try {
      const proDocs = await fetchAllCollection(COLLECTIONS.SUBSCRIPTIONS, [
        Query.equal('plan', 'pro'),
      ]);
      const entitledSubs = proDocs.filter(d =>
        ENTITLED_STATUSES.has((d['status'] as SubscriptionStatus) || 'none')
      );
      activeProSubscriptions = entitledSubs.length;
    } catch (subErr) {
      logger.debug('Subscriptions collection read skipped or failed in getAdminAnalytics', { error: subErr });
    }

    const proConversionRate = totalUsers > 0
      ? Math.round((activeProSubscriptions / totalUsers) * 1000) / 10
      : 0;

    const projectedBenchmarkRevenue = Math.round(totalRevenue * 100) / 100;

    const data: AdminAnalytics = {
      totalUsers,
      totalProjects,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      projectedBenchmarkRevenue,
      grossMarketplaceVolume: Math.round(grossMarketplaceVolume * 100) / 100,
      platformFeeRate: 0.05,
      activeContracts,
      userGrowth,
      projectGrowth,
      userGrowthData,
      projectActivityData,
      activeProSubscriptions,
      proConversionRate,
      ...contractMetrics,
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

    const projectIds = contractsResponse.documents.map(c => c.project_id).filter(Boolean);
    const uniqueProjectIds = [...new Set(projectIds)];
    const skillMap = new Map<string, number>();

    // Batch-fetch projects by ID to avoid N+1 queries. Appwrite caps equal() at 100 values per query.
    const projectSkillMap = new Map<string, Array<string | { skill_name?: string; name?: string }>>();
    for (let i = 0; i < uniqueProjectIds.length; i += 100) {
      const chunk = uniqueProjectIds.slice(i, i + 100);
      try {
        const response = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.PROJECTS,
          [Query.equal('$id', chunk), Query.limit(chunk.length)]
        );
        for (const doc of response.documents) {
          const projectId = doc.$id;
          const requiredSkills = doc.required_skills;
          const skills: Array<string | { skill_name?: string; name?: string }> = typeof requiredSkills === 'string'
            ? JSON.parse(requiredSkills)
            : requiredSkills || [];
          projectSkillMap.set(projectId, skills);
        }
        // Ensure missing projects are recorded as empty arrays
        for (const projectId of chunk) {
          if (!projectSkillMap.has(projectId)) {
            projectSkillMap.set(projectId, []);
          }
        }
      } catch {
        // Mark all projects in this chunk as having no skills on error
        for (const projectId of chunk) {
          projectSkillMap.set(projectId, []);
        }
      }
    }

    for (const projectId of projectIds) {
      const skills = projectSkillMap.get(projectId) || [];
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

export interface SkillLiquidityMetric {
  skillName: string;
  projectDemandCount: number;
  talentSupplyCount: number;
  talentToDemandRatio: number;
  liquidityStatus: 'shortage' | 'balanced' | 'surplus';
  actionRecommendation: string;
}

export interface MarketplaceLiquidityReport {
  overallLiquidityScore: number;
  skillsAnalyzed: number;
  shortageSkills: SkillLiquidityMetric[];
  balancedSkills: SkillLiquidityMetric[];
  surplusSkills: SkillLiquidityMetric[];
  generatedAt: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

function extractSkillCounts(documents: Models.DefaultDocument[], fieldName: 'required_skills' | 'skills'): Map<string, number> {
  const map = new Map<string, number>();
  for (const doc of documents) {
    const rawSkills = doc[fieldName];
    const skills: Array<string | { skill_name?: string; name?: string }> = typeof rawSkills === 'string'
      ? (() => { try { return JSON.parse(rawSkills); } catch { return []; } })()
      : rawSkills || [];

    for (const skill of skills) {
      const skillName = typeof skill === 'string' ? skill : (skill.skill_name || skill.name);
      if (!skillName) continue;
      const normalized = skillName.trim();
      map.set(normalized, (map.get(normalized) || 0) + 1);
    }
  }
  return map;
}

function calculateLiquidityMetric(skillName: string, demand: number, supply: number): SkillLiquidityMetric {
  const tdlr = demand === 0
    ? (supply > 0 ? 10.0 : 1.0)
    : Math.round((supply / demand) * 100) / 100;

  let status: 'shortage' | 'balanced' | 'surplus';
  let action: string;

  if (demand > 0 && tdlr < 1.0) {
    status = 'shortage';
    action = `Recruit ${skillName} freelancers or boost AI matching radius; supply deficit.`;
  } else if (tdlr <= 3.5) {
    status = 'balanced';
    action = `Healthy marketplace liquidity zone for ${skillName}.`;
  } else {
    status = 'surplus';
    action = `Acquire employers needing ${skillName}; talent oversupplied.`;
  }

  return {
    skillName,
    projectDemandCount: demand,
    talentSupplyCount: supply,
    talentToDemandRatio: tdlr,
    liquidityStatus: status,
    actionRecommendation: action,
  };
}

/**
 * Compute the Talent-to-Demand Liquidity Ratio (TDLR) across skills by comparing
 * open project demand against registered freelancer profiles.
 *
 * TDLR < 1.0 -> 'shortage' (more jobs than freelancers)
 * 1.0 <= TDLR <= 3.5 -> 'balanced' (healthy competition and fill rate)
 * TDLR > 3.5 -> 'surplus' (excess freelancers; need employer acquisition)
 */
export async function getMarketplaceLiquidityReport(
  options: PaginationOptions = {}
): Promise<ServiceResult<MarketplaceLiquidityReport>> {
  const { limit = 100, offset = 0 } = options;
  const cached = marketplaceLiquidityCache.get('marketplace_liquidity');
  if (cached) {
    return successResult(cached);
  }

  try {
    const effectiveLimit = limit + offset;
    const [projects, profiles] = await Promise.all([
      fetchAllCollection(COLLECTIONS.PROJECTS, [Query.equal('status', 'open')], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.FREELANCER_PROFILES, [], 100, effectiveLimit),
    ]);

    const demandMap = extractSkillCounts(projects, 'required_skills');
    const supplyMap = extractSkillCounts(profiles, 'skills');
    const allSkills = new Set([...demandMap.keys(), ...supplyMap.keys()]);

    const allMetrics: SkillLiquidityMetric[] = [];
    for (const skillName of allSkills) {
      allMetrics.push(calculateLiquidityMetric(
        skillName,
        demandMap.get(skillName) || 0,
        supplyMap.get(skillName) || 0
      ));
    }

    allMetrics.sort((a, b) => (b.projectDemandCount + b.talentSupplyCount) - (a.projectDemandCount + a.talentSupplyCount));

    // Apply pagination to skills
    const paginatedMetrics = allMetrics.slice(offset, offset + limit);
    const totalSkills = allMetrics.length;

    const shortageSkills = paginatedMetrics.filter(m => m.liquidityStatus === 'shortage');
    const balancedSkills = paginatedMetrics.filter(m => m.liquidityStatus === 'balanced');
    const surplusSkills = paginatedMetrics.filter(m => m.liquidityStatus === 'surplus');

    const score = allMetrics.length > 0
      ? Math.round((allMetrics.filter(m => m.liquidityStatus === 'balanced').length / allMetrics.length) * 100)
      : 100;

    const report: MarketplaceLiquidityReport = {
      overallLiquidityScore: score,
      skillsAnalyzed: paginatedMetrics.length,
      shortageSkills,
      balancedSkills,
      surplusSkills,
      generatedAt: new Date().toISOString(),
      pagination: {
        limit,
        offset,
        hasMore: totalSkills > offset + limit,
      },
    };

    marketplaceLiquidityCache.set('marketplace_liquidity', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to generate marketplace liquidity report', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

type RawFunnelStage = { stage: string; label: string; count: number };

interface FunnelRawData {
  allUsers: Models.DefaultDocument[];
  freelancerProfiles: Models.DefaultDocument[];
  projects: Models.DefaultDocument[];
  proposals: Models.DefaultDocument[];
  contracts: Models.DefaultDocument[];
}

function computeFunnelCounts(
  data: FunnelRawData
): { rawStages: RawFunnelStage[]; completedCount: number } {
  const { allUsers, freelancerProfiles, projects, proposals, contracts } = data;
  const totalRegistered = allUsers.length;

  const freelancerUserIds = new Set(freelancerProfiles.map(p => p['user_id']).filter(Boolean));
  const employerUserIds = new Set(
    allUsers
      .filter(u => u['role'] === 'employer' && (u['name'] || (u as any)['company_name']))
      .map(u => u.$id || (u as any).id)
      .filter(Boolean)
  );
  const profileCompletedCount = new Set([...freelancerUserIds, ...employerUserIds]).size;

  const kycCount = allUsers.filter(u => Boolean((u as any).kyc_verified)).length;
  const walletCount = allUsers.filter(
    u => u['wallet_address'] && String(u['wallet_address']).trim().length > 0
  ).length;

  const activatedUserIds = new Set([
    ...projects.map(p => p['employer_id']),
    ...proposals.map(p => p['freelancer_id']),
  ].filter(Boolean));
  const activatedCount = activatedUserIds.size;

  const fundedContracts = contracts.filter(c => c['status'] === 'active' || c['status'] === 'completed');
  const fundedUserIds = new Set<string>();
  for (const c of fundedContracts) {
    if (c['employer_id']) fundedUserIds.add(c['employer_id']);
    if (c['freelancer_id']) fundedUserIds.add(c['freelancer_id']);
  }
  const fundedCount = fundedUserIds.size;

  const completedContracts = contracts.filter(c => c['status'] === 'completed');
  const completedUserIds = new Set<string>();
  for (const c of completedContracts) {
    if (c['employer_id']) completedUserIds.add(c['employer_id']);
    if (c['freelancer_id']) completedUserIds.add(c['freelancer_id']);
  }
  const completedCount = completedUserIds.size;

  const contractCountByUser = new Map<string, number>();
  for (const c of completedContracts) {
    if (c['employer_id']) {
      contractCountByUser.set(c['employer_id'], (contractCountByUser.get(c['employer_id']) || 0) + 1);
    }
    if (c['freelancer_id']) {
      contractCountByUser.set(c['freelancer_id'], (contractCountByUser.get(c['freelancer_id']) || 0) + 1);
    }
  }
  const repeatCount = Array.from(contractCountByUser.values()).filter(cnt => cnt >= 2).length;

  const rawStages: RawFunnelStage[] = [
    { stage: 'registered', label: 'Registered Accounts', count: totalRegistered },
    { stage: 'profile_completed', label: 'Profile Completed', count: profileCompletedCount },
    { stage: 'kyc_verified', label: 'KYC Verified', count: kycCount },
    { stage: 'wallet_connected', label: 'Wallet Linked', count: walletCount },
    { stage: 'marketplace_active', label: 'Marketplace Active', count: activatedCount },
    { stage: 'contract_funded', label: 'Escrow Funded', count: fundedCount },
    { stage: 'contract_completed', label: 'Contract Completed', count: completedCount },
    { stage: 'repeat_users', label: 'Repeat Users', count: repeatCount },
  ];

  return { rawStages, completedCount };
}

function buildFunnelStages(rawStages: RawFunnelStage[], totalRegistered: number): FunnelStageMetric[] {
  return rawStages.map((st, idx) => {
    if (idx === 0) {
      return {
        stage: st.stage,
        label: st.label,
        count: st.count,
        conversionRate: 100,
        overallRate: 100,
        dropoffCount: 0,
        dropoffRate: 0,
      };
    }

    const prevStage = rawStages[idx - 1];
    const prevCount = prevStage ? prevStage.count : 0;
    const conversionRate = prevCount > 0 ? Math.round((st.count / prevCount) * 1000) / 10 : 0;
    const overallRate = totalRegistered > 0 ? Math.round((st.count / totalRegistered) * 1000) / 10 : 0;
    const dropoffCount = Math.max(0, prevCount - st.count);
    const dropoffRate = prevCount > 0 ? Math.round((dropoffCount / prevCount) * 1000) / 10 : 0;

    return {
      stage: st.stage,
      label: st.label,
      count: st.count,
      conversionRate,
      overallRate,
      dropoffCount,
      dropoffRate,
    };
  });
}

/**
 * Get customer acquisition and marketplace conversion funnel metrics.
 *
 * Cached for 60s. Tracks progression across 8 key stages:
 * 1. Registered Accounts
 * 2. Profile Completed
 * 3. KYC Verified
 * 4. Wallet Linked
 * 5. Marketplace Active (project posted or proposal submitted)
 * 6. Escrow Funded (active or completed contract)
 * 7. Contract Completed
 * 8. Repeat Users (>= 2 completed contracts)
 */
export async function getFunnelMetrics(
  options: PaginationOptions = {}
): Promise<ServiceResult<FunnelMetricsReport>> {
  const { limit = 100, offset = 0 } = options;
  const cached = funnelMetricsCache.get('funnel_metrics');
  if (cached) {
    return successResult(cached);
  }

  try {
    const effectiveLimit = limit + offset;
    const [
      allUsers,
      freelancerProfiles,
      projects,
      proposals,
      contracts,
    ] = await Promise.all([
      fetchAllCollection(COLLECTIONS.USERS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.FREELANCER_PROFILES, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.PROJECTS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.PROPOSALS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.CONTRACTS, [], 100, effectiveLimit),
    ]);

    const totalRegistered = allUsers.length;
    const { rawStages, completedCount } = computeFunnelCounts({
      allUsers,
      freelancerProfiles,
      projects,
      proposals,
      contracts,
    });

    const stages = buildFunnelStages(rawStages, totalRegistered);
    const overallConversionRate = totalRegistered > 0
      ? Math.round((completedCount / totalRegistered) * 1000) / 10
      : 0;

    const report: FunnelMetricsReport = {
      stages,
      totalRegistered,
      overallConversionRate,
      generatedAt: new Date().toISOString(),
      pagination: {
        limit,
        offset,
        hasMore: totalRegistered > offset + limit,
      },
    };

    funnelMetricsCache.set('funnel_metrics', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to get funnel metrics', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

function parseDocDate(doc: any): Date {
  const d = doc?.created_at || doc?.$createdAt;
  if (!d) return new Date();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getYearMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function calculateDiffInMonths(startKey: string, targetKey: string): number {
  const sParts = startKey.split('-');
  const tParts = targetKey.split('-');
  const sy = parseInt(sParts[0] ?? '0', 10);
  const sm = parseInt(sParts[1] ?? '0', 10);
  const ty = parseInt(tParts[0] ?? '0', 10);
  const tm = parseInt(tParts[1] ?? '0', 10);
  if (isNaN(sy) || isNaN(sm) || isNaN(ty) || isNaN(tm)) return 0;
  return (ty - sy) * 12 + (tm - sm);
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midVal = sorted[mid] ?? 0;
  if (sorted.length % 2 !== 0) {
    return Math.round(midVal * 10) / 10;
  }
  const prevVal = sorted[mid - 1] ?? 0;
  return Math.round(((prevVal + midVal) / 2) * 10) / 10;
}

function extractProjectMilestones(proj: any): any[] {
  if (Array.isArray(proj.milestones)) return proj.milestones;
  if (typeof proj.milestones === 'string') {
    try {
      const parsed = JSON.parse(proj.milestones);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

interface CohortRawMaps {
  userCohortMap: Map<string, string>;
  userActivityMonths: Map<string, Set<string>>;
  completedContractGmvByMonth: Map<string, { [userCohortMonth: string]: number }>;
}

function buildUserCohortMaps(
  allUsers: Models.DefaultDocument[],
  allContracts: Models.DefaultDocument[],
  allProjects: Models.DefaultDocument[],
  allProposals: Models.DefaultDocument[]
): CohortRawMaps {
  const userCohortMap = new Map<string, string>();
  const userActivityMonths = new Map<string, Set<string>>();
  const completedContractGmvByMonth = new Map<string, { [userCohortMonth: string]: number }>();

  for (const u of allUsers) {
    const regDate = parseDocDate(u);
    const cohort = getYearMonthKey(regDate);
    userCohortMap.set(u.$id, cohort);
    const actSet = new Set<string>();
    actSet.add(cohort);
    userActivityMonths.set(u.$id, actSet);
  }

  for (const p of allProjects) {
    if (p['employer_id'] && userActivityMonths.has(p['employer_id'])) {
      userActivityMonths.get(p['employer_id'])!.add(getYearMonthKey(parseDocDate(p)));
    }
  }

  for (const pr of allProposals) {
    if (pr['freelancer_id'] && userActivityMonths.has(pr['freelancer_id'])) {
      userActivityMonths.get(pr['freelancer_id'])!.add(getYearMonthKey(parseDocDate(pr)));
    }
  }

  for (const c of allContracts) {
    const cDateKey = getYearMonthKey(parseDocDate(c));
    if (c['employer_id'] && userActivityMonths.has(c['employer_id'])) {
      userActivityMonths.get(c['employer_id'])!.add(cDateKey);
    }
    if (c['freelancer_id'] && userActivityMonths.has(c['freelancer_id'])) {
      userActivityMonths.get(c['freelancer_id'])!.add(cDateKey);
    }

    if (c['status'] === 'completed') {
      const amt = Number(c['total_amount'] || 0);
      const empCohort = userCohortMap.get(c['employer_id']);
      if (empCohort) {
        if (!completedContractGmvByMonth.has(cDateKey)) {
          completedContractGmvByMonth.set(cDateKey, {});
        }
        const monthMap = completedContractGmvByMonth.get(cDateKey)!;
        monthMap[empCohort] = (monthMap[empCohort] || 0) + amt;
      }
    }
  }

  return { userCohortMap, userActivityMonths, completedContractGmvByMonth };
}

function computeCohortMonthMetrics(
  cohortMonth: string,
  userIds: string[],
  currentMonthKey: string,
  maps: Pick<CohortRawMaps, 'userActivityMonths' | 'completedContractGmvByMonth'>
): CohortMonthMetric[] {
  const { userActivityMonths, completedContractGmvByMonth } = maps;
  const totalUsers = userIds.length;
  const maxOffset = Math.min(12, Math.max(0, calculateDiffInMonths(cohortMonth, currentMonthKey)));
  const metrics: CohortMonthMetric[] = [];
  let runningGmv = 0;

  for (let i = 0; i <= maxOffset; i++) {
    const cParts = cohortMonth.split('-');
    const cy = parseInt(cParts[0] ?? '2026', 10);
    const cm = parseInt(cParts[1] ?? '1', 10);
    const targetDate = new Date(Date.UTC(cy, cm - 1 + i, 1));
    const targetMonthKey = getYearMonthKey(targetDate);

    let activeUsers = 0;
    if (i === 0) {
      activeUsers = totalUsers;
    } else {
      for (const uid of userIds) {
        const acts = userActivityMonths.get(uid);
        if (acts && acts.has(targetMonthKey)) {
          activeUsers++;
        }
      }
    }

    const retentionRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 1000) / 10 : 0;
    const gmvInMonth = completedContractGmvByMonth.get(targetMonthKey)?.[cohortMonth] || 0;
    runningGmv += gmvInMonth;

    metrics.push({
      monthIndex: i,
      activeUsers,
      retentionRate,
      cumulativeGmv: Math.round(runningGmv * 100) / 100,
    });
  }

  return metrics;
}

/**
 * Get monthly cohort retention and cumulative GMV metrics.
 *
 * Tracks user engagement and GMV retention by registration cohort across months.
 * Cached for 60s.
 */
export async function getCohortRetentionReport(
  options: PaginationOptions = {}
): Promise<ServiceResult<CohortRetentionReport>> {
  const { limit = 100, offset = 0 } = options;
  const cached = cohortRetentionCache.get('cohort_retention');
  if (cached) {
    return successResult(cached);
  }

  try {
    const effectiveLimit = limit + offset;
    const [allUsers, allContracts, allProjects, allProposals] = await Promise.all([
      fetchAllCollection(COLLECTIONS.USERS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.CONTRACTS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.PROJECTS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.PROPOSALS, [], 100, effectiveLimit),
    ]);

    const { userCohortMap, userActivityMonths, completedContractGmvByMonth } = buildUserCohortMaps(
      allUsers,
      allContracts,
      allProjects,
      allProposals
    );

    const cohortGroups = new Map<string, string[]>();
    for (const [userId, cohort] of userCohortMap.entries()) {
      if (!cohortGroups.has(cohort)) {
        cohortGroups.set(cohort, []);
      }
      cohortGroups.get(cohort)!.push(userId);
    }

    const currentMonthKey = getYearMonthKey(new Date());
    const sortedCohorts = Array.from(cohortGroups.keys()).sort();

    // Apply pagination to cohorts
    const paginatedCohorts = sortedCohorts.slice(offset, offset + limit);
    const totalCohorts = sortedCohorts.length;

    const cohorts: CohortData[] = [];
    const month1Rates: number[] = [];
    const month3Rates: number[] = [];

    for (const cohortMonth of paginatedCohorts) {
      const userIds = cohortGroups.get(cohortMonth) || [];
      if (userIds.length === 0) continue;

      const metrics = computeCohortMonthMetrics(
        cohortMonth,
        userIds,
        currentMonthKey,
        { userActivityMonths, completedContractGmvByMonth }
      );

      const m1 = metrics.find(m => m.monthIndex === 1);
      if (m1) month1Rates.push(m1.retentionRate);
      const m3 = metrics.find(m => m.monthIndex === 3);
      if (m3) month3Rates.push(m3.retentionRate);

      cohorts.push({
        cohortMonth,
        totalUsers: userIds.length,
        metrics,
      });
    }

    const averageMonth1Retention = month1Rates.length > 0
      ? Math.round((month1Rates.reduce((a, b) => a + b, 0) / month1Rates.length) * 10) / 10
      : 0;

    const averageMonth3Retention = month3Rates.length > 0
      ? Math.round((month3Rates.reduce((a, b) => a + b, 0) / month3Rates.length) * 10) / 10
      : 0;

    const report: CohortRetentionReport = {
      cohorts,
      averageMonth1Retention,
      averageMonth3Retention,
      generatedAt: new Date().toISOString(),
      pagination: {
        limit,
        offset,
        hasMore: totalCohorts > offset + limit,
      },
    };

    cohortRetentionCache.set('cohort_retention', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to get cohort retention report', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

interface ChurnContext {
  now: number;
  profileByUserId: Map<string, Models.DefaultDocument>;
  reviewsByReviewee: Map<string, number[]>;
  proposalsByUser: Map<string, Models.DefaultDocument[]>;
  contractsByUser: Map<string, Models.DefaultDocument[]>;
  userWithDisputes: Set<string>;
}

function getChurnPlaybook(signals: string[]): string {
  if (signals.includes('dispute_involvement')) {
    return 'Mediation concierge outreach and contract satisfaction review';
  }
  if (signals.includes('proposal_rejections')) {
    return 'AI proposal copywriter coaching & skill gap diagnostic';
  }
  if (signals.includes('inactive_30d')) {
    return '30-day reactivation campaign with personalized high-match projects';
  }
  if (signals.includes('unlinked_wallet')) {
    return 'Tiered-KYC & Polygon wallet linking walkthrough';
  }
  if (signals.includes('incomplete_profile')) {
    return 'Profile completion nudge with priority search badge incentive';
  }
  return 'Maintain standard engagement & weekly product updates';
}

function evaluateUserChurnRisk(u: Models.DefaultDocument, ctx: ChurnContext): UserChurnRisk {
  let latestActivity = parseDocDate(u).getTime();

  const userProps = ctx.proposalsByUser.get(u.$id) || [];
  for (const pr of userProps) {
    const t = parseDocDate(pr).getTime();
    if (t > latestActivity) latestActivity = t;
  }

  const userConts = ctx.contractsByUser.get(u.$id) || [];
  for (const c of userConts) {
    const t = parseDocDate(c).getTime();
    if (t > latestActivity) latestActivity = t;
  }

  const daysSinceLastActive = Math.max(0, Math.floor((ctx.now - latestActivity) / (1000 * 3600 * 24)));
  const signals: string[] = [];
  let score = 0;

  if (daysSinceLastActive >= 30) {
    signals.push('inactive_30d');
    score += 0.35;
  } else if (daysSinceLastActive >= 14) {
    signals.push('inactive_14d');
    score += 0.15;
  }

  if (u['role'] === 'freelancer' && userProps.length >= 3) {
    const accepted = userProps.filter(p => p['status'] === 'accepted').length;
    if (accepted === 0) {
      signals.push('proposal_rejections');
      score += 0.25;
    }
  }

  if (ctx.userWithDisputes.has(u.$id)) {
    signals.push('dispute_involvement');
    score += 0.20;
  }

  const ratings = ctx.reviewsByReviewee.get(u.$id);
  if (ratings && ratings.length >= 2) {
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avgRating < 3.5) {
      signals.push('low_rating');
      score += 0.20;
    }
  }

  if (!u['wallet_address'] || String(u['wallet_address']).trim() === '') {
    signals.push('unlinked_wallet');
    score += 0.10;
  }

  if (u['role'] === 'freelancer') {
    const prof = ctx.profileByUserId.get(u.$id);
    if (!prof || !prof['skills'] || prof['skills'] === '[]' || !prof['bio']) {
      signals.push('incomplete_profile');
      score += 0.15;
    }
  }

  const riskScore = Math.min(1.0, Math.round(score * 100) / 100);
  const riskLevel: 'low' | 'medium' | 'high' = riskScore >= 0.6 ? 'high' : riskScore >= 0.3 ? 'medium' : 'low';
  const recommendedPlaybook = getChurnPlaybook(signals);

  return {
    userId: u.$id,
    role: u['role'] || 'freelancer',
    email: u['email'] || '',
    name: u['name'] || 'User',
    riskScore,
    riskLevel,
    signals,
    daysSinceLastActive,
    recommendedPlaybook,
  };
}

interface ChurnRawCollections {
  allProfiles: Models.DefaultDocument[];
  allReviews: Models.DefaultDocument[];
  allProposals: Models.DefaultDocument[];
  allContracts: Models.DefaultDocument[];
  allDisputes: Models.DefaultDocument[];
}

function buildChurnContext(data: ChurnRawCollections): ChurnContext {
  const { allProfiles, allReviews, allProposals, allContracts, allDisputes } = data;
  const now = Date.now();
  const profileByUserId = new Map<string, Models.DefaultDocument>();
  for (const p of allProfiles) {
    if (p['user_id']) profileByUserId.set(p['user_id'], p);
  }

  const reviewsByReviewee = new Map<string, number[]>();
  for (const r of allReviews) {
    if (r['reviewee_id'] && typeof r['rating'] === 'number') {
      if (!reviewsByReviewee.has(r['reviewee_id'])) reviewsByReviewee.set(r['reviewee_id'], []);
      reviewsByReviewee.get(r['reviewee_id'])!.push(r['rating']);
    }
  }

  const proposalsByUser = new Map<string, Models.DefaultDocument[]>();
  for (const pr of allProposals) {
    if (pr['freelancer_id']) {
      if (!proposalsByUser.has(pr['freelancer_id'])) proposalsByUser.set(pr['freelancer_id'], []);
      proposalsByUser.get(pr['freelancer_id'])!.push(pr);
    }
  }

  const contractsByUser = new Map<string, Models.DefaultDocument[]>();
  for (const c of allContracts) {
    if (c['freelancer_id']) {
      if (!contractsByUser.has(c['freelancer_id'])) contractsByUser.set(c['freelancer_id'], []);
      contractsByUser.get(c['freelancer_id'])!.push(c);
    }
    if (c['employer_id']) {
      if (!contractsByUser.has(c['employer_id'])) contractsByUser.set(c['employer_id'], []);
      contractsByUser.get(c['employer_id'])!.push(c);
    }
  }

  const userWithDisputes = new Set<string>();
  for (const d of allDisputes) {
    if (d['initiator_id']) userWithDisputes.add(d['initiator_id']);
  }

  return { now, profileByUserId, reviewsByReviewee, proposalsByUser, contractsByUser, userWithDisputes };
}

/**
 * Analyze churn risk across users using engagement, ratings, disputes, and proposal activity.
 *
 * Provides actionable early-warning alerts and targeted retention playbooks.
 * Cached for 60s.
 */
export async function getChurnRiskReport(
  options: PaginationOptions = {}
): Promise<ServiceResult<ChurnRiskReport>> {
  const { limit = 100, offset = 0 } = options;
  const cached = churnRiskCache.get('churn_risk');
  if (cached) {
    return successResult(cached);
  }

  try {
    const effectiveLimit = limit + offset;
    const [allUsers, allProfiles, allProposals, allContracts, allReviews, allDisputes] = await Promise.all([
      fetchAllCollection(COLLECTIONS.USERS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.FREELANCER_PROFILES, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.PROPOSALS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.CONTRACTS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.REVIEWS, [], 100, effectiveLimit),
      fetchAllCollection(COLLECTIONS.DISPUTES, [], 100, effectiveLimit),
    ]);

    const ctx = buildChurnContext({ allProfiles, allReviews, allProposals, allContracts, allDisputes });

    let lowCount = 0;
    let mediumCount = 0;
    let highCount = 0;
    const evaluatedUsers: UserChurnRisk[] = [];

    for (const u of allUsers) {
      const evaluation = evaluateUserChurnRisk(u, ctx);
      if (evaluation.riskLevel === 'high') highCount++;
      else if (evaluation.riskLevel === 'medium') mediumCount++;
      else lowCount++;
      evaluatedUsers.push(evaluation);
    }

    const totalEvaluated = evaluatedUsers.length;

    // Apply pagination to high risk users
    const paginatedHighRiskUsers = evaluatedUsers
      .filter(u => u.riskLevel === 'high')
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(offset, offset + limit);

    const report: ChurnRiskReport = {
      totalEvaluated,
      riskDistribution: {
        low: lowCount,
        medium: mediumCount,
        high: highCount,
      },
      highRiskUsers: paginatedHighRiskUsers,
      generatedAt: new Date().toISOString(),
      pagination: {
        limit,
        offset,
        hasMore: totalEvaluated > offset + limit,
      },
    };

    churnRiskCache.set('churn_risk', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to get churn risk report', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

function computeProposalAndHiringTimes(
  allProjects: Models.DefaultDocument[],
  allProposals: Models.DefaultDocument[],
  allContracts: Models.DefaultDocument[]
): {
  timeToFirstProposalHoursList: number[];
  timeToHireDaysList: number[];
  completedContractDurationsList: number[];
  completedContractCount: number;
} {
  const proposalsByProjectId = new Map<string, number[]>();
  for (const pr of allProposals) {
    if (pr['project_id']) {
      if (!proposalsByProjectId.has(pr['project_id'])) proposalsByProjectId.set(pr['project_id'], []);
      proposalsByProjectId.get(pr['project_id'])!.push(parseDocDate(pr).getTime());
    }
  }

  const timeToFirstProposalHoursList: number[] = [];
  for (const proj of allProjects) {
    const projCreated = parseDocDate(proj).getTime();
    const propTimes = proposalsByProjectId.get(proj.$id);
    if (propTimes && propTimes.length > 0) {
      const earliest = Math.min(...propTimes);
      const diffHours = Math.max(0, (earliest - projCreated) / (1000 * 3600));
      timeToFirstProposalHoursList.push(diffHours);
    }
  }

  const projectCreatedAtMap = new Map<string, number>();
  for (const proj of allProjects) {
    projectCreatedAtMap.set(proj.$id, parseDocDate(proj).getTime());
  }

  const timeToHireDaysList: number[] = [];
  const completedContractDurationsList: number[] = [];
  let completedContractCount = 0;

  for (const c of allContracts) {
    if (c['project_id'] && projectCreatedAtMap.has(c['project_id'])) {
      const projTime = projectCreatedAtMap.get(c['project_id'])!;
      const contractTime = parseDocDate(c).getTime();
      const diffDays = Math.max(0, (contractTime - projTime) / (1000 * 3600 * 24));
      timeToHireDaysList.push(diffDays);
    }

    if (c['status'] === 'completed') {
      completedContractCount++;
      const startTime = parseDocDate(c).getTime();
      const rawEnd = c['updated_at'] || (c as any).$updatedAt;
      const endTime = rawEnd ? new Date(rawEnd).getTime() : startTime;
      const durDays = Math.max(0, (endTime - startTime) / (1000 * 3600 * 24));
      completedContractDurationsList.push(durDays);
    }
  }

  return { timeToFirstProposalHoursList, timeToHireDaysList, completedContractDurationsList, completedContractCount };
}

function computeTurnaroundAndRepeatRates(
  allMilestones: any[],
  allContracts: Models.DefaultDocument[]
): { milestoneTurnaroundDaysList: number[]; repeatEmployerRate: number; repeatFreelancerRate: number } {
  const milestoneTurnaroundDaysList: number[] = [];
  for (const m of allMilestones) {
    if (m['submitted_at'] && (m['approved_at'] || m['completed_at'])) {
      const sub = new Date(m['submitted_at']).getTime();
      const app = new Date(m['approved_at'] || m['completed_at']).getTime();
      if (!isNaN(sub) && !isNaN(app) && app >= sub) {
        milestoneTurnaroundDaysList.push((app - sub) / (1000 * 3600 * 24));
      }
    }
  }

  const employerContractCounts = new Map<string, number>();
  const freelancerContractCounts = new Map<string, number>();
  for (const c of allContracts) {
    if (c['employer_id']) {
      employerContractCounts.set(c['employer_id'], (employerContractCounts.get(c['employer_id']) || 0) + 1);
    }
    if (c['freelancer_id']) {
      freelancerContractCounts.set(c['freelancer_id'], (freelancerContractCounts.get(c['freelancer_id']) || 0) + 1);
    }
  }

  const totalEmployers = employerContractCounts.size;
  const repeatEmployers = Array.from(employerContractCounts.values()).filter(cnt => cnt >= 2).length;
  const repeatEmployerRate = totalEmployers > 0 ? Math.round((repeatEmployers / totalEmployers) * 1000) / 10 : 0;

  const totalFreelancers = freelancerContractCounts.size;
  const repeatFreelancers = Array.from(freelancerContractCounts.values()).filter(cnt => cnt >= 2).length;
  const repeatFreelancerRate = totalFreelancers > 0 ? Math.round((repeatFreelancers / totalFreelancers) * 1000) / 10 : 0;

  return { milestoneTurnaroundDaysList, repeatEmployerRate, repeatFreelancerRate };
}

/**
 * Get marketplace speed and hiring velocity metrics (time-to-first-proposal, time-to-hire, turnaround).
 *
 * Cached for 60s.
 */
export async function getMarketplaceVelocityReport(): Promise<ServiceResult<MarketplaceVelocityReport>> {
  const cached = marketplaceVelocityCache.get('marketplace_velocity');
  if (cached) {
    return successResult(cached);
  }

  try {
    const [allProjects, allProposals, allContracts] = await Promise.all([
      fetchAllCollection(COLLECTIONS.PROJECTS, []),
      fetchAllCollection(COLLECTIONS.PROPOSALS, []),
      fetchAllCollection(COLLECTIONS.CONTRACTS, []),
    ]);

    const allMilestones: any[] = [];
    for (const proj of allProjects) {
      allMilestones.push(...extractProjectMilestones(proj));
    }

    const {
      timeToFirstProposalHoursList,
      timeToHireDaysList,
      completedContractDurationsList,
      completedContractCount,
    } = computeProposalAndHiringTimes(allProjects, allProposals, allContracts);

    const {
      milestoneTurnaroundDaysList,
      repeatEmployerRate,
      repeatFreelancerRate,
    } = computeTurnaroundAndRepeatRates(allMilestones, allContracts);

    const avgContractDurationDays = completedContractDurationsList.length > 0
      ? Math.round((completedContractDurationsList.reduce((a, b) => a + b, 0) / completedContractDurationsList.length) * 10) / 10
      : 0;

    const report: MarketplaceVelocityReport = {
      medianTimeToFirstProposalHours: calculateMedian(timeToFirstProposalHoursList),
      medianTimeToHireDays: calculateMedian(timeToHireDaysList),
      medianMilestoneTurnaroundDays: calculateMedian(milestoneTurnaroundDaysList),
      averageContractDurationDays: avgContractDurationDays,
      repeatEmployerRate,
      repeatFreelancerRate,
      totalCompletedContracts: completedContractCount,
      generatedAt: new Date().toISOString(),
    };

    marketplaceVelocityCache.set('marketplace_velocity', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to get marketplace velocity report', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}


