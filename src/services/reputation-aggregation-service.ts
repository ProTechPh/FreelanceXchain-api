import { logger } from '../config/logger.js';
import { reviewRepository } from '../repositories/review-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { platformMetricsCache } from '../utils/cache.js';
import type { UserRole } from '../models/user.js';

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

    let milestones: any = project.milestones;
    /* istanbul ignore next */
    if (typeof milestones === 'string') {
      try {
        milestones = JSON.parse(milestones);
      } catch {
        milestones = [];
      }
    }
    if (!Array.isArray(milestones)) return { approved: 0, onTime: 0 };

    let approved = 0;
    let onTime = 0;
    for (const m of milestones) {
      if (m && typeof m === 'object' && m.status === 'approved') {
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

  return totalApproved > 0 ? Math.round((onTimeCount / totalApproved) * 100) : 0;
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

    const fiveStars = reviews.filter(r => r.rating === 5).length;
    const fourStars = reviews.filter(r => r.rating === 4).length;
    const threeStars = reviews.filter(r => r.rating === 3).length;
    const twoStars = reviews.filter(r => r.rating === 2).length;
    const oneStar = reviews.filter(r => r.rating === 1).length;

    const recentReviews = [...reviews]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

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

    const monthlyData = new Map<string, { sum: number; count: number }>();

    reviews.forEach(review => {
      const date = new Date(review.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthlyData.get(monthKey) || { sum: 0, count: 0 };
      existing.sum += review.rating;
      existing.count += 1;
      monthlyData.set(monthKey, existing);
    });

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

export type ReputationLeaderboardRole = Extract<UserRole, 'freelancer' | 'employer'>;

export type ReputationLeaderboardEntry = {
  userId: string;
  userName: string;
  role: ReputationLeaderboardRole;
  averageRating: number;
  totalRatings: number;
  rankingScore: number;
};

const LEADERBOARD_PRIOR_RATING = 4;
const LEADERBOARD_PRIOR_WEIGHT = 5;

function getConfidenceWeightedRating(sum: number, count: number): number {
  return Math.round(
    ((sum + LEADERBOARD_PRIOR_RATING * LEADERBOARD_PRIOR_WEIGHT) /
      (count + LEADERBOARD_PRIOR_WEIGHT)) * 100,
  ) / 100;
}

function getE2ELeaderboardFixtures(
  role: ReputationLeaderboardRole,
  limit: number,
): ReputationLeaderboardEntry[] {
  if (process.env['ENABLE_E2E_FIXTURES'] !== 'true' || process.env.NODE_ENV === 'production') {
    return [];
  }

  const fixtures: ReputationLeaderboardEntry[] = role === 'freelancer'
    ? [
        { userId: 'fixture-freelancer-1', userName: 'Maya Chen', role, averageRating: 4.9, totalRatings: 24, rankingScore: 4.74 },
        { userId: 'fixture-freelancer-2', userName: 'Diego Alvarez', role, averageRating: 5.0, totalRatings: 8, rankingScore: 4.62 },
        { userId: 'fixture-freelancer-3', userName: 'Priya Raman', role, averageRating: 4.8, totalRatings: 15, rankingScore: 4.60 },
        { userId: 'fixture-freelancer-4', userName: 'Noah Okafor', role, averageRating: 4.7, totalRatings: 11, rankingScore: 4.48 },
      ]
    : [
        { userId: 'fixture-employer-1', userName: 'Aster Labs', role, averageRating: 4.9, totalRatings: 18, rankingScore: 4.70 },
        { userId: 'fixture-employer-2', userName: 'Northstar DAO', role, averageRating: 4.8, totalRatings: 14, rankingScore: 4.59 },
        { userId: 'fixture-employer-3', userName: 'ChainForge Studio', role, averageRating: 5.0, totalRatings: 5, rankingScore: 4.50 },
      ];

  return fixtures.slice(0, limit);
}

/** Get a role-specific platform leaderboard. */
export async function getReputationLeaderboard(
  limit: number = 10,
  role: ReputationLeaderboardRole = 'freelancer',
): Promise<ServiceResult<ReputationLeaderboardEntry[]>> {
  const isTest = process.env.NODE_ENV === 'test';
  const cacheKey = `leaderboard:${role}:${limit}`;
  /* istanbul ignore next */
  if (!isTest) {
    const cached = platformMetricsCache.get(cacheKey);
    if (cached) return successResult(cached);
  }

  try {
    // (Appwrite doesn't support GROUP BY queries)
    const allReviews = await reviewRepository.listAll();

    const userStats = new Map<string, { sum: number; count: number }>();
    for (const review of allReviews) {
      const revieweeId = review.reviewee_id;
      const existing = userStats.get(revieweeId) || { sum: 0, count: 0 };
      existing.sum += review.rating;
      existing.count += 1;
      userStats.set(revieweeId, existing);
    }

    // A minimum sample keeps one-off ratings out. Confidence weighting then
    // prevents a three-review perfect score from outranking a long, proven
    // record by default.
    const candidates = Array.from(userStats.entries()).reduce<Array<{ userId: string; averageRating: number; totalRatings: number; rankingScore: number }>>((acc, [userId, stats]) => {
      if (stats.count >= 3) {
        acc.push({
          userId,
          averageRating: Math.round((stats.sum / stats.count) * 10) / 10,
          totalRatings: stats.count,
          rankingScore: getConfidenceWeightedRating(stats.sum, stats.count),
        });
      }
      return acc;
    }, []);

    const enriched = await Promise.all(
      candidates.map(async (entry) => {
        const user = await userRepository.getUserById(entry.userId);
        if (user?.role !== role) return null;
        return { ...entry, userName: user.name || 'Unknown', role };
      }),
    );
    const leaderboard = enriched
      .filter((entry): entry is ReputationLeaderboardEntry => entry !== null)
      .sort((a, b) => b.rankingScore - a.rankingScore || b.totalRatings - a.totalRatings)
      .slice(0, limit);
    const result = leaderboard.length > 0 ? leaderboard : getE2ELeaderboardFixtures(role, limit);

    /* istanbul ignore next */
    if (!isTest) {
      platformMetricsCache.set(cacheKey, result, 60_000);
    }

    return successResult(result);
  } catch (error) {
    logger.error('Failed to get leaderboard:', error);
    return errorResult('LEADERBOARD_FAILED', error instanceof Error ? error.message : 'Failed to get leaderboard');
  }
}
