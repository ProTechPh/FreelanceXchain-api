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
} from '../utils/cache.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { ENTITLED_STATUSES, type SubscriptionStatus } from '../models/subscription.js';

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

    // Fetch each unique project once (Appwrite doesn't support IN queries)
    const projectSkillMap = new Map<string, Array<string | { skill_name?: string; name?: string }>>();
    await Promise.all(
      uniqueProjectIds.map(async (projectId: string) => {
        try {
          const projectDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJECTS, projectId);
          const requiredSkills = projectDoc.required_skills;
          const skills: Array<string | { skill_name?: string; name?: string }> = typeof requiredSkills === 'string'
            ? JSON.parse(requiredSkills)
            : requiredSkills || [];

          projectSkillMap.set(projectId, skills);
        } catch {
          projectSkillMap.set(projectId, []);
        }
      })
    );

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
export async function getMarketplaceLiquidityReport(): Promise<ServiceResult<MarketplaceLiquidityReport>> {
  const cached = marketplaceLiquidityCache.get('marketplace_liquidity');
  if (cached) {
    return successResult(cached);
  }

  try {
    const [projects, profiles] = await Promise.all([
      fetchAllCollection(COLLECTIONS.PROJECTS, [Query.equal('status', 'open')]),
      fetchAllCollection(COLLECTIONS.FREELANCER_PROFILES, []),
    ]);

    const demandMap = extractSkillCounts(projects, 'required_skills');
    const supplyMap = extractSkillCounts(profiles, 'skills');
    const allSkills = new Set([...demandMap.keys(), ...supplyMap.keys()]);

    const metrics: SkillLiquidityMetric[] = [];
    for (const skillName of allSkills) {
      metrics.push(calculateLiquidityMetric(
        skillName,
        demandMap.get(skillName) || 0,
        supplyMap.get(skillName) || 0
      ));
    }

    metrics.sort((a, b) => (b.projectDemandCount + b.talentSupplyCount) - (a.projectDemandCount + a.talentSupplyCount));

    const shortageSkills = metrics.filter(m => m.liquidityStatus === 'shortage');
    const balancedSkills = metrics.filter(m => m.liquidityStatus === 'balanced');
    const surplusSkills = metrics.filter(m => m.liquidityStatus === 'surplus');

    const score = metrics.length > 0
      ? Math.round((balancedSkills.length / metrics.length) * 100)
      : 100;

    const report: MarketplaceLiquidityReport = {
      overallLiquidityScore: score,
      skillsAnalyzed: metrics.length,
      shortageSkills,
      balancedSkills,
      surplusSkills,
      generatedAt: new Date().toISOString(),
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
export async function getFunnelMetrics(): Promise<ServiceResult<FunnelMetricsReport>> {
  const cached = funnelMetricsCache.get('funnel_metrics');
  if (cached) {
    return successResult(cached);
  }

  try {
    const [
      allUsers,
      freelancerProfiles,
      projects,
      proposals,
      contracts,
    ] = await Promise.all([
      fetchAllCollection(COLLECTIONS.USERS, []),
      fetchAllCollection(COLLECTIONS.FREELANCER_PROFILES, []),
      fetchAllCollection(COLLECTIONS.PROJECTS, []),
      fetchAllCollection(COLLECTIONS.PROPOSALS, []),
      fetchAllCollection(COLLECTIONS.CONTRACTS, []),
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
    };

    funnelMetricsCache.set('funnel_metrics', report);
    return successResult(report);
  } catch (error) {
    logger.error('Failed to get funnel metrics', { error });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

