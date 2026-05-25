// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/services/blockchain/real-adapter.ts'), () => ({
  RealBlockchainAdapter: class { isReal = true },
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/simulated-adapter.ts'), () => ({
  SimulatedBlockchainAdapter: class { isSimulated = true },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: { mode: 'real' },
  },
}));

describe('Blockchain factory - real mode', () => {
  it('should return real mode from getBlockchainMode (line 21)', async () => {
    const { getBlockchainMode } = await import('../../services/blockchain/factory.js');
    expect(getBlockchainMode()).toBe('real');
  });

  it('should create RealBlockchainAdapter (line 34)', async () => {
    const { createBlockchainAdapter } = await import('../../services/blockchain/factory.js');
    const adapter = createBlockchainAdapter();
    expect(adapter.isReal).toBe(true);
  });

  it('getBlockchainAdapter should return adapter instance', async () => {
    const { getBlockchainAdapter, resetBlockchainAdapter } = await import('../../services/blockchain/factory.js');
    resetBlockchainAdapter();
    const adapter = getBlockchainAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.isReal).toBe(true);
  });
});
