import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
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
    // Fetch all reviews for this user
    const reviewsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.limit(1000),
      ]
    );

    const totalRatings = reviewsResponse.total;

    if (totalRatings === 0) {
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

    // Compute review aggregations in memory
    const reviews = reviewsResponse.documents;
    const avgRating = reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / totalRatings;
    const avgWorkQuality = reviews
      .filter((r: any) => r.work_quality != null)
      .reduce((sum: number, r: any) => sum + r.work_quality, 0) /
      (reviews.filter((r: any) => r.work_quality != null).length || 1);
    const avgCommunication = reviews
      .filter((r: any) => r.communication != null)
      .reduce((sum: number, r: any) => sum + r.communication, 0) /
      (reviews.filter((r: any) => r.communication != null).length || 1);
    const avgProfessionalism = reviews
      .filter((r: any) => r.professionalism != null)
      .reduce((sum: number, r: any) => sum + r.professionalism, 0) /
      (reviews.filter((r: any) => r.professionalism != null).length || 1);
    const wouldWorkAgainCount = reviews.filter((r: any) => r.would_work_again === true).length;
    const wouldWorkAgainPercentage = (wouldWorkAgainCount / totalRatings) * 100;

    // Fetch completed contracts count
    const contractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal('freelancer_id', userId),
        Query.equal('status', 'completed'),
        Query.limit(1),
      ]
    );
    const completedContracts = contractsResponse.total;

    // Compute on-time delivery rate from project milestones
    // Milestones are stored as JSONB in the projects table
    let totalApproved = 0;
    let onTimeCount = 0;

    // Fetch all contracts for this freelancer to find milestones
    const allContractsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CONTRACTS,
      [
        Query.equal('freelancer_id', userId),
        Query.limit(1000),
      ]
    );

    for (const contract of allContractsResponse.documents) {
      try {
        const projectDoc = await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.PROJECTS,
          (contract as any).project_id
        );
        const milestones = typeof (projectDoc as any).milestones === 'string'
          ? JSON.parse((projectDoc as any).milestones)
          : (projectDoc as any).milestones || [];

        for (const m of milestones) {
          if (m.status === 'approved') {
            totalApproved++;
            if (m.approved_at && m.due_date && new Date(m.approved_at) <= new Date(m.due_date)) {
              onTimeCount++;
            }
          }
        }
      } catch {
        // Skip projects that can't be fetched
      }
    }

    const onTimeDeliveryRate = totalApproved > 0
      ? (onTimeCount / totalApproved) * 100
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
        completedContracts,
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
    // Fetch all reviews for this user
    const reviewsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.limit(1000),
      ]
    );

    const reviews = reviewsResponse.documents;

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

    // Compute star distribution in memory
    const fiveStars = reviews.filter((r: any) => r.rating === 5).length;
    const fourStars = reviews.filter((r: any) => r.rating === 4).length;
    const threeStars = reviews.filter((r: any) => r.rating === 3).length;
    const twoStars = reviews.filter((r: any) => r.rating === 2).length;
    const oneStar = reviews.filter((r: any) => r.rating === 1).length;

    // Get 10 most recent reviews with user/project info
    const recentReviews = [...reviews]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    // Fetch reviewer names and project titles for recent reviews
    const recentRatings = await Promise.all(
      recentReviews.map(async (r: any) => {
        let reviewerName = 'Anonymous';
        let projectTitle = 'Unknown Project';

        try {
          const reviewerDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, r.reviewer_id);
          reviewerName = (reviewerDoc as any).name || 'Anonymous';
        } catch { /* ignore */ }

        if (r.project_id) {
          try {
            const projectDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.PROJECTS, r.project_id);
            projectTitle = (projectDoc as any).title || 'Unknown Project';
          } catch { /* ignore */ }
        }

        return {
          rating: r.rating,
          comment: r.comment || '',
          reviewerName,
          projectTitle,
          createdAt: new Date(r.created_at),
        };
      })
    );

    return {
      success: true,
      data: {
        fiveStars,
        fourStars,
        threeStars,
        twoStars,
        oneStar,
        recentRatings,
      },
    };
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

    // Fetch reviews (Appwrite doesn't support date range queries directly, filter in memory)
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.orderAsc('created_at'),
        Query.limit(1000),
      ]
    );

    const reviews = response.documents.filter(
      (r: any) => new Date(r.created_at) >= startDate
    );

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
    // Fetch all reviews and aggregate in memory
    // (Appwrite doesn't support GROUP BY queries)
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [Query.limit(1000)]
    );

    // Group by reviewee_id
    const userStats = new Map<string, { sum: number; count: number }>();
    for (const review of response.documents) {
      const revieweeId = (review as any).reviewee_id;
      const existing = userStats.get(revieweeId) || { sum: 0, count: 0 };
      existing.sum += (review as any).rating;
      existing.count += 1;
      userStats.set(revieweeId, existing);
    }

    // Filter users with >= 3 ratings, compute average
    const candidates = Array.from(userStats.entries())
      .filter(([, stats]) => stats.count >= 3)
      .map(([userId, stats]) => ({
        userId,
        averageRating: Math.round((stats.sum / stats.count) * 10) / 10,
        totalRatings: stats.count,
      }))
      .sort((a, b) => b.averageRating - a.averageRating || b.totalRatings - a.totalRatings)
      .slice(0, limit);

    // Fetch user names
    const leaderboard = await Promise.all(
      candidates.map(async (entry) => {
        let userName = 'Unknown';
        try {
          const userDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, entry.userId);
          userName = (userDoc as any).name || 'Unknown';
        } catch { /* ignore */ }
        return { ...entry, userName };
      })
    );

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
