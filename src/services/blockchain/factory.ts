import { IBlockchainAdapter } from './adapter.js';
import { RealBlockchainAdapter } from './real-adapter.js';
import { SimulatedBlockchainAdapter } from './simulated-adapter.js';
import { config } from '../../config/env.js';

export type BlockchainMode = 'real' | 'simulated';

export function getBlockchainMode(): BlockchainMode {
  const mode = config.blockchain.mode?.toLowerCase();

  if (mode === 'real') {
    return 'real';
  }

  return 'simulated';
}

export function createBlockchainAdapter(): IBlockchainAdapter {
  const mode = getBlockchainMode();

  if (mode === 'real') {
    return new RealBlockchainAdapter();
  }

  return new SimulatedBlockchainAdapter();
}

let adapterInstance: IBlockchainAdapter | null = null;

export function getBlockchainAdapter(): IBlockchainAdapter {
  if (!adapterInstance) {
    adapterInstance = createBlockchainAdapter();
  }

  return adapterInstance;
}

export function resetBlockchainAdapter(): void {
  adapterInstance = null;
}
