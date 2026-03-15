/**
 * Reputation Service
 * Handles rating submission, reputation score computation, and work history retrieval
 * Uses Supabase reviews table as primary storage, blockchain as best-effort sync
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7
 */

import {
  submitRatingToBlockchain,
  getRatingsFromBlockchain,
  hasUserRatedForContract as hasUserRatedForContractBlockchain,
  BlockchainRating,
} from './reputation-blockchain.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { mapContractFromEntity } from '../utils/entity-mapper.js';
import { notifyRatingReceived } from './notification-service.js';
import { logger } from '../config/logger.js';

// Rating input type
export type RatingInput = {
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number;
  comment?: string | undefined;
};

// Unified rating type for API responses
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

// Reputation score result
export type ReputationScore = {
  userId: string;
  score: number;
  totalRatings: number;
  averageRating: number;
  ratings: RatingData[];
};

// Work history entry
export type WorkHistoryEntry = {
  contractId: string;
  projectId: string;
  projectTitle: string;
  role: 'freelancer' | 'employer';
  completedAt: string;
  rating?: number | undefined;
  ratingComment?: string | undefined;
};


// Service error type
export type ReputationServiceError = {
  code: string;
  message: string;
  details?: string[];
};

// Service result type
export type ReputationServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ReputationServiceError };

// Rating result type
export type RatingResult = {
  rating: RatingData;
  transactionHash: string;
};

/**
 * Submit a rating for a completed contract
 * Stores in Supabase reviews table, syncs to blockchain best-effort
 * Requirements: 7.3, 7.4
 */
export async function submitRating(
  input: RatingInput
): Promise<ReputationServiceResult<RatingResult>> {
  // Validate rating value (1-5)
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return {
      success: false,
      error: {
        code: 'INVALID_RATING',
        message: 'Rating must be an integer between 1 and 5',
      },
    };
  }

  // Verify contract exists
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

  // FIXED: Verify contract is completed before allowing ratings
  // Users should not be able to rate on active, pending, or cancelled contracts
  if (contract.status !== 'completed') {
    return {
      success: false,
      error: {
        code: 'INVALID_CONTRACT_STATUS',
        message: `Can only submit ratings for completed contracts (current status: ${contract.status})`,
      },
    };
  }

  // Verify rater is part of the contract
  if (contract.freelancerId !== input.raterId && contract.employerId !== input.raterId) {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only contract participants can submit ratings',
      },
    };
  }

  // Verify ratee is part of the contract
  if (contract.freelancerId !== input.rateeId && contract.employerId !== input.rateeId) {
    return {
      success: false,
      error: {
        code: 'INVALID_RATEE',
        message: 'Ratee must be a contract participant',
      },
    };
  }

  // Verify rater and ratee are different
  if (input.raterId === input.rateeId) {
    return {
      success: false,
      error: {
        code: 'SELF_RATING',
        message: 'Users cannot rate themselves',
      },
    };
  }

  const supabase = getSupabaseServiceClient();

  // Check for duplicate rating in Supabase reviews table
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

  // Determine reviewer role
  const reviewerRole = contract.employerId === input.raterId ? 'employer' : 'freelancer';

  // Store rating in Supabase reviews table (primary storage)
  const { data: review, error: insertError } = await supabase
    .from('reviews')
    .insert({
      contract_id: input.contractId,
      reviewer_id: input.raterId,
      reviewee_id: input.rateeId,
      rating: input.rating,
      comment: input.comment || null,
      reviewer_role: reviewerRole,
    })
    .select()
    .single();

  if (insertError || !review) {
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save rating',
      },
    };
  }

  // Best-effort blockchain sync
  let transactionHash = '';
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, wallet_address')
      .in('id', [input.raterId, input.rateeId]);

    const rateeWallet = users?.find(u => u.id === input.rateeId)?.wallet_address;

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
      logger.warn('Ratee has no wallet address, skipping blockchain sync', { rateeId: input.rateeId });
    }
  } catch (blockchainError: any) {
    logger.error('Failed to sync rating to blockchain', {
      error: blockchainError?.message || blockchainError,
      stack: blockchainError?.stack,
      reviewId: review.id,
    });
  }

  const rating: RatingData = {
    id: review.id,
    contractId: input.contractId,
    raterId: input.raterId,
    rateeId: input.rateeId,
    rating: input.rating,
    comment: input.comment,
    timestamp: Math.floor(new Date(review.created_at).getTime() / 1000),
    transactionHash,
  };

  // Get project title for notification
  const projectEntity = await projectRepository.getProjectById(contract.projectId);
  const projectTitle = projectEntity?.title ?? 'Unknown Project';

  // Notify the ratee
  await notifyRatingReceived(
    input.rateeId,
    input.rating,
    input.contractId,
    projectTitle
  );

  return {
    success: true,
    data: {
      rating: rating,
      transactionHash: transactionHash,
    },
  };
}


/**
 * Get reputation score for a user
 * Reads from Supabase reviews table (primary), merges blockchain data if available
 * Requirements: 7.3, 7.5
 */
export async function getReputation(
  userId: string,
  decayLambda: number = 0.01
): Promise<ReputationServiceResult<ReputationScore>> {
  const supabase = getSupabaseServiceClient();

  // Get ratings from Supabase reviews table (primary source)
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false });

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

  // Compute aggregate score with time decay
  const score = computeAggregateScore(ratings, decayLambda);

  // Compute simple average (without time decay)
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
 * Returns completed contracts with ratings from Supabase
 * Requirements: 7.3
 */
export async function getWorkHistory(
  userId: string
): Promise<ReputationServiceResult<WorkHistoryEntry[]>> {
  const supabase = getSupabaseServiceClient();

  // Get all contracts for the user
  const contractsResult = await contractRepository.getUserContracts(userId);
  const contractEntities = contractsResult.items;

  // Filter to completed contracts only
  const completedContracts = contractEntities.filter(c => c.status === 'completed');

  // Get all reviews for this user from Supabase
  const { data: userReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewee_id', userId);

  const workHistory: WorkHistoryEntry[] = [];

  for (const contractEntity of completedContracts) {
    const contract = mapContractFromEntity(contractEntity);

    // Determine user's role in the contract
    const role: 'freelancer' | 'employer' =
      contract.freelancerId === userId ? 'freelancer' : 'employer';

    // Get project details
    const projectEntity = await projectRepository.getProjectById(contract.projectId);
    const projectTitle = projectEntity?.title ?? 'Unknown Project';

    // Find rating received by this user for this contract
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

  // Sort by completion date descending
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
 * Uses Supabase reviews table for duplicate check (no wallet required)
 */
export async function canUserRate(
  raterId: string,
  rateeId: string,
  contractId: string
): Promise<ReputationServiceResult<{ canRate: boolean; reason?: string }>> {
  const supabase = getSupabaseServiceClient();

  // Verify contract exists
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: true,
      data: { canRate: false, reason: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify contract is completed
  if (contract.status !== 'completed') {
    return {
      success: true,
      data: { canRate: false, reason: 'Contract must be completed before rating' },
    };
  }

  // Verify rater is part of the contract
  if (contract.freelancerId !== raterId && contract.employerId !== raterId) {
    return {
      success: true,
      data: { canRate: false, reason: 'You are not a participant in this contract' },
    };
  }

  // Verify ratee is part of the contract
  if (contract.freelancerId !== rateeId && contract.employerId !== rateeId) {
    return {
      success: true,
      data: { canRate: false, reason: 'Ratee is not a participant in this contract' },
    };
  }

  // Verify rater and ratee are different
  if (raterId === rateeId) {
    return {
      success: true,
      data: { canRate: false, reason: 'You cannot rate yourself' },
    };
  }

  // Check for duplicate rating in Supabase reviews table (no wallet needed)
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
