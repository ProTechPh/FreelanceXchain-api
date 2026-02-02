/**
 * Blockchain Integration Services
 * Central export point for all blockchain-related functionality
 */

// Web3 Client (Primary blockchain interface)
export * from './web3-client.js';

// Contract ABIs
export * from './contract-abis.js';

// Contract Configuration
export * from '../config/contracts.js';

// Blockchain Integration Services
export * from './reputation-blockchain.js';
export * from './escrow-blockchain.js';
export * from './agreement-blockchain.js';

// Deployment Utilities
export * from './contract-deployment.js';

// Legacy blockchain client (for backward compatibility - simulation mode)
// Note: Use web3-client for real blockchain interactions
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
