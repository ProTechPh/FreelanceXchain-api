import { IBlockchainAdapter } from './adapter.js';
import { RealBlockchainAdapter } from './real-adapter.js';
import { SimulatedBlockchainAdapter } from './simulated-adapter.js';
import { config } from '../../config/env.js';

type BlockchainMode = 'real' | 'simulated';

/**
 * Resolve the active blockchain mode.
 *
 * 'real' connects to an actual EVM network (dev → Ganache, prod → Polygon
 * Amoy). 'simulated' emulates the ledger in Appwrite and is used by the test
 * suite (jest mocks this factory to 'simulated') plus as a no-config fallback
 * when BLOCKCHAIN_MODE is unset. The `dev` and `prod` npm scripts set
 * BLOCKCHAIN_MODE=real explicitly, so a normally-run server uses real
 * blockchain — 'simulated' is NOT the production path.
 */
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
