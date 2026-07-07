/**
 * @deprecated Import from './simulated-transaction-client.js' instead.
 * This file re-exports everything for backward compatibility.
 */
export {
  serializeTransaction,
  deserializeTransaction,
  serializePaymentTransaction,
  deserializePaymentTransaction,
  generateWalletAddress,
  submitTransaction,
  getTransaction,
  getTransactionByHash,
  pollTransactionStatus,
  confirmTransaction,
  failTransaction,
  clearTransactions,
  getBlockchainConfig,
  isBlockchainAvailable,
} from './simulated-transaction-client.js';
