/**
 * Reputation Smart Contract Interface
 * Handles reputation record submission, retrieval, and aggregate score computation on blockchain
 * Requirements: 7.1, 7.2, 7.3
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import { TransactionReceipt } from './blockchain-types.js';
import { generateId } from '../utils/id.js';

// Blockchain rating record type
export type BlockchainRating = {
  id: string;
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number; // 1-5
  comment?: string | undefined;
  timestamp: number;
  transactionHash: string;
};

// Serialized blockchain rating for JSON encoding
export type SerializedBlockchainRating = {
  id: string;
  contractId: string;
  raterId: string;
  rateeId: string;
  rating: number;
  comment?: string | undefined;
  timestamp: number;
  transactionHash: string;
};

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

// In-memory blockchain rating store (simulates blockchain storage)
const blockchainRatingStore = new Map<string, BlockchainRating>();


/**
 * Serialize a BlockchainRating to JSON-compatible format
 */
export function serializeBlockchainRating(rating: BlockchainRating): SerializedBlockchainRating {
  return {
    id: rating.id,
    contractId: rating.contractId,
    raterId: rating.raterId,
    rateeId: rating.rateeId,
    rating: rating.rating,
    comment: rating.comment,
    timestamp: rating.timestamp,
    transactionHash: rating.transactionHash,
  };
}

/**
 * Deserialize a JSON object back to BlockchainRating
 */
export function deserializeBlockchainRating(json: SerializedBlockchainRating): BlockchainRating {
  return {
    id: json.id,
    contractId: json.contractId,
    raterId: json.raterId,
    rateeId: json.rateeId,
    rating: json.rating,
    comment: json.comment,
    timestamp: json.timestamp,
    transactionHash: json.transactionHash,
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
    type: 'escrow_deploy', // Using existing type for simulation
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

  // Store in blockchain (simulated)
  blockchainRatingStore.set(ratingId, blockchainRating);

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
  const ratings: BlockchainRating[] = [];
  
  for (const rating of blockchainRatingStore.values()) {
    if (rating.rateeId === userId) {
      ratings.push(rating);
    }
  }

  // Sort by timestamp descending (newest first)
  return ratings.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get ratings given by a user from the blockchain
 */
export async function getRatingsGivenByUser(userId: string): Promise<BlockchainRating[]> {
  const ratings: BlockchainRating[] = [];
  
  for (const rating of blockchainRatingStore.values()) {
    if (rating.raterId === userId) {
      ratings.push(rating);
    }
  }

  return ratings.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get a specific rating by ID from the blockchain
 */
export async function getRatingById(ratingId: string): Promise<BlockchainRating | null> {
  return blockchainRatingStore.get(ratingId) ?? null;
}

/**
 * Get ratings for a specific contract
 */
export async function getRatingsByContract(contractId: string): Promise<BlockchainRating[]> {
  const ratings: BlockchainRating[] = [];
  
  for (const rating of blockchainRatingStore.values()) {
    if (rating.contractId === contractId) {
      ratings.push(rating);
    }
  }

  return ratings.sort((a, b) => b.timestamp - a.timestamp);
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
  for (const rating of blockchainRatingStore.values()) {
    if (
      rating.raterId === raterId &&
      rating.rateeId === rateeId &&
      rating.contractId === contractId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Clear all ratings (for testing)
 */
export function clearBlockchainRatings(): void {
  blockchainRatingStore.clear();
}

/**
 * Get reputation contract address
 */
export function getReputationContractAddress(): string {
  return REPUTATION_CONTRACT_ADDRESS;
}
