import { pool } from '../config/database.js';
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
    // Get all reviews for user
    const reviewsResult = await pool.query(
      `SELECT r.*, p.title as project_title 
       FROM reviews r
       INNER JOIN contracts c ON r.contract_id = c.id
       INNER JOIN projects p ON c.project_id = p.id
       WHERE r.reviewee_id = $1`,
      [userId]
    );

    const reviews = reviewsResult.rows;

    if (reviews.length === 0) {
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
    const avgRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / totalRatings;
    const avgWorkQuality = reviews.reduce((sum: number, r: any) => sum + (r.work_quality || 0), 0) / totalRatings;
    const avgCommunication = reviews.reduce((sum: number, r: any) => sum + (r.communication || 0), 0) / totalRatings;
    const avgProfessionalism = reviews.reduce((sum: number, r: any) => sum + (r.professionalism || 0), 0) / totalRatings;
    
    const wouldWorkAgainCount = reviews.filter((r: any) => r.would_work_again).length;
    const wouldWorkAgainPercentage = (wouldWorkAgainCount / totalRatings) * 100;

    // Get completed contracts count
    const completedCountResult = await pool.query(
      "SELECT COUNT(*) FROM contracts WHERE freelancer_id = $1 AND status = 'completed'",
      [userId]
    );
    const completedCount = parseInt(completedCountResult.rows[0].count);

    // Calculate on-time delivery rate
    const milestonesResult = await pool.query(
      `SELECT m.due_date, m.approved_at 
       FROM milestones m
       INNER JOIN contracts c ON m.contract_id = c.id
       WHERE c.freelancer_id = $1 AND m.status = 'approved'`,
      [userId]
    );
    const milestones = milestonesResult.rows;

    let onTimeCount = 0;
    if (milestones.length > 0) {
      onTimeCount = milestones.filter((m: any) => {
        if (!m.approved_at || !m.due_date) return false;
        return new Date(m.approved_at) <= new Date(m.due_date);
      }).length;
    }

    const onTimeDeliveryRate = milestones.length > 0
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
    // Get all reviews
    const reviewsResult = await pool.query(
      `SELECT r.*, u.name as reviewer_name, p.title as project_title 
       FROM reviews r
       LEFT JOIN users u ON r.reviewer_id = u.id
       LEFT JOIN projects p ON r.project_id = p.id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const reviews = reviewsResult.rows;

    if (reviews.length === 0) {
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
      fiveStars: reviews.filter((r: any) => r.rating === 5).length,
      fourStars: reviews.filter((r: any) => r.rating === 4).length,
      threeStars: reviews.filter((r: any) => r.rating === 3).length,
      twoStars: reviews.filter((r: any) => r.rating === 2).length,
      oneStar: reviews.filter((r: any) => r.rating === 1).length,
      recentRatings: reviews.slice(0, 10).map((r: any) => ({
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer_name || 'Anonymous',
        projectTitle: r.project_title || 'Unknown Project',
        createdAt: r.created_at,
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
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const reviewsResult = await pool.query(
      'SELECT rating, created_at FROM reviews WHERE reviewee_id = $1 AND created_at >= $2 ORDER BY created_at ASC',
      [userId, startDate.toISOString()]
    );

    const reviews = reviewsResult.rows;

    if (reviews.length === 0) {
      return { success: true, data: [] };
    }

    // Group by month
    const monthlyData = new Map<string, { sum: number; count: number }>();

    reviews.forEach((review: any) => {
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
    // Get users with most reviews and highest ratings
    const topUsersResult = await pool.query(
      `SELECT r.reviewee_id, r.rating, u.name as user_name
       FROM reviews r
       LEFT JOIN users u ON r.reviewee_id = u.id
       LIMIT 1000`
    );

    const topUsers = topUsersResult.rows;

    if (topUsers.length === 0) {
      return { success: true, data: [] };
    }

    // Aggregate by user
    const userStats = new Map<string, { sum: number; count: number; name: string }>();

    topUsers.forEach((review: any) => {
      const userName = review.user_name || 'Unknown';
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
