/**
 * Reputation & Review Service
 * Handles rating/review submission, reputation score computation, work history retrieval
 * Merged from former review-service.ts and reputation-service.ts
 * Uses Supabase reviews table as primary storage, blockchain as best-effort sync
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7
 */

import {
  submitRatingToBlockchain,
  _getRatingsFromBlockchain,
  hasUserRatedForContract as _hasUserRatedForContractBlockchain,
  BlockchainRating,
} from './reputation-blockchain.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { mapContractFromEntity } from '../utils/entity-mapper.js';
import { notifyRatingReceived } from './notification-service.js';
import { logger } from '../config/logger.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';
import type { Review, ReviewEntity } from '../models/review.js';

export type ReputationServiceResult<T> = ServiceResult<T>;
export type ReputationServiceError = ServiceError;

export type RatingInput = {
  contractId: string;
  raterId: string;
  rateeId?: string;
  rating: number;
  comment?: string;
  reviewerRole?: string;
  workQuality?: number;
  communication?: number;
  professionalism?: number;
  wouldWorkAgain?: boolean;
};

export type RatingData = {
  id: string;
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number;
  comment?: string | undefined;
  timestamp: number;
  transactionHash: string;
};

export type ReputationScore = {
  userId: string;
  score: number;
  totalRatings: number;
  averageRating: number;
  ratings: RatingData[];
};

export type WorkHistoryEntry = {
  contractId: string;
  projectId: string;
  projectTitle: string;
  role: 'freelancer' | 'employer';
  completedAt: string;
  rating?: number;
  ratingComment?: string;
};

export type RatingResult = {
  rating: RatingData;
  transactionHash: string;
};

/**
 * Submit a rating/review for a completed contract
 * Stores in Supabase reviews table, syncs to blockchain best-effort
 * Supports both simple ratings (via /api/reputation/rate) and rich reviews (via /api/reviews)
 */
export async function submitRating(
  input: RatingInput
): Promise<ReputationServiceResult<RatingResult>> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return {
      success: false,
      error: {
        code: 'INVALID_RATING',
        message: 'Rating must be an integer between 1 and 5',
      },
    };
  }

  const contractEntity = await contractRepository.getContractById(input.contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Contract not found',
      },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'completed') {
    return {
      success: false,
      error: {
        code: 'INVALID_CONTRACT_STATUS',
        message: `Can only submit ratings for completed contracts (current status: ${contract.status})`,
      },
    };
  }

  if (contract.freelancerId !== input.raterId && contract.employerId !== input.raterId) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only contract participants can submit ratings',
      },
    };
  }

  const rateeId = input.rateeId ?? (input.raterId === contract.freelancerId ? contract.employerId : contract.freelancerId);

  if (contract.freelancerId !== rateeId && contract.employerId !== rateeId) {
    return {
      success: false,
      error: {
        code: 'INVALID_RATEE',
        message: 'Ratee must be a contract participant',
      },
    };
  }

  if (input.raterId === rateeId) {
    return {
      success: false,
      error: {
        code: 'SELF_RATING',
        message: 'Users cannot rate themselves',
      },
    };
  }

  const supabase = getSupabaseServiceClient();

  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('contract_id', input.contractId)
    .eq('reviewer_id', input.raterId)
    .single();

  if (existingReview) {
    return {
      success: false,
      error: {
        code: 'DUPLICATE_RATING',
        message: 'You have already rated this user for this contract',
      },
    };
  }

  const reviewerRole = input.reviewerRole ?? (contract.employerId === input.raterId ? 'employer' : 'freelancer');

  const insertData: Record<string, unknown> = {
    contract_id: input.contractId,
    project_id: contract.projectId,
    reviewer_id: input.raterId,
    reviewee_id: rateeId,
    rating: input.rating,
    comment: input.comment || null,
    reviewer_role: reviewerRole,
  };

  if (input.workQuality !== undefined) insertData.work_quality = input.workQuality;
  if (input.communication !== undefined) insertData.communication = input.communication;
  if (input.professionalism !== undefined) insertData.professionalism = input.professionalism;
  if (input.wouldWorkAgain !== undefined) insertData.would_work_again = input.wouldWorkAgain;

  const { data: review, error: insertError } = await supabase
    .from('reviews')
    .insert(insertData)
    .select()
    .single();

  if (insertError || !review) {
    logger.error('Failed to save rating', { error: insertError, contractId: input.contractId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save rating',
      },
    };
  }

  let transactionHash = '';
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, wallet_address')
      .in('id', [input.raterId, rateeId]);

    const rateeWallet = users?.find(u => u.id === rateeId)?.wallet_address;

    if (rateeWallet) {
      const { isWeb3Available } = await import('./web3-client.js');
      if (!isWeb3Available()) {
        logger.warn('Web3 not available, skipping blockchain sync', { reviewId: review.id });
      } else {
        const { getContractAddress } = await import('../config/contracts.js');
        const reputationAddress = getContractAddress('reputation');
        logger.info('Attempting blockchain sync', {
          reviewId: review.id,
          rateeWallet,
          reputationAddress,
          web3Available: true,
        });

        const isEmployerRating = contract.employerId === input.raterId;
        const result = await submitRatingToBlockchain({
          contractId: input.contractId,
          rateeAddress: rateeWallet,
          rating: input.rating,
          comment: input.comment || '',
          isEmployerRating,
        });
        transactionHash = result.transactionHash;
        logger.info('Rating synced to blockchain', { reviewId: review.id, transactionHash });
      }
    } else {
      logger.warn('Ratee has no wallet address, skipping blockchain sync', { rateeId });
    }
  } catch (blockchainError: unknown) {
    logger.error('Failed to sync rating to blockchain', {
      error: blockchainError instanceof Error ? blockchainError.message : String(blockchainError),
      reviewId: review.id,
    });
  }

  const rating: RatingData = {
    id: review.id,
    contractId: input.contractId,
    raterId: input.raterId,
    rateeId,
    rating: input.rating,
    comment: input.comment,
    timestamp: Math.floor(new Date(review.created_at).getTime() / 1000),
    transactionHash,
  };

  const projectEntity = await projectRepository.getProjectById(contract.projectId);
  const projectTitle = projectEntity?.title ?? 'Unknown Project';

  await notifyRatingReceived(
    rateeId,
    input.rating,
    input.contractId,
    projectTitle
  );

  return {
    success: true,
    data: {
      rating,
      transactionHash,
    },
  };
}

/**
 * Get reputation score for a user
 */
export async function getReputation(
  userId: string,
  decayLambda: number = 0.01
): Promise<ReputationServiceResult<ReputationScore>> {
  const supabase = getSupabaseServiceClient();

  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false });

  if (reviewsError) {
    logger.error('Failed to fetch reviews for reputation', { error: reviewsError, userId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch reviews',
      },
    };
  }

  const ratings: RatingData[] = (reviews || []).map(r => ({
    id: r.id,
    contractId: r.contract_id,
    raterId: r.reviewer_id,
    rateeId: r.reviewee_id,
    rating: r.rating,
    comment: r.comment || undefined,
    timestamp: Math.floor(new Date(r.created_at).getTime() / 1000),
    transactionHash: '',
  }));

  const score = computeAggregateScore(ratings, decayLambda);

  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 100) / 100
    : 0;

  return {
    success: true,
    data: {
      userId,
      score,
      totalRatings: ratings.length,
      averageRating,
      ratings,
    },
  };
}

/**
 * Compute aggregate reputation score with time decay
 */
function computeAggregateScore(ratings: RatingData[], decayLambda: number = 0.01): number {
  if (ratings.length === 0) return 0;

  const now = Math.floor(Date.now() / 1000);
  let weightedSum = 0;
  let weightSum = 0;

  for (const rating of ratings) {
    const age = now - rating.timestamp;
    const weight = Math.exp(-decayLambda * age);
    weightedSum += rating.rating * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? Math.round((weightedSum / weightSum) * 100) / 100 : 0;
}

/**
 * Get work history for a user
 */
export async function getWorkHistory(
  userId: string
): Promise<ReputationServiceResult<WorkHistoryEntry[]>> {
  const supabase = getSupabaseServiceClient();

  const contractsResult = await contractRepository.getUserContracts(userId);
  const contractEntities = contractsResult.items;

  const completedContracts = contractEntities.filter(c => c.status === 'completed');

  const { data: userReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId);

  const workHistory: WorkHistoryEntry[] = [];

  for (const contractEntity of completedContracts) {
    const contract = mapContractFromEntity(contractEntity);

    const role: 'freelancer' | 'employer' =
      contract.freelancerId === userId ? 'freelancer' : 'employer';

    const projectEntity = await projectRepository.getProjectById(contract.projectId);
    const projectTitle = projectEntity?.title ?? 'Unknown Project';

    const receivedRating = userReviews?.find(r => r.contract_id === contract.id);

    workHistory.push({
      contractId: contract.id,
      projectId: contract.projectId,
      projectTitle,
      role,
      completedAt: contract.updatedAt,
      rating: receivedRating?.rating,
      ratingComment: receivedRating?.comment,
    });
  }

  workHistory.sort((a, b) =>
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return {
    success: true,
    data: workHistory,
  };
}

/**
 * Get ratings for a specific contract
 */
export async function getContractRatings(
  contractId: string
): Promise<ReputationServiceResult<RatingData[]>> {
  const supabase = getSupabaseServiceClient();

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('contract_id', contractId);

  const ratings: RatingData[] = (reviews || []).map(r => ({
    id: r.id,
    contractId: r.contract_id,
    raterId: r.reviewer_id,
    rateeId: r.reviewee_id,
    rating: r.rating,
    comment: r.comment || undefined,
    timestamp: Math.floor(new Date(r.created_at).getTime() / 1000),
    transactionHash: '',
  }));

  return {
    success: true,
    data: ratings,
  };
}

/**
 * Check if a user can rate another user for a contract
 */
export async function canUserRate(
  raterId: string,
  rateeId: string,
  contractId: string
): Promise<ReputationServiceResult<{ canRate: boolean; reason?: string }>> {
  const supabase = getSupabaseServiceClient();

  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: true,
      data: { canRate: false, reason: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'completed') {
    return {
      success: true,
      data: { canRate: false, reason: 'Contract must be completed before rating' },
    };
  }

  if (contract.freelancerId !== raterId && contract.employerId !== raterId) {
    return {
      success: true,
      data: { canRate: false, reason: 'You are not a participant in this contract' },
    };
  }

  if (contract.freelancerId !== rateeId && contract.employerId !== rateeId) {
    return {
      success: true,
      data: { canRate: false, reason: 'Ratee is not a participant in this contract' },
    };
  }

  if (raterId === rateeId) {
    return {
      success: true,
      data: { canRate: false, reason: 'You cannot rate yourself' },
    };
  }

  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('contract_id', contractId)
    .eq('reviewer_id', raterId)
    .single();

  if (existingReview) {
    return {
      success: true,
      data: { canRate: false, reason: 'You have already rated this user for this contract' },
    };
  }

  return {
    success: true,
    data: { canRate: true },
  };
}

// --- Former review-service.ts functions ---

/**
 * Get review by ID
 */
export async function getReviewById(reviewId: string): Promise<ServiceResult<Review>> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Review not found' },
    };
  }

  return {
    success: true,
    data: mapReviewFromEntity(data as ReviewEntity),
  };
}

/**
 * Get reviews for a user (as reviewee)
 */
export async function getUserReviews(userId: string): Promise<ServiceResult<Review[]>> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to get user reviews', { error, userId });
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to fetch reviews' },
    };
  }

  return {
    success: true,
    data: (data || []).map(r => mapReviewFromEntity(r as ReviewEntity)),
  };
}

/**
 * Get reviews for a project
 */
export async function getProjectReviews(projectId: string): Promise<ServiceResult<Review[]>> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to get project reviews', { error, projectId });
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to fetch reviews' },
    };
  }

  return {
    success: true,
    data: (data || []).map(r => mapReviewFromEntity(r as ReviewEntity)),
  };
}

function mapReviewFromEntity(entity: ReviewEntity): Review {
  return {
    id: entity.id,
    contractId: entity.contract_id,
    projectId: entity.project_id,
    reviewerId: entity.reviewer_id,
    revieweeId: entity.reviewee_id,
    rating: entity.rating,
    comment: entity.comment,
    reviewerRole: entity.reviewer_role,
    workQuality: entity.work_quality,
    communication: entity.communication,
    professionalism: entity.professionalism,
    wouldWorkAgain: entity.would_work_again,
    createdAt: new Date(entity.created_at),
    updatedAt: new Date(entity.updated_at),
  };
}

export function serializeReputationRecord(record: BlockchainRating): string {
  return JSON.stringify(record);
}

export function deserializeReputationRecord(serialized: string): BlockchainRating {
  return JSON.parse(serialized) as BlockchainRating;
}