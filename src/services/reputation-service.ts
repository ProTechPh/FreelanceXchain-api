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
import { databases, DATABASE_ID } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { reviewRepository, type ReviewEntity } from '../repositories/review-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { mapContractFromEntity } from '../utils/entity-mapper.js';
import { notifyRatingReceived } from './notification-service.js';
import { sendGatedEmail, sendReviewReceivedEmail } from './email-delivery-service.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import type { Review } from '../models/review.js';


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

type RatingData = {
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

type RatingResult = {
  rating: RatingData;
  transactionHash: string;
};

type RatingValidation = {
  contract: ReturnType<typeof mapContractFromEntity>;
  rateeId: string;
  reviewerRole: string;
};

/**
 * Validate that a rating can be submitted for the contract.
 * Returns the resolved ratee/reviewer role or a ServiceResult error.
 */
async function validateRatingInput(input: RatingInput): Promise<
  | { error: ServiceResult<RatingResult> }
  | RatingValidation
> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: errorResult('INVALID_RATING', 'Rating must be an integer between 1 and 5') };
  }

  const contractEntity = await contractRepository.getContractById(input.contractId);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'completed') {
    return { error: errorResult('INVALID_CONTRACT_STATUS', `Can only submit ratings for completed contracts (current status: ${contract.status})`) };
  }

  if (contract.freelancerId !== input.raterId && contract.employerId !== input.raterId) {
    return { error: errorResult('UNAUTHORIZED', 'Only contract participants can submit ratings') };
  }

  const rateeId = input.rateeId ?? (input.raterId === contract.freelancerId ? contract.employerId : contract.freelancerId);

  if (contract.freelancerId !== rateeId && contract.employerId !== rateeId) {
    return { error: errorResult('INVALID_RATEE', 'Ratee must be a contract participant') };
  }

  if (input.raterId === rateeId) {
    return { error: errorResult('SELF_RATING', 'Users cannot rate themselves') };
  }

  if (await reviewRepository.hasReviewed(input.contractId, input.raterId)) {
    return { error: errorResult('DUPLICATE_RATING', 'You have already rated this user for this contract') };
  }

  const reviewerRole = input.reviewerRole ?? (contract.employerId === input.raterId ? 'employer' : 'freelancer');

  return { contract, rateeId, reviewerRole };
}

/**
 * Build the review document payload from the rating input.
 */
function buildReviewDocument(
  input: RatingInput,
  contract: ReturnType<typeof mapContractFromEntity>,
  rateeId: string,
  reviewerRole: string,
): Record<string, unknown> {
  const reviewData: Record<string, unknown> = {
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

  return reviewData;
}

type ReviewRecord = {
  id: string;
  contract_id: string;
  project_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  reviewer_role: string;
  work_quality?: unknown;
  communication?: unknown;
  professionalism?: unknown;
  would_work_again?: unknown;
  created_at: string;
  updated_at: string;
};

/**
 * Persist the review document and return the stored record.
 */
async function createReviewDocument(reviewData: Record<string, unknown>): Promise<ReviewRecord> {
  const reviewDoc = await reviewRepository.create(reviewData as unknown as Parameters<typeof reviewRepository.create>[0]);

  const record: ReviewRecord = {
    id: reviewDoc.id,
    contract_id: reviewDoc.contract_id,
    reviewer_id: reviewDoc.reviewer_id,
    reviewee_id: reviewDoc.reviewee_id,
    rating: reviewDoc.rating,
    comment: reviewDoc.comment,
    reviewer_role: reviewDoc.reviewer_role,
    work_quality: reviewDoc.work_quality,
    communication: reviewDoc.communication,
    professionalism: reviewDoc.professionalism,
    would_work_again: reviewDoc.would_work_again,
    created_at: reviewDoc.created_at,
    updated_at: reviewDoc.updated_at,
  };
  if (reviewDoc.project_id) {
    record.project_id = reviewDoc.project_id;
  }
  return record;
}

/**
 * Sync the rating to the blockchain (best-effort).
 * Returns the transaction hash, or '' when sync is skipped or fails.
 */
async function syncRatingToBlockchain(
  input: RatingInput,
  reviewId: string,
  rateeId: string,
): Promise<string> {
  let transactionHash = '';
  try {
    // Look up ratee wallet address for blockchain sync
    const rateeDoc = await userRepository.getUserById(rateeId);
    const rateeWallet = rateeDoc?.wallet_address;

    if (!rateeWallet) {
      logger.warn('Ratee has no wallet address, skipping blockchain sync', { rateeId });
      return transactionHash;
    }

    const { isWeb3Available } = await import('./web3-client.js');
    if (!isWeb3Available()) {
      logger.warn('Web3 not available, skipping blockchain sync', { reviewId });
      return transactionHash;
    }

    const { getContractAddress } = await import('../config/contracts.js');
    const reputationAddress = getContractAddress('reputation');
    logger.info('Attempting blockchain sync', {
      reviewId,
      rateeWallet,
      reputationAddress,
      web3Available: true,
    });

    // isEmployerRating is derived on-chain from msg.sender — not passed here.
    const result = await submitRatingToBlockchain({
      contractId: input.contractId,
      rateeAddress: rateeWallet,
      rating: input.rating,
      comment: input.comment || '',
    });
    transactionHash = result.transactionHash;
    logger.info('Rating synced to blockchain', { reviewId, transactionHash });
  } catch (blockchainError: unknown) {
    logger.error('Failed to sync rating to blockchain', {
      error: blockchainError instanceof Error ? blockchainError.message : String(blockchainError),
      reviewId,
    });
  }
  return transactionHash;
}

/**
 * Submit a rating/review for a completed contract
 * Stores in Appwrite reviews table, syncs to blockchain best-effort
 * Supports both simple ratings (via /api/reputation/rate) and rich reviews (via /api/reviews)
 */
export async function submitRating(
  input: RatingInput
): Promise<ServiceResult<RatingResult>> {
  // BLF-9.1: Serialize the duplicate-review check-then-insert per (contract, rater)
  // so concurrent parallel submissions cannot both pass the duplicate check and
  // create two reviews (which would double-count the rating). The app-level lock
  // is per-process; the durable backstop is the UNIQUE index on
  // (contract_id, reviewer_id) created by scripts/setup-appwrite-db.ts, which
  // rejects the duplicate write even across server instances.
  return withLock(`rating:${input.contractId}:${input.raterId}`, async () => {
  const validated = await validateRatingInput(input);
  if ('error' in validated) return validated.error;


  const { contract, rateeId, reviewerRole } = validated;

  const review = await createReviewDocument(buildReviewDocument(input, contract, rateeId, reviewerRole));

  const transactionHash = await syncRatingToBlockchain(input, review.id, rateeId);

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

  await notifyRatingReceived({
    userId: rateeId,
    rating: input.rating,
    contractId: input.contractId,
    projectTitle,
  });

  // Transactional email gated by the ratee's email preferences. Best-effort:
  // a lookup/send failure must never break the rating submission.
  try {
    const reviewerDoc = await databases
      .getDocument(DATABASE_ID, COLLECTIONS.USERS, input.raterId)
      .catch(() => null);
    await sendGatedEmail(rateeId, 'review_received', (recipient) =>
      sendReviewReceivedEmail(recipient.email, {
        recipientName: recipient.name,
        reviewerName: reviewerDoc?.name || 'A user',
        rating: input.rating,
        projectTitle,
        reviewUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/reviews/${review.id}`,
      })
    );
  } catch (error) {
    logger.error('Failed to send review-received email', { error, rateeId, raterId: input.raterId });
  }

  return successResult({
    rating,
    transactionHash,
  });
  }); // BLF-9.1: end withLock
}

/**
 * Get reputation score for a user
 */
export async function getReputation(
  userId: string,
  decayLambda: number = 0.01
): Promise<ServiceResult<ReputationScore>> {
  try {
    const reviews = await reviewRepository.findAllByRevieweeId(userId);

    const ratings: RatingData[] = reviews.map((r) => ({
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

    return successResult({
      userId,
      score,
      totalRatings: ratings.length,
      averageRating,
      ratings,
    });
  } catch (error) {
    logger.error('Failed to get reputation', { error, userId });
    return errorResult('DATABASE_ERROR', 'Failed to get reputation');
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

    const reviews = await reviewRepository.findAllByRevieweeId(userId);
    const reviewsByContractId = new Map(reviews.map((r) => [r.contract_id, r]));

    const workHistory: WorkHistoryEntry[] = await Promise.all(
      completedContracts.map(async (contractEntity) => {
        const contract = mapContractFromEntity(contractEntity);

        const role: 'freelancer' | 'employer' =
          contract.freelancerId === userId ? 'freelancer' : 'employer';

        const projectEntity = await projectRepository.getProjectById(contract.projectId);
        const projectTitle = projectEntity?.title ?? 'Unknown Project';

        const receivedRating = reviewsByContractId.get(contract.id);
        const workEntry: WorkHistoryEntry = {
          contractId: contract.id,
          projectId: contract.projectId,
          projectTitle,
          role,
          completedAt: contract.updatedAt,
        };
        if (receivedRating) {
          workEntry.rating = receivedRating.rating;
          if (receivedRating.comment) {
            workEntry.ratingComment = receivedRating.comment;
          }
        }
        return workEntry;
      })
    );

    workHistory.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    return successResult(workHistory);
  } catch (error) {
    logger.error('Failed to get work history', { error, userId });
    return errorResult('DATABASE_ERROR', 'Failed to get work history');
  }
}

/**
 * Get ratings for a specific contract
 */
export async function getContractRatings(
  contractId: string
): Promise<ServiceResult<RatingData[]>> {
  try {
    const reviews = await reviewRepository.findByContractId(contractId);

    const ratings: RatingData[] = reviews.map((r) => ({
      id: r.id,
      contractId: r.contract_id,
      raterId: r.reviewer_id,
      rateeId: r.reviewee_id,
      rating: r.rating,
      comment: r.comment || undefined,
      timestamp: Math.floor(new Date(r.created_at).getTime() / 1000),
      transactionHash: '',
    }));

    return successResult(ratings);
  } catch (error) {
    logger.error('Failed to get contract ratings', { error, contractId });
    return errorResult('DATABASE_ERROR', 'Failed to get contract ratings');
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
      return successResult({ canRate: false, reason: 'Contract not found' });
    }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'completed') {
    return successResult({ canRate: false, reason: 'Contract must be completed before rating' });
  }

  if (contract.freelancerId !== raterId && contract.employerId !== raterId) {
    return successResult({ canRate: false, reason: 'You are not a participant in this contract' });
  }

  if (contract.freelancerId !== rateeId && contract.employerId !== rateeId) {
    return successResult({ canRate: false, reason: 'Ratee is not a participant in this contract' });
  }

  if (raterId === rateeId) {
    return successResult({ canRate: false, reason: 'You cannot rate yourself' });
  }

  if (await reviewRepository.hasReviewed(contractId, raterId)) {
    return successResult({ canRate: false, reason: 'You have already rated this user for this contract' });
  }

  return successResult({ canRate: true });
  } catch (error) {
    logger.error('Failed to check if user can rate', { error, raterId, rateeId, contractId });
    return errorResult('DATABASE_ERROR', 'Failed to check rating eligibility');
  }
}

// --- Former review-service.ts functions ---

/**
 * Get review by ID
 */
export async function getReviewById(reviewId: string): Promise<ServiceResult<Review>> {
  try {
    const doc = await reviewRepository.getById(reviewId);
    if (!doc) {
      return errorResult('NOT_FOUND', 'Review not found');
    }

    return successResult(mapReviewFromEntity(doc));
  } catch (error) {
    logger.error('Failed to get review by ID', { error, reviewId });
    return errorResult('NOT_FOUND', 'Review not found');
  }
}

/**
 * Get reviews for a user (as reviewee)
 */
export async function getUserReviews(userId: string): Promise<ServiceResult<Review[]>> {
  try {
    const reviews = await reviewRepository.findAllByRevieweeId(userId);

    return successResult(reviews.map((r) => mapReviewFromEntity(r)));
  } catch (error) {
    logger.error('Failed to get user reviews', { error, userId });
    return errorResult('DATABASE_ERROR', 'Failed to fetch reviews');
  }
}

/**
 * Get reviews for a project
 */
export async function getProjectReviews(projectId: string): Promise<ServiceResult<Review[]>> {
  try {
    const reviews = await reviewRepository.findAllByProjectId(projectId);

    return successResult(reviews.map((r) => mapReviewFromEntity(r)));
  } catch (error) {
    logger.error('Failed to get project reviews', { error, projectId });
    return errorResult('DATABASE_ERROR', 'Failed to fetch reviews');
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
    // Appwrite stores missing comments as null; the API model has no null.
    comment: entity.comment as unknown as string | undefined,
    reviewerRole: entity.reviewer_role,
    workQuality: entity.work_quality as unknown as number | undefined,
    communication: entity.communication as unknown as number | undefined,
    professionalism: entity.professionalism as unknown as number | undefined,
    wouldWorkAgain: entity.would_work_again as unknown as boolean | undefined,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export function serializeReputationRecord(record: BlockchainRating): string {
  return JSON.stringify(record);
}

export function deserializeReputationRecord(serialized: string): BlockchainRating {
  return JSON.parse(serialized) as BlockchainRating;
}
