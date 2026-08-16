import { logger } from '../config/logger.js';
import { reviewRepository } from '../repositories/review-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

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

type ReputationBreakdown = {
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

type ReviewDoc = Record<string, any>;

/**
 * Fetch all reviews received by a user (Appwrite caps at 1000 documents).
 */
async function fetchReviewsForUser(userId: string): Promise<ReviewDoc[]> {
  return reviewRepository.findAllByRevieweeId(userId);
}

type RatingAverages = {
  averageRating: number;
  workQuality: number;
  communication: number;
  professionalism: number;
  wouldWorkAgainPercentage: number;
};

function averageOf(reviews: ReviewDoc[], field: string): number {
  const rated = reviews.filter(r => r[field] != null);
  return rated.length > 0
    ? rated.reduce((sum, r) => sum + r[field], 0) / rated.length
    : 0;
}

/**
 * Compute in-memory rating averages from the user's reviews.
 */
function computeRatingAverages(reviews: ReviewDoc[], totalRatings: number): RatingAverages {
  const averageRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / totalRatings;
  const wouldWorkAgainCount = reviews.filter(r => r.would_work_again === true).length;

  return {
    averageRating,
    workQuality: averageOf(reviews, 'work_quality'),
    communication: averageOf(reviews, 'communication'),
    professionalism: averageOf(reviews, 'professionalism'),
    wouldWorkAgainPercentage: (wouldWorkAgainCount / totalRatings) * 100,
  };
}

/**
 * Count the user's completed contracts (as freelancer).
 */
async function countCompletedContracts(userId: string): Promise<number> {
  return contractRepository.countCompletedByFreelancer(userId);
}

/**
 * Compute the on-time delivery rate from project milestones.
 * Milestones are stored as JSONB in the projects table.
 */
async function computeOnTimeDeliveryRate(userId: string): Promise<number> {
  const contracts = await contractRepository.findAllByFreelancer(userId);

  const contractResults = await Promise.all(contracts.map(async (contract) => {
    const project = await projectRepository.getProjectById(contract.project_id);
    if (!project) return { approved: 0, onTime: 0 };

    let approved = 0;
    let onTime = 0;
    for (const m of project.milestones) {
      if (m.status === 'approved') {
        approved++;
        if (m.approved_at && m.due_date && new Date(m.approved_at) <= new Date(m.due_date)) {
          onTime++;
        }
      }
    }
    return { approved, onTime };
  }));

  const totalApproved = contractResults.reduce((sum, result) => sum + result.approved, 0);
  const onTimeCount = contractResults.reduce((sum, result) => sum + result.onTime, 0);

  return totalApproved > 0 ? (onTimeCount / totalApproved) * 100 : 0;
}

function emptyScore(userId: string): ReputationScore {
  return {
    userId,
    averageRating: 0,
    totalRatings: 0,
    workQuality: 0,
    communication: 0,
    professionalism: 0,
    wouldWorkAgainPercentage: 0,
    completedContracts: 0,
    onTimeDeliveryRate: 0,
  };
}

/**
 * Get aggregated reputation score for user
 */
export async function getAggregatedScore(userId: string): Promise<ServiceResult<ReputationScore>> {
  try {
    const reviews = await fetchReviewsForUser(userId);
    const totalRatings = reviews.length;

    if (totalRatings === 0) {
      return successResult(emptyScore(userId));
    }

    const averages = computeRatingAverages(reviews, totalRatings);
    const completedContracts = await countCompletedContracts(userId);
    const onTimeDeliveryRate = await computeOnTimeDeliveryRate(userId);

    return successResult({
      userId,
      averageRating: Math.round(averages.averageRating * 10) / 10,
      totalRatings,
      workQuality: Math.round(averages.workQuality * 10) / 10,
      communication: Math.round(averages.communication * 10) / 10,
      professionalism: Math.round(averages.professionalism * 10) / 10,
      wouldWorkAgainPercentage: Math.round(averages.wouldWorkAgainPercentage),
      completedContracts,
      onTimeDeliveryRate: Math.round(onTimeDeliveryRate),
    });
  } catch (error) {
    logger.error('Failed to get aggregated score:', error);
    return errorResult('AGGREGATION_FAILED', error instanceof Error ? error.message : 'Failed to aggregate reputation score');
  }
}

/**
 * Get reputation breakdown
 */
export async function getReputationBreakdown(userId: string): Promise<ServiceResult<ReputationBreakdown>> {
  try {
    const reviews = await fetchReviewsForUser(userId);

    if (reviews.length === 0) {
      return successResult({
        fiveStars: 0,
        fourStars: 0,
        threeStars: 0,
        twoStars: 0,
        oneStar: 0,
        recentRatings: [],
      });
    }

    // Compute star distribution in memory
    const fiveStars = reviews.filter(r => r.rating === 5).length;
    const fourStars = reviews.filter(r => r.rating === 4).length;
    const threeStars = reviews.filter(r => r.rating === 3).length;
    const twoStars = reviews.filter(r => r.rating === 2).length;
    const oneStar = reviews.filter(r => r.rating === 1).length;

    // Get 10 most recent reviews with user/project info
    const recentReviews = [...reviews]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    // Fetch reviewer names and project titles for recent reviews
    const recentRatings = await Promise.all(
      recentReviews.map(async r => {
        let reviewerName = 'Anonymous';
        let projectTitle = 'Unknown Project';

        const reviewer = await userRepository.getUserById(r.reviewer_id);
        if (reviewer?.name) {
          reviewerName = reviewer.name;
        }

        if (r.project_id) {
          const project = await projectRepository.getProjectById(r.project_id);
          if (project?.title) {
            projectTitle = project.title;
          }
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

    return successResult({
      fiveStars,
      fourStars,
      threeStars,
      twoStars,
      oneStar,
      recentRatings,
    });
  } catch (error) {
    logger.error('Failed to get reputation breakdown:', error);
    return errorResult('BREAKDOWN_FAILED', error instanceof Error ? error.message : 'Failed to get reputation breakdown');
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
    const allReviews = await reviewRepository.findAllByRevieweeId(userId);

    const reviews = allReviews.filter(
      r => new Date(r.created_at) >= startDate
    );

    if (reviews.length === 0) {
      return successResult([]);
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

    return successResult(history);
  } catch (error) {
    logger.error('Failed to get reputation history:', error);
    return errorResult('HISTORY_FAILED', error instanceof Error ? error.message : 'Failed to get reputation history');
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
    const allReviews = await reviewRepository.listAll();

    // Group by reviewee_id
    const userStats = new Map<string, { sum: number; count: number }>();
    for (const review of allReviews) {
      const revieweeId = review.reviewee_id;
      const existing = userStats.get(revieweeId) || { sum: 0, count: 0 };
      existing.sum += review.rating;
      existing.count += 1;
      userStats.set(revieweeId, existing);
    }

    // Filter users with >= 3 ratings, compute average
    const candidates = Array.from(userStats.entries()).reduce<Array<{ userId: string; averageRating: number; totalRatings: number }>>((acc, [userId, stats]) => {
      if (stats.count >= 3) {
        acc.push({
          userId,
          averageRating: Math.round((stats.sum / stats.count) * 10) / 10,
          totalRatings: stats.count,
        });
      }
      return acc;
    }, [])
      .sort((a, b) => b.averageRating - a.averageRating || b.totalRatings - a.totalRatings)
      .slice(0, limit);

    // Fetch user names
    const leaderboard = await Promise.all(
      candidates.map(async (entry) => {
        const user = await userRepository.getUserById(entry.userId);
        return { ...entry, userName: user?.name || 'Unknown' };
      })
    );

    return successResult(leaderboard);
  } catch (error) {
    logger.error('Failed to get leaderboard:', error);
    return errorResult('LEADERBOARD_FAILED', error instanceof Error ? error.message : 'Failed to get leaderboard');
  }
}
