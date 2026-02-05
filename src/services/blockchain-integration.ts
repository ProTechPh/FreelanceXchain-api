/**
 * Blockchain Integration Services
 * Central export point for all blockchain-related functionality
 */

// Web3 Client (Primary blockchain interface)
export * from './web3-client';

// Contract ABIs
export * from './contract-abis';

// Contract Configuration
export * from '../config/contracts';

// Blockchain Integration Services
export * from './reputation-blockchain';
export * from './escrow-blockchain';
export * from './agreement-blockchain';

// Deployment Utilities
export * from './contract-deployment';

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
} from './blockchain-client';
