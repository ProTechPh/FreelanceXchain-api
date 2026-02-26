/**
 * Reputation Service
 * Handles rating submission, reputation score computation, and work history retrieval
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7
 */

import {
  submitRatingToBlockchain,
  getRatingsFromBlockchain,
  computeAggregateScore,
  hasUserRatedForContract,
  getRatingsByContract,
  BlockchainRating,
  serializeBlockchainRating,
  deserializeBlockchainRating,
  SerializedBlockchainRating,
} from './reputation-contract.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { mapContractFromEntity } from '../utils/entity-mapper.js';
import { notifyRatingReceived } from './notification-service.js';

// Rating input type
export type RatingInput = {
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number;
  comment?: string | undefined;
};

// Reputation score result
export type ReputationScore = {
  userId: string;
  score: number;
  totalRatings: number;
  averageRating: number;
  ratings: BlockchainRating[];
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
  rating: BlockchainRating;
  transactionHash: string;
};

/**
 * Submit a rating for a completed contract
 * Validates rating value (1-5) and checks for duplicate ratings
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

  // Check for duplicate rating
  const alreadyRated = await hasUserRatedForContract(
    input.raterId,
    input.rateeId,
    input.contractId
  );
  if (alreadyRated) {
    return {
      success: false,
      error: {
        code: 'DUPLICATE_RATING',
        message: 'You have already rated this user for this contract',
      },
    };
  }

  // Submit rating to blockchain
  const { rating, receipt } = await submitRatingToBlockchain({
    contractId: input.contractId,
    raterId: input.raterId,
    rateeId: input.rateeId,
    rating: input.rating,
    comment: input.comment,
  });

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
      rating,
      transactionHash: receipt.transactionHash,
    },
  };
}


/**
 * Get reputation score for a user
 * Computes weighted average using time decay
 * Requirements: 7.3, 7.5
 */
export async function getReputation(
  userId: string,
  decayLambda: number = 0.01
): Promise<ReputationServiceResult<ReputationScore>> {
  // Get all ratings for the user from blockchain
  const ratings = await getRatingsFromBlockchain(userId);

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
 * Get work history for a user
 * Returns completed contracts with ratings
 * Requirements: 7.3
 */
export async function getWorkHistory(
  userId: string
): Promise<ReputationServiceResult<WorkHistoryEntry[]>> {
  // Get all contracts for the user
  const contractsResult = await contractRepository.getUserContracts(userId);
  const contractEntities = contractsResult.items;

  // Filter to completed contracts only
  const completedContracts = contractEntities.filter(c => c.status === 'completed');

  const workHistory: WorkHistoryEntry[] = [];

  for (const contractEntity of completedContracts) {
    const contract = mapContractFromEntity(contractEntity);
    
    // Determine user's role in the contract
    const role: 'freelancer' | 'employer' = 
      contract.freelancerId === userId ? 'freelancer' : 'employer';

    // Get project details
    const projectEntity = await projectRepository.getProjectById(contract.projectId);
    const projectTitle = projectEntity?.title ?? 'Unknown Project';

    // Get ratings for this contract
    const contractRatings = await getRatingsByContract(contract.id);
    
    // Find rating received by this user for this contract
    const receivedRating = contractRatings.find(r => r.rateeId === userId);

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
 * Serialize a reputation record to JSON format
 * Requirements: 7.6
 */
export function serializeReputationRecord(rating: BlockchainRating): string {
  return JSON.stringify(serializeBlockchainRating(rating));
}

/**
 * Deserialize a JSON string to reputation record
 * Requirements: 7.7
 */
export function deserializeReputationRecord(json: string): BlockchainRating {
  const parsed: SerializedBlockchainRating = JSON.parse(json);
  return deserializeBlockchainRating(parsed);
}

/**
 * Get ratings for a specific contract
 */
export async function getContractRatings(
  contractId: string
): Promise<ReputationServiceResult<BlockchainRating[]>> {
  const ratings = await getRatingsByContract(contractId);
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
  // Verify contract exists
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: true,
      data: { canRate: false, reason: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

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

  // Check for duplicate rating
  const alreadyRated = await hasUserRatedForContract(raterId, rateeId, contractId);
  if (alreadyRated) {
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
