import { getSupabaseClient, getSupabaseServiceClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';

const supabase = getSupabaseClient();
const supabaseAdmin = getSupabaseServiceClient();

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
    let contractQuery = supabase
      .from('contracts')
      .select('id, total_amount, created_at')
      .eq('freelancer_id', userId)
      .eq('status', 'completed');

    if (startDate) contractQuery = contractQuery.gte('created_at', startDate);
    if (endDate) contractQuery = contractQuery.lte('created_at', endDate);

    const { data: contracts, error: contractError } = await contractQuery;

    if (contractError) {
      logger.error('Failed to fetch freelancer contracts', { error: contractError, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch analytics',
        },
      };
    }

    // Calculate total earnings
    const totalEarnings = (contracts || []).reduce((sum, c) => sum + (c.total_amount || 0), 0);
    const projectsCompleted = (contracts || []).length;

    // Get average rating
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('reviewee_id', userId);

    const averageRating = reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    // Earnings by month
    const earningsByMonth = calculateEarningsByMonth(contracts || []);

    // Top skills from completed projects
    const topSkills = await calculateTopSkills(userId, 'freelancer');

    // Proposal acceptance rate
    const { data: allProposals } = await supabase
      .from('proposals')
      .select('status')
      .eq('freelancer_id', userId);

    const acceptedProposals = (allProposals || []).filter(p => p.status === 'accepted').length;
    const proposalAcceptanceRate = allProposals && allProposals.length > 0
      ? (acceptedProposals / allProposals.length) * 100
      : 0;

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
    logger.error('Unexpected error in getFreelancerAnalytics', { error, userId, options });
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

    // Get projects
    let projectQuery = supabase
      .from('projects')
      .select('id, budget, status, created_at')
      .eq('employer_id', userId);

    if (startDate) projectQuery = projectQuery.gte('created_at', startDate);
    if (endDate) projectQuery = projectQuery.lte('created_at', endDate);

    const { data: projects, error: projectError } = await projectQuery;

    if (projectError) {
      logger.error('Failed to fetch employer projects', { error: projectError, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch analytics',
        },
      };
    }

    const projectsPosted = (projects || []).length;
    const projectsCompleted = (projects || []).filter(p => p.status === 'completed').length;
    const averageProjectBudget = projectsPosted > 0
      ? (projects || []).reduce((sum, p) => sum + p.budget, 0) / projectsPosted
      : 0;

    // Get completed contracts for spending
    const { data: contracts } = await supabase
      .from('contracts')
      .select('total_amount, created_at')
      .eq('employer_id', userId)
      .eq('status', 'completed');

    const totalSpent = (contracts || []).reduce((sum, c) => sum + (c.total_amount || 0), 0);

    // Spending by month
    const spendingByMonth = calculateEarningsByMonth(contracts || []);

    // Top hired skills
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
    logger.error('Unexpected error in getEmployerAnalytics', { error, userId, options });
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
 * Get skill demand trends
 */
export async function getSkillDemandTrends(): Promise<ServiceResult<SkillTrend[]>> {
  try {
    // Get all open projects with their skills
    const { data: projects, error } = await supabase
      .from('projects')
      .select('required_skills, budget, created_at')
      .eq('status', 'open');

    if (error) {
      logger.error('Failed to fetch projects for skill trends', { error });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch skill trends',
        },
      };
    }

    // Aggregate skills
    const skillMap = new Map<string, { count: number; totalBudget: number; skillName: string }>();

    for (const project of projects || []) {
      const skills = project.required_skills as any[];
      for (const skill of skills || []) {
        const skillId = skill.skill_id || skill.id;
        const skillName = skill.skill_name || skill.name;
        
        if (!skillMap.has(skillId)) {
          skillMap.set(skillId, { count: 0, totalBudget: 0, skillName });
        }
        
        const current = skillMap.get(skillId)!;
        current.count++;
        current.totalBudget += project.budget;
      }
    }

    // Convert to trends
    const trends: SkillTrend[] = Array.from(skillMap.entries()).map(([skillId, data]) => {
      const averageBudget = data.count > 0 ? data.totalBudget / data.count : 0;
      
      // Determine demand level based on project count
      let demandLevel: 'high' | 'medium' | 'low' = 'low';
      if (data.count >= 10) demandLevel = 'high';
      else if (data.count >= 5) demandLevel = 'medium';

      return {
        skillId,
        skillName: data.skillName,
        demandLevel,
        projectCount: data.count,
        averageBudget: Math.round(averageBudget * 100) / 100,
        growthRate: 0, // TODO: Calculate growth rate by comparing with previous period
      };
    });

    // Sort by project count
    trends.sort((a, b) => b.projectCount - a.projectCount);

    return {
      success: true,
      data: trends.slice(0, 20), // Top 20 skills
    };
  } catch (error) {
    logger.error('Unexpected error in getSkillDemandTrends', { error });
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
 * Get admin analytics dashboard metrics
 */
export async function getAdminAnalytics(): Promise<ServiceResult<AdminAnalytics>> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total users
    const { count: totalUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Users from previous period (for growth calculation)
    const { count: previousUsers } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', thirtyDaysAgo.toISOString());

    // Total projects
    const { count: totalProjects } = await supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true });

    // Projects from previous period (for growth calculation)
    const { count: previousProjects } = await supabaseAdmin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', thirtyDaysAgo.toISOString());

    // Total revenue (completed contracts)
    const { data: completedContracts } = await supabaseAdmin
      .from('contracts')
      .select('total_amount')
      .eq('status', 'completed');

    const totalRevenue = (completedContracts || []).reduce((sum, c) => sum + (c.total_amount || 0), 0);

    // Active contracts (not completed or cancelled)
    const { count: activeContracts } = await supabaseAdmin
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'active', 'in_progress']);

    // Calculate growth rates
    const userGrowth = previousUsers && previousUsers > 0
      ? (((totalUsers || 0) - previousUsers) / previousUsers) * 100
      : 0;

    const projectGrowth = previousProjects && previousProjects > 0
      ? (((totalProjects || 0) - previousProjects) / previousProjects) * 100
      : 0;

    // Get user growth data for last 6 months
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const { data: usersData } = await supabaseAdmin
      .from('users')
      .select('created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    const userGrowthData = calculateMonthlyGrowth(usersData || []);

    // Get project activity data for last 6 months
    const { data: projectsData } = await supabaseAdmin
      .from('projects')
      .select('created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    const projectActivityData = calculateMonthlyGrowth(projectsData || []);

    return {
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalProjects: totalProjects || 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        activeContracts: activeContracts || 0,
        userGrowth: Math.round(userGrowth * 10) / 10,
        projectGrowth: Math.round(projectGrowth * 10) / 10,
        userGrowthData,
        projectActivityData,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getAdminAnalytics', { error });
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
 * Get platform-wide metrics
 */
export async function getPlatformMetrics(): Promise<ServiceResult<PlatformMetrics>> {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Total projects
    const { count: totalProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true });

    // Total contracts
    const { count: totalContracts } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true });

    // Total transaction volume
    const { data: contracts } = await supabase
      .from('contracts')
      .select('total_amount')
      .eq('status', 'completed');

    const totalTransactionVolume = (contracts || []).reduce((sum, c) => sum + (c.total_amount || 0), 0);

    // Active users (users with activity in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentProjects } = await supabase
      .from('projects')
      .select('employer_id')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const { data: recentProposals } = await supabase
      .from('proposals')
      .select('freelancer_id')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const activeUserIds = new Set([
      ...(recentProjects || []).map(p => p.employer_id),
      ...(recentProposals || []).map(p => p.freelancer_id),
    ]);

    // Completion rate
    const { count: completedContracts } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const completionRate = totalContracts && totalContracts > 0
      ? ((completedContracts || 0) / totalContracts) * 100
      : 0;

    return {
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalProjects: totalProjects || 0,
        totalContracts: totalContracts || 0,
        totalTransactionVolume: Math.round(totalTransactionVolume * 100) / 100,
        activeUsers: activeUserIds.size,
        completionRate: Math.round(completionRate * 10) / 10,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getPlatformMetrics', { error });
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

function calculateMonthlyGrowth(items: any[]): { month: string; count: number }[] {
  const monthMap = new Map<string, number>();

  // Get last 6 months
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(monthKey, 0);
  }

  // Count items per month
  for (const item of items) {
    const date = new Date(item.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (monthMap.has(monthKey)) {
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
    }
  }

  return Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function calculateEarningsByMonth(contracts: any[]): { month: string; amount: number }[] {
  const monthMap = new Map<string, number>();

  for (const contract of contracts) {
    const date = new Date(contract.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const current = monthMap.get(monthKey) || 0;
    monthMap.set(monthKey, current + (contract.total_amount || 0));
  }

  return Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

async function calculateTopSkills(userId: string, userType: 'freelancer' | 'employer'): Promise<{ skill: string; projectCount: number }[]> {
  try {
    const { data: contracts } = await supabase
      .from('contracts')
      .select('project_id')
      .eq(userType === 'freelancer' ? 'freelancer_id' : 'employer_id', userId)
      .eq('status', 'completed');

    if (!contracts || contracts.length === 0) {
      return [];
    }

    const projectIds = contracts.map(c => c.project_id);

    const { data: projects } = await supabase
      .from('projects')
      .select('required_skills')
      .in('id', projectIds);

    const skillMap = new Map<string, number>();

    for (const project of projects || []) {
      const skills = project.required_skills as any[];
      for (const skill of skills || []) {
        const skillName = skill.skill_name || skill.name;
        skillMap.set(skillName, (skillMap.get(skillName) || 0) + 1);
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
