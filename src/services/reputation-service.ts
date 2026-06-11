/**
 * Reputation & Review Service
 * Handles rating/review submission, reputation score computation, work history retrieval
 * Merged from former review-service.ts and reputation-service.ts
 * Uses Appwrite reviews table as primary storage, blockchain as best-effort sync
 */

import {
  submitRatingToBlockchain,
  BlockchainRating,
} from './reputation-blockchain.js';
import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { mapContractFromEntity } from '../utils/entity-mapper.js';
import { notifyRatingReceived } from './notification-service.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type { Review, ReviewEntity } from '../models/review.js';


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
 * Stores in Appwrite reviews table, syncs to blockchain best-effort
 * Supports both simple ratings (via /api/reputation/rate) and rich reviews (via /api/reviews)
 */
export async function submitRating(
  input: RatingInput
): Promise<ServiceResult<RatingResult>> {
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

// Check for duplicate review
const existingReviewResponse = await databases.listDocuments(
  DATABASE_ID,
  COLLECTIONS.REVIEWS,
  [
    Query.equal('contract_id', input.contractId),
    Query.equal('reviewer_id', input.raterId),
    Query.limit(1),
  ]
);

if (existingReviewResponse.total > 0) {
  return {
    success: false,
    error: {
      code: 'DUPLICATE_RATING',
      message: 'You have already rated this user for this contract',
    },
  };
}

const reviewerRole = input.reviewerRole ?? (contract.employerId === input.raterId ? 'employer' : 'freelancer');

const reviewData: Record<string, any> = {
  contract_id: input.contractId,
  project_id: contract.projectId,
  reviewer_id: input.raterId,
  reviewee_id: rateeId,
  rating: input.rating,
  comment: input.comment || null,
  reviewer_role: reviewerRole,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

if (input.workQuality !== undefined) {
  reviewData.work_quality = input.workQuality;
}
if (input.communication !== undefined) {
  reviewData.communication = input.communication;
}
if (input.professionalism !== undefined) {
  reviewData.professionalism = input.professionalism;
}
if (input.wouldWorkAgain !== undefined) {
  reviewData.would_work_again = input.wouldWorkAgain;
}

const reviewDoc = await databases.createDocument(
  DATABASE_ID,
  COLLECTIONS.REVIEWS,
  ID.unique(),
  reviewData
);

const reviewAttrs = reviewDoc as any;
const review = {
  id: reviewAttrs.$id,
  contract_id: reviewAttrs.contract_id,
  project_id: reviewAttrs.project_id,
  reviewer_id: reviewAttrs.reviewer_id,
  reviewee_id: reviewAttrs.reviewee_id,
  rating: reviewAttrs.rating,
  comment: reviewAttrs.comment,
  reviewer_role: reviewAttrs.reviewer_role,
  work_quality: reviewAttrs.work_quality,
  communication: reviewAttrs.communication,
  professionalism: reviewAttrs.professionalism,
  would_work_again: reviewAttrs.would_work_again,
  created_at: reviewAttrs.created_at,
  updated_at: reviewAttrs.updated_at,
};

let transactionHash = '';
try {
  // Look up ratee wallet address for blockchain sync
  let rateeDoc: Record<string, any> | null = null;
  try {
    rateeDoc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, rateeId) as any;
  } catch { /* ignore */ }

  const rateeWallet = (rateeDoc as any)?.wallet_address;

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
): Promise<ServiceResult<ReputationScore>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.orderDesc('created_at'),
        Query.limit(1000),
      ]
    );

    const ratings: RatingData[] = response.documents.map((r: any) => ({
      id: r.$id,
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
  } catch (error) {
    logger.error('Failed to get reputation', { error, userId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to get reputation',
      },
    };
  }
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
    const ageInSeconds = now - rating.timestamp;
    const ageInDays = ageInSeconds / 86400;
    const weight = Math.exp(-decayLambda * ageInDays);
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
): Promise<ServiceResult<WorkHistoryEntry[]>> {
  try {
    const contractsResult = await contractRepository.getUserContracts(userId);
    const contractEntities = contractsResult.items;

    const completedContracts = contractEntities.filter(c => c.status === 'completed');

    const reviewsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.limit(1000),
      ]
    );

    const workHistory: WorkHistoryEntry[] = [];

    for (const contractEntity of completedContracts) {
      const contract = mapContractFromEntity(contractEntity);

      const role: 'freelancer' | 'employer' =
        contract.freelancerId === userId ? 'freelancer' : 'employer';

      const projectEntity = await projectRepository.getProjectById(contract.projectId);
      const projectTitle = projectEntity?.title ?? 'Unknown Project';

      const receivedRating = reviewsResponse.documents.find((r: any) => r.contract_id === contract.id);

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
  } catch (error) {
    logger.error('Failed to get work history', { error, userId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to get work history',
      },
    };
  }
}

/**
 * Get ratings for a specific contract
 */
export async function getContractRatings(
  contractId: string
): Promise<ServiceResult<RatingData[]>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('contract_id', contractId),
        Query.limit(1000),
      ]
    );

    const ratings: RatingData[] = response.documents.map((r: any) => ({
      id: r.$id,
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
  } catch (error) {
    logger.error('Failed to get contract ratings', { error, contractId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to get contract ratings',
      },
    };
  }
}

/**
 * Check if a user can rate another user for a contract
 */
export async function canUserRate(
  raterId: string,
  rateeId: string,
  contractId: string
): Promise<ServiceResult<{ canRate: boolean; reason?: string }>> {
  try {
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

  const existingReviewResponse = await databases.listDocuments(
    DATABASE_ID,
    COLLECTIONS.REVIEWS,
    [
      Query.equal('contract_id', contractId),
      Query.equal('reviewer_id', raterId),
      Query.limit(1),
    ]
  );

  if (existingReviewResponse.total > 0) {
    return {
      success: true,
      data: { canRate: false, reason: 'You have already rated this user for this contract' },
    };
  }

  return {
    success: true,
    data: { canRate: true },
  };
  } catch (error) {
    logger.error('Failed to check if user can rate', { error, raterId, rateeId, contractId });
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to check rating eligibility',
      },
    };
  }
}

// --- Former review-service.ts functions ---

/**
 * Get review by ID
 */
export async function getReviewById(reviewId: string): Promise<ServiceResult<Review>> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.REVIEWS, reviewId);

    return {
      success: true,
      data: mapReviewFromEntity(doc as any as ReviewEntity),
    };
  } catch (error) {
    logger.error('Failed to get review by ID', { error, reviewId });
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Review not found' },
    };
  }
}

/**
 * Get reviews for a user (as reviewee)
 */
export async function getUserReviews(userId: string): Promise<ServiceResult<Review[]>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('reviewee_id', userId),
        Query.orderDesc('created_at'),
        Query.limit(1000),
      ]
    );

    return {
      success: true,
      data: response.documents.map((r: any) => mapReviewFromEntity(r as ReviewEntity)),
    };
  } catch (error) {
    logger.error('Failed to get user reviews', { error, userId });
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to fetch reviews' },
    };
  }
}

/**
 * Get reviews for a project
 */
export async function getProjectReviews(projectId: string): Promise<ServiceResult<Review[]>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.REVIEWS,
      [
        Query.equal('project_id', projectId),
        Query.orderDesc('created_at'),
        Query.limit(1000),
      ]
    );

    return {
      success: true,
      data: response.documents.map((r: any) => mapReviewFromEntity(r as ReviewEntity)),
    };
  } catch (error) {
    logger.error('Failed to get project reviews', { error, projectId });
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Failed to fetch reviews' },
    };
  }
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
