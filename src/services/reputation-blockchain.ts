/**
 * Reputation Blockchain Integration
 * Real blockchain integration for reputation system using deployed smart contracts
 */

import { Contract, TransactionReceipt } from 'ethers';
import { getContractWithSigner, getContract, isWeb3Available } from './web3-client.js';
import { getContractAddress } from '../config/contracts.js';
import { FreelanceReputationABI } from './contract-abis.js';

export type BlockchainRating = {
  rater: string;
  ratee: string;
  score: number;
  comment: string;
  contractId: string;
  timestamp: number;
  isEmployerRating: boolean;
};

export type RatingSubmissionParams = {
  contractId: string;
  rateeAddress: string;
  rating: number;
  comment: string;
  isEmployerRating: boolean;
};

/**
 * Get Reputation contract instance for reading
 */
function getReputationContract(): Contract {
  const address = getContractAddress('reputation');
  if (!address) {
    throw new Error('Reputation contract not deployed. Please deploy contracts first.');
  }
  return getContract(address, FreelanceReputationABI);
}

/**
 * Get Reputation contract instance for writing
 */
function getReputationContractWithSigner(): Contract {
  const address = getContractAddress('reputation');
  if (!address) {
    throw new Error('Reputation contract not deployed. Please deploy contracts first.');
  }
  return getContractWithSigner(address, FreelanceReputationABI);
}

/**
 * Submit a rating to the blockchain
 */
export async function submitRatingToBlockchain(
  params: RatingSubmissionParams
): Promise<{ ratingIndex: bigint; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured. Please set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY');
  }

  // Validate rating
  if (params.rating < 1 || params.rating > 5 || !Number.isInteger(params.rating)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }

  const contract = getReputationContractWithSigner();

  // Submit rating transaction
  const tx = await (contract as any).submitRating(
    params.rateeAddress,
    params.rating,
    params.comment,
    params.contractId,
    params.isEmployerRating
  );

  // Wait for transaction confirmation
  const receipt = await tx.wait();

  // Extract rating index from event
  const event = receipt.logs.find((log: any) => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed?.name === 'RatingSubmitted';
    } catch {
      return false;
    }
  });

  let ratingIndex = BigInt(0);
  if (event) {
    const parsed = contract.interface.parseLog(event);
    ratingIndex = parsed?.args[0] || BigInt(0);
  }

  return {
    ratingIndex,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Get all ratings for a user from blockchain
 */
export async function getRatingsFromBlockchain(userAddress: string): Promise<BlockchainRating[]> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();

  // Get rating indices for user
  const indices = await (contract as any).getUserRatingIndices(userAddress);

  // Fetch all ratings
  const ratings: BlockchainRating[] = [];
  for (const index of indices) {
    const rating = await (contract as any).getRating(index);
    ratings.push({
      rater: rating[0],
      ratee: rating[1],
      score: Number(rating[2]),
      comment: rating[3],
      contractId: rating[4],
      timestamp: Number(rating[5]),
      isEmployerRating: rating[6],
    });
  }

  return ratings;
}

/**
 * Get ratings given by a user
 */
export async function getRatingsGivenByUser(userAddress: string): Promise<BlockchainRating[]> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();

  // Get rating indices given by user
  const indices = await (contract as any).getGivenRatingIndices(userAddress);

  // Fetch all ratings
  const ratings: BlockchainRating[] = [];
  for (const index of indices) {
    const rating = await (contract as any).getRating(index);
    ratings.push({
      rater: rating[0],
      ratee: rating[1],
      score: Number(rating[2]),
      comment: rating[3],
      contractId: rating[4],
      timestamp: Number(rating[5]),
      isEmployerRating: rating[6],
    });
  }

  return ratings;
}

/**
 * Get average rating for a user (returns value * 100 for precision)
 */
export async function getAverageRating(userAddress: string): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  const avgRating = await (contract as any).getAverageRating(userAddress);
  
  // Convert from (rating * 100) to actual rating
  return Number(avgRating) / 100;
}

/**
 * Get rating count for a user
 */
export async function getRatingCount(userAddress: string): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  const count = await (contract as any).getRatingCount(userAddress);
  return Number(count);
}

/**
 * Check if a user has already rated another user for a specific contract
 */
export async function hasUserRatedForContract(
  raterAddress: string,
  rateeAddress: string,
  contractId: string
): Promise<boolean> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  return await (contract as any).hasRated(raterAddress, rateeAddress, contractId);
}

/**
 * Get total number of ratings in the system
 */
export async function getTotalRatings(): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  const total = await (contract as any).getTotalRatings();
  return Number(total);
}

/**
 * Get reputation contract address
 */
export function getReputationContractAddress(): string {
  const address = getContractAddress('reputation');
  if (!address) {
    throw new Error('Reputation contract not deployed');
  }
  return address;
}
