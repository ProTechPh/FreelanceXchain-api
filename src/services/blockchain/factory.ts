/**
 * Blockchain Adapter Factory
 * Creates the appropriate blockchain adapter based on configuration
 */

import { IBlockchainAdapter } from './adapter.js';
import { RealBlockchainAdapter } from './real-adapter.js';
import { SimulatedBlockchainAdapter } from './simulated-adapter.js';
import { config } from '../../config/env.js';

export type BlockchainMode = 'real' | 'simulated';

/**
 * Get the configured blockchain mode from environment
 * Defaults to 'simulated' for safety
 */
export function getBlockchainMode(): BlockchainMode {
  const mode = config.blockchain.mode?.toLowerCase();
  
  if (mode === 'real') {
    return 'real';
  }
  
  return 'simulated';
}

/**
 * Create a blockchain adapter instance based on configuration
 */
export function createBlockchainAdapter(): IBlockchainAdapter {
  const mode = getBlockchainMode();
  
  if (mode === 'real') {
    return new RealBlockchainAdapter();
  }
  
  return new SimulatedBlockchainAdapter();
}

// Singleton instance
let adapterInstance: IBlockchainAdapter | null = null;

/**
 * Get the singleton blockchain adapter instance
 * Creates it on first call, reuses it on subsequent calls
 */
export function getBlockchainAdapter(): IBlockchainAdapter {
  if (!adapterInstance) {
    adapterInstance = createBlockchainAdapter();
  }
  
  return adapterInstance;
}

/**
 * Reset the adapter instance (useful for testing)
 */
export function resetBlockchainAdapter(): void {
  adapterInstance = null;
}
