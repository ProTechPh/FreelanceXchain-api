/**
 * Blockchain Integration Services
 * Central export point for all blockchain-related functionality
 * 
 * RECOMMENDED: Use the blockchain adapter for new code
 * The adapter provides a unified interface that works with both real and simulated blockchain
 */

// Blockchain Adapter (RECOMMENDED for new code)
export * from './blockchain/index.js';

// Web3 Client (Primary blockchain interface)
export * from './web3-client.js';

// Contract ABIs
export * from './contract-abis.js';

// Contract Configuration
export * from '../config/contracts.js';

// Blockchain Integration Services (specific implementations)
export * from './reputation-blockchain.js';
export {
  deployEscrowContract,
  getEscrowInfo,
  submitMilestone,
  approveMilestone,
  disputeMilestone,
  resolveDispute,
  refundMilestone,
  cancelContract,
  getMilestone,
  getMilestoneCount,
  getAllMilestones,
  getEscrowBalance,
  getRemainingAmount,
} from './escrow-blockchain.js';
export * from './agreement-blockchain.js';

// Deployment Utilities
export * from './contract-deployment.js';

// Legacy blockchain client (for backward compatibility - simulation mode)
// Note: Use blockchain adapter for new code
export {
  submitTransaction,
  getTransaction,
  pollTransactionStatus,
  confirmTransaction,
  failTransaction,
  clearTransactions,
  getBlockchainConfig,
  isBlockchainAvailable,
  serializeTransaction,
  deserializeTransaction,
  serializePaymentTransaction,
  deserializePaymentTransaction,
  generateWalletAddress,
  signTransaction,
} from './blockchain-client.js';
