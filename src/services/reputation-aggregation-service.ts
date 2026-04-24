import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';

export type ReputationScore = {
  userId: string;
  averageRating: number;
  totalRatings: number;
  workQuality: number;
  communication: number;
  professionalism: number;
  wouldWorkAgainPercentage: number;
  completedContracts: number;
  onTimeDeliveryRate: number;
};

export type ReputationBreakdown = {
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStar: number;
  recentRatings: Array<{
    rating: number;
    comment: string;
    reviewerName: string;
    projectTitle: string;
    createdAt: Date;
  }>;
};

/**
 * Get aggregated reputation score for user
 */
export async function getAggregatedScore(userId: string): Promise<ServiceResult<ReputationScore>> {
  try {
    const supabase = getSupabaseClient();

    // Get all reviews for user
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*, contracts!inner(*, projects!inner(title))')
      .eq('reviewee_id', userId);

    if (reviewsError) throw reviewsError;

    if (!reviews || reviews.length === 0) {
      return {
        success: true,
        data: {
          userId,
          averageRating: 0,
          totalRatings: 0,
          workQuality: 0,
          communication: 0,
          professionalism: 0,
          wouldWorkAgainPercentage: 0,
          completedContracts: 0,
          onTimeDeliveryRate: 0,
        },
      };
    }

    // Calculate averages
    const totalRatings = reviews.length;
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
    const avgWorkQuality = reviews.reduce((sum, r) => sum + (r.work_quality || 0), 0) / totalRatings;
    const avgCommunication = reviews.reduce((sum, r) => sum + (r.communication || 0), 0) / totalRatings;
    const avgProfessionalism = reviews.reduce((sum, r) => sum + (r.professionalism || 0), 0) / totalRatings;
    
    const wouldWorkAgainCount = reviews.filter(r => r.would_work_again).length;
    const wouldWorkAgainPercentage = (wouldWorkAgainCount / totalRatings) * 100;

    // Get completed contracts count
    const { count: completedCount } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('freelancer_id', userId)
      .eq('status', 'completed');

    // Calculate on-time delivery rate
    const { data: milestones } = await supabase
      .from('milestones')
      .select('due_date, approved_at, contracts!inner(freelancer_id)')
      .eq('contracts.freelancer_id', userId)
      .eq('status', 'approved');

    let onTimeCount = 0;
    if (milestones && milestones.length > 0) {
      onTimeCount = milestones.filter(m => {
        if (!m.approved_at || !m.due_date) return false;
        return new Date(m.approved_at) <= new Date(m.due_date);
      }).length;
    }

    const onTimeDeliveryRate = milestones && milestones.length > 0
      ? (onTimeCount / milestones.length) * 100
      : 0;

    return {
      success: true,
      data: {
        userId,
        averageRating: Math.round(avgRating * 10) / 10,
        totalRatings,
        workQuality: Math.round(avgWorkQuality * 10) / 10,
        communication: Math.round(avgCommunication * 10) / 10,
        professionalism: Math.round(avgProfessionalism * 10) / 10,
        wouldWorkAgainPercentage: Math.round(wouldWorkAgainPercentage),
        completedContracts: completedCount || 0,
        onTimeDeliveryRate: Math.round(onTimeDeliveryRate),
      },
    };
  } catch (error) {
    logger.error('Failed to get aggregated score:', error);
    return {
      success: false,
      error: {
        code: 'AGGREGATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to aggregate reputation score',
      },
    };
  }
}

/**
 * Get reputation breakdown
 */
export async function getReputationBreakdown(userId: string): Promise<ServiceResult<ReputationBreakdown>> {
  try {
    const supabase = getSupabaseClient();

    // Get all reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:users!reviews_reviewer_id_fkey(full_name),
        projects!inner(title)
      `)
      .eq('reviewee_id', userId)
      .order('created_at', { ascending: false });

    if (reviewsError) throw reviewsError;

    if (!reviews || reviews.length === 0) {
      return {
        success: true,
        data: {
          fiveStars: 0,
          fourStars: 0,
          threeStars: 0,
          twoStars: 0,
          oneStar: 0,
          recentRatings: [],
        },
      };
    }

    // Count ratings by star
    const breakdown = {
      fiveStars: reviews.filter(r => r.rating === 5).length,
      fourStars: reviews.filter(r => r.rating === 4).length,
      threeStars: reviews.filter(r => r.rating === 3).length,
      twoStars: reviews.filter(r => r.rating === 2).length,
      oneStar: reviews.filter(r => r.rating === 1).length,
      recentRatings: reviews.slice(0, 10).map(r => ({
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer?.full_name || 'Anonymous',
        projectTitle: r.projects?.title || 'Unknown Project',
        createdAt: new Date(r.created_at),
      })),
    };

    return { success: true, data: breakdown };
  } catch (error) {
    logger.error('Failed to get reputation breakdown:', error);
    return {
      success: false,
      error: {
        code: 'BREAKDOWN_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get reputation breakdown',
      },
    };
  }
}

/**
 * Get reputation history (ratings over time)
 */
export async function getReputationHistory(
  userId: string,
  months: number = 12
): Promise<ServiceResult<Array<{ month: string; averageRating: number; count: number }>>> {
  try {
    const supabase = getSupabaseClient();

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('rating, created_at')
      .eq('reviewee_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (reviewsError) throw reviewsError;

    if (!reviews || reviews.length === 0) {
      return { success: true, data: [] };
    }

    // Group by month
    const monthlyData = new Map<string, { sum: number; count: number }>();

    reviews.forEach(review => {
      const date = new Date(review.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const existing = monthlyData.get(monthKey) || { sum: 0, count: 0 };
      existing.sum += review.rating;
      existing.count += 1;
      monthlyData.set(monthKey, existing);
    });

    // Convert to array
    const history = Array.from(monthlyData.entries()).map(([month, data]) => ({
      month,
      averageRating: Math.round((data.sum / data.count) * 10) / 10,
      count: data.count,
    }));

    return { success: true, data: history };
  } catch (error) {
    logger.error('Failed to get reputation history:', error);
    return {
      success: false,
      error: {
        code: 'HISTORY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get reputation history',
      },
    };
  }
}

/**
 * Get platform leaderboard
 */
export async function getReputationLeaderboard(
  limit: number = 10
): Promise<ServiceResult<Array<{ userId: string; userName: string; averageRating: number; totalRatings: number }>>> {
  try {
    const supabase = getSupabaseClient();

    // Get users with most reviews and highest ratings
    const { data: topUsers, error } = await supabase
      .from('reviews')
      .select('reviewee_id, rating, users!reviews_reviewee_id_fkey(full_name)')
      .limit(1000); // Get enough data to calculate

    if (error) throw error;

    if (!topUsers || topUsers.length === 0) {
      return { success: true, data: [] };
    }

    // Aggregate by user
    const userStats = new Map<string, { sum: number; count: number; name: string }>();

    topUsers.forEach(review => {
      const users = review.users as any;
      const userName = Array.isArray(users) 
        ? users[0]?.full_name || 'Unknown'
        : users?.full_name || 'Unknown';
      const existing = userStats.get(review.reviewee_id) || { 
        sum: 0, 
        count: 0, 
        name: userName
      };
      existing.sum += review.rating;
      existing.count += 1;
      userStats.set(review.reviewee_id, existing);
    });

    // Convert to array and sort
    const leaderboard = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        userName: stats.name,
        averageRating: Math.round((stats.sum / stats.count) * 10) / 10,
        totalRatings: stats.count,
      }))
      .filter(user => user.totalRatings >= 3) // Minimum 3 ratings
      .sort((a, b) => {
        // Sort by average rating, then by total ratings
        if (b.averageRating !== a.averageRating) {
          return b.averageRating - a.averageRating;
        }
        return b.totalRatings - a.totalRatings;
      })
      .slice(0, limit);

    return { success: true, data: leaderboard };
  } catch (error) {
    logger.error('Failed to get leaderboard:', error);
    return {
      success: false,
      error: {
        code: 'LEADERBOARD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get leaderboard',
      },
    };
  }
}
