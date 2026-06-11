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
import { pool } from '../config/database.js';

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

// DB row type
type RatingRow = {
  id: string;
  contract_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  comment: string | null;
  timestamp: number;
  transaction_hash: string;
};

function rowToRating(row: RatingRow): SimulatedBlockchainRating {
  return {
    id: row.id,
    contractId: row.contract_id,
    raterId: row.rater_id,
    rateeId: row.ratee_id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    timestamp: row.timestamp,
    transactionHash: row.transaction_hash,
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
  await pool.query(
    `INSERT INTO blockchain_ratings 
     (id, contract_id, rater_id, ratee_id, rating, comment, timestamp, transaction_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      blockchainRating.id,
      blockchainRating.contractId,
      blockchainRating.raterId,
      blockchainRating.rateeId,
      blockchainRating.rating,
      blockchainRating.comment ?? null,
      blockchainRating.timestamp,
      blockchainRating.transactionHash
    ]
  );

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
    const result = await pool.query(
      'SELECT * FROM blockchain_ratings WHERE ratee_id = $1 ORDER BY timestamp DESC',
      [userId]
    );

    return result.rows.map(rowToRating);
  } catch {
    return [];
  }
}

/**
 * Get ratings given by a user from the blockchain
 */
export async function getRatingsGivenByUser(userId: string): Promise<BlockchainRating[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM blockchain_ratings WHERE rater_id = $1 ORDER BY timestamp DESC',
      [userId]
    );

    return result.rows.map(rowToRating);
  } catch {
    return [];
  }
}

/**
 * Get a specific rating by ID from the blockchain
 */
export async function getRatingById(ratingId: string): Promise<BlockchainRating | null> {
  const result = await pool.query(
    'SELECT * FROM blockchain_ratings WHERE id = $1',
    [ratingId]
  );

  if (result.rows.length === 0) return null;
  return rowToRating(result.rows[0] as RatingRow);
}

/**
 * Get ratings for a specific contract
 */
export async function getRatingsByContract(contractId: string): Promise<BlockchainRating[]> {
  try {
    const result = await pool.query(
      'SELECT * FROM blockchain_ratings WHERE contract_id = $1 ORDER BY timestamp DESC',
      [contractId]
    );

    return result.rows.map(rowToRating);
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

  if (totalWeight === 0) {
    /* istanbul ignore next */
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
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM blockchain_ratings WHERE rater_id = $1 AND ratee_id = $2 AND contract_id = $3',
    [raterId, rateeId, contractId]
  );

  return parseInt(result.rows[0].count) > 0;
}

/**
 * Clear all ratings (for testing)
 */
export async function clearBlockchainRatings(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  await pool.query('DELETE FROM blockchain_ratings');
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
