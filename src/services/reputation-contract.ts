/**
 * Reputation Smart Contract Interface
 * Handles reputation record submission, retrieval, and aggregate score computation on blockchain
 *
 * for persistent storage instead of in-memory Maps.
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import { TransactionReceipt } from './blockchain-types.js';
import { generateId } from '../utils/id.js';
import { blockchainRatingRepository } from '../repositories/blockchain-rating-repository.js';

// Simulated blockchain rating record type (Appwrite-backed)
export type SimulatedBlockchainRating = {
  id: string;
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number; // 1-5
  comment?: string | undefined;
  timestamp: number;
  transactionHash: string;
};

// Backward-compatible alias
export type BlockchainRating = SimulatedBlockchainRating;
export type SerializedBlockchainRating = SimulatedBlockchainRating;

// Rating submission parameters
export type RatingSubmissionParams = {
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number;
  comment?: string | undefined;
};

// Reputation contract address (simulated)
const REPUTATION_CONTRACT_ADDRESS = generateWalletAddress();

function entityToRating(entity: {
  id: string;
  contract_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  comment?: string;
  timestamp: number;
  transaction_hash: string;
}): SimulatedBlockchainRating {
  return {
    id: entity.id,
    contractId: entity.contract_id,
    raterId: entity.rater_id,
    rateeId: entity.ratee_id,
    rating: entity.rating,
    comment: entity.comment ?? undefined,
    timestamp: entity.timestamp,
    transactionHash: entity.transaction_hash,
  };
}

/**
 * Submit a rating record to the blockchain
 * Called when a contract completes and users rate each other
 */
export async function submitRatingToBlockchain(
  params: RatingSubmissionParams
): Promise<{ rating: BlockchainRating; receipt: TransactionReceipt }> {
  // Validate rating value (1-5)
  if (params.rating < 1 || params.rating > 5 || !Number.isInteger(params.rating)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }

  const ratingId = generateId();
  const timestamp = Date.now();

  // Submit transaction to blockchain
  const tx = await submitTransaction({
    type: 'rating_submit',
    from: params.raterId,
    to: REPUTATION_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'submit_rating',
      ratingId,
      contractId: params.contractId,
      raterId: params.raterId,
      rateeId: params.rateeId,
      rating: params.rating,
      comment: params.comment,
    },
  });

  // Confirm the transaction
  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm rating transaction');
  }

  // Create blockchain rating record
  const blockchainRating: BlockchainRating = {
    id: ratingId,
    contractId: params.contractId,
    raterId: params.raterId,
    rateeId: params.rateeId,
    rating: params.rating,
    comment: params.comment,
    timestamp,
    transactionHash: confirmed.hash!,
  };

  // Persist to DB
  await blockchainRatingRepository.createRating({
    id: blockchainRating.id,
    contract_id: blockchainRating.contractId,
    rater_id: blockchainRating.raterId,
    ratee_id: blockchainRating.rateeId,
    rating: blockchainRating.rating,
    comment: blockchainRating.comment ?? '',
    timestamp: blockchainRating.timestamp,
    transaction_hash: blockchainRating.transactionHash,
  });

  const receipt: TransactionReceipt = {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp,
  };

  return { rating: blockchainRating, receipt };
}


/**
 * Get all ratings for a user from the blockchain
 */
export async function getRatingsFromBlockchain(userId: string): Promise<BlockchainRating[]> {
  try {
    const result = await blockchainRatingRepository.findByRatee(userId);
    return result.items.map(entityToRating);
  } catch {
    return [];
  }
}

/**
 * Get ratings given by a user from the blockchain
 */
export async function getRatingsGivenByUser(userId: string): Promise<BlockchainRating[]> {
  try {
    const result = await blockchainRatingRepository.findByRater(userId);
    return result.items.map(entityToRating);
  } catch {
    return [];
  }
}

/**
 * Get a specific rating by ID from the blockchain
 */
export async function getRatingById(ratingId: string): Promise<BlockchainRating | null> {
  const entity = await blockchainRatingRepository.getRatingById(ratingId);
  if (!entity) return null;
  return entityToRating(entity);
}

/**
 * Get ratings for a specific contract
 */
export async function getRatingsByContract(contractId: string): Promise<BlockchainRating[]> {
  try {
    // queryAll and filter since there's no dedicated findByContract method
    const all = await blockchainRatingRepository.queryAll('timestamp');
    return all
      .filter(r => r.contract_id === contractId)
      .map(entityToRating);
  } catch {
    return [];
  }
}

/**
 * Compute aggregate reputation score from blockchain ratings
 * Uses time decay weighting: more recent ratings have higher weight
 * 
 * Time decay formula: weight = e^(-lambda * age_in_days)
 * where lambda controls the decay rate (default: 0.01 = ~1% decay per day)
 */
export function computeAggregateScore(
  ratings: BlockchainRating[],
  decayLambda: number = 0.01
): number {
  if (ratings.length === 0) {
    return 0;
  }

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const rating of ratings) {
    // Calculate age in days
    const ageInMs = now - rating.timestamp;
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
    
    // Calculate time decay weight
    const weight = Math.exp(-decayLambda * ageInDays);
    
    weightedSum += rating.rating * weight;
    totalWeight += weight;
  }

  /* istanbul ignore next -- unreachable: empty ratings returns 0 at line 200; Math.exp always > 0 */
  if (totalWeight === 0) {
    return 0;
  }

  // Return weighted average rounded to 2 decimal places
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Get aggregate reputation score for a user directly from blockchain
 */
export async function getAggregateScoreFromBlockchain(
  userId: string,
  decayLambda: number = 0.01
): Promise<number> {
  const ratings = await getRatingsFromBlockchain(userId);
  return computeAggregateScore(ratings, decayLambda);
}

/**
 * Check if a user has already rated another user for a specific contract
 */
export async function hasUserRatedForContract(
  raterId: string,
  rateeId: string,
  contractId: string
): Promise<boolean> {
  const existing = await blockchainRatingRepository.findByContractAndRater(contractId, raterId);
  return existing !== null && existing.ratee_id === rateeId;
}

/**
 * Clear all ratings (for testing)
 */
export async function clearBlockchainRatings(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const all = await blockchainRatingRepository.queryAll('timestamp');
  for (const rating of all) {
    await blockchainRatingRepository.delete(rating.id);
  }
}

/**
 * Serialize a BlockchainRating to JSON-compatible format (identity function for simulated mode)
 */
export function serializeBlockchainRating(rating: BlockchainRating): BlockchainRating {
  return rating;
}

/**
 * Deserialize a JSON object back to BlockchainRating (identity function for simulated mode)
 */
export function deserializeBlockchainRating(json: BlockchainRating): BlockchainRating {
  return json;
}

/**
 * Get reputation contract address
 */
export function getReputationContractAddress(): string {
  return REPUTATION_CONTRACT_ADDRESS;
}
