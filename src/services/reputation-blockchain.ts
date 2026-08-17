/**
 * Reputation Blockchain Integration
 * Real blockchain integration for reputation system using deployed smart contracts
 */

import type { Contract, ContractTransactionResponse, TransactionReceipt } from 'ethers';
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
};

/**
 * Get Reputation contract instance for reading
 */
function getReputationContract(): ReputationContract {
  const address = getContractAddress('reputation');
  if (!address) {
    throw new Error('Reputation contract not deployed. Please deploy contracts first.');
  }
  return getContract(address, FreelanceReputationABI) as ReputationContract;
}

/**
 * Get Reputation contract instance for writing
 */
function getReputationContractWithSigner(): ReputationContract {
  const address = getContractAddress('reputation');
  if (!address) {
    throw new Error('Reputation contract not deployed. Please deploy contracts first.');
  }
  return getContractWithSigner(address, FreelanceReputationABI) as ReputationContract;
}

/**
 * Typed view of the FreelanceReputation ABI surface used by this module.
 * ethers.Contract is intentionally untyped for arbitrary ABIs, so we declare
 * the exact methods we call here instead of casting to `any` at each call site.
 *
 * submitRating takes 4 arguments: the deployed contract derives the
 * isEmployerRating flag on-chain from msg.sender (see FreelanceReputation.sol).
 */
type ReputationContract = Contract & {
  submitRating(
    ratee: string,
    score: number,
    comment: string,
    contractId: string
  ): Promise<ContractTransactionResponse>;
  getUserRatingIndices(user: string, offset: number, limit: number): Promise<bigint[]>;
  getGivenRatingIndices(user: string, offset: number, limit: number): Promise<bigint[]>;
  getRating(index: bigint): Promise<[string, string, bigint, string, string, bigint, boolean]>;
  getAverageRating(user: string): Promise<bigint>;
  getRatingCount(user: string): Promise<bigint>;
  hasRated(rater: string, ratee: string, contractId: string): Promise<boolean>;
  getTotalRatings(): Promise<bigint>;
};

/**
 * Map raw on-chain rating tuples to BlockchainRating records.
 */
async function fetchRatings(contract: ReputationContract, indices: bigint[]): Promise<BlockchainRating[]> {
  const rawRatings = await Promise.all(
    indices.map(index => contract.getRating(index))
  );
  return rawRatings.map((rating): BlockchainRating => ({
    rater: rating[0],
    ratee: rating[1],
    score: Number(rating[2]),
    comment: rating[3],
    contractId: rating[4],
    timestamp: Number(rating[5]),
    isEmployerRating: rating[6],
  }));
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

  if (params.rating < 1 || params.rating > 5 || !Number.isInteger(params.rating)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }

  if (!params.rateeAddress || params.rateeAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('Invalid ratee address');
  }

  const contract = getReputationContractWithSigner();

  // Contract signature: submitRating(address ratee, uint8 score, string comment, bytes32 contractIdHash)
  // isEmployerRating is derived on-chain from msg.sender and must not be passed.
  const tx = await contract.submitRating(
    params.rateeAddress,
    params.rating,
    params.comment || '',
    params.contractId
  );

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error('Transaction was replaced or dropped');
  }

  const event = receipt.logs.find(log => {
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
    ratingIndex = parsed ? BigInt(parsed.args[0] ?? 0) : BigInt(0);
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

  // Get rating indices for user (with pagination - contract requires offset and limit)
  const indices = await contract.getUserRatingIndices(userAddress, 0, 100);

  return fetchRatings(contract, indices);
}

/**
 * Get ratings given by a user
 */
export async function getRatingsGivenByUser(userAddress: string): Promise<BlockchainRating[]> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();

  // Get rating indices given by user (with pagination - contract requires offset and limit)
  const indices = await contract.getGivenRatingIndices(userAddress, 0, 100);

  return fetchRatings(contract, indices);
}

/**
 * Get average rating for a user (returns value * 100 for precision)
 */
export async function getAverageRating(userAddress: string): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  const avgRating = await contract.getAverageRating(userAddress);
  
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
  const count = await contract.getRatingCount(userAddress);
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
  return contract.hasRated(raterAddress, rateeAddress, contractId);
}

/**
 * Get total number of ratings in the system
 */
export async function getTotalRatings(): Promise<number> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contract = getReputationContract();
  const total = await contract.getTotalRatings();
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
