// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/services/blockchain/real-adapter.ts'), () => ({
  RealBlockchainAdapter: class {},
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/simulated-adapter.ts'), () => ({
  SimulatedBlockchainAdapter: class {},
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: { mode: 'simulated' },
    appwrite: { endpoint: 'http://localhost', projectId: 'test' },
  },
}));

describe('Blockchain factory', () => {
  describe('getBlockchainMode', () => {
    it('should return simulated by default', async () => {
      const { getBlockchainMode } = await import('../../services/blockchain/factory.js');
      expect(getBlockchainMode()).toBe('simulated');
    });
  });

  describe('resetBlockchainAdapter', () => {
    it('should reset the adapter instance', async () => {
      const { resetBlockchainAdapter, getBlockchainAdapter } = await import('../../services/blockchain/factory.js');
      resetBlockchainAdapter();
      const adapter = getBlockchainAdapter();
      expect(adapter).toBeDefined();
    });
  });
});
