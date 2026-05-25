// @ts-nocheck
/**
 * contracts.ts coverage - lines 44-49 (POLYGON), 61-63 (MAINNET env vars)
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const originalEnv = { ...process.env };

describe('Contracts Config - POLYGON/AMOY/MAINNET env vars (lines 44-63)', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load POLYGON contract addresses from env vars (lines 44-49)', async () => {
    process.env.POLYGON_REPUTATION_ADDRESS = '0xPolyRep';
    process.env.POLYGON_ESCROW_ADDRESS = '0xPolyEscrow';
    process.env.POLYGON_AGREEMENT_ADDRESS = '0xPolyAgreement';
    process.env.POLYGON_DISPUTE_ADDRESS = '0xPolyDispute';
    process.env.POLYGON_MILESTONE_ADDRESS = '0xPolyMilestone';

    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { blockchain: { rpcUrl: 'https://polygon-mainnet.infura.io/v3/test' } },
    }));
    const { getContractAddress } = await import('../../config/contracts.js');
    expect(getContractAddress('reputation')).toBe('0xPolyRep');
    expect(getContractAddress('escrow')).toBe('0xPolyEscrow');
    expect(getContractAddress('agreement')).toBe('0xPolyAgreement');
    expect(getContractAddress('disputeResolution')).toBe('0xPolyDispute');
    expect(getContractAddress('milestoneRegistry')).toBe('0xPolyMilestone');
  });

  it('should load AMOY contract addresses from env vars', async () => {
    process.env.AMOY_REPUTATION_ADDRESS = '0xAmoyRep';
    process.env.AMOY_ESCROW_ADDRESS = '0xAmoyEscrow';
    process.env.AMOY_AGREEMENT_ADDRESS = '0xAmoyAgreement';
    process.env.AMOY_DISPUTE_ADDRESS = '0xAmoyDispute';
    process.env.AMOY_MILESTONE_ADDRESS = '0xAmoyMilestone';

    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { blockchain: { rpcUrl: 'https://polygon-amoy.infura.io/v3/test' } },
    }));
    const { getContractAddress } = await import('../../config/contracts.js');
    expect(getContractAddress('reputation')).toBe('0xAmoyRep');
    expect(getContractAddress('escrow')).toBe('0xAmoyEscrow');
    expect(getContractAddress('agreement')).toBe('0xAmoyAgreement');
    expect(getContractAddress('disputeResolution')).toBe('0xAmoyDispute');
    expect(getContractAddress('milestoneRegistry')).toBe('0xAmoyMilestone');
  });

  it('should load MAINNET contract addresses from env vars (lines 61-63)', async () => {
    process.env.MAINNET_REPUTATION_ADDRESS = '0xMainRep';
    process.env.MAINNET_ESCROW_ADDRESS = '0xMainEscrow';
    process.env.MAINNET_AGREEMENT_ADDRESS = '0xMainAgreement';
    process.env.MAINNET_DISPUTE_ADDRESS = '0xMainDispute';
    process.env.MAINNET_MILESTONE_ADDRESS = '0xMainMilestone';

    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { blockchain: { rpcUrl: 'https://mainnet.infura.io/v3/test' } },
    }));
    const { getContractAddress } = await import('../../config/contracts.js');
    expect(getContractAddress('reputation')).toBe('0xMainRep');
    expect(getContractAddress('escrow')).toBe('0xMainEscrow');
    expect(getContractAddress('agreement')).toBe('0xMainAgreement');
    expect(getContractAddress('disputeResolution')).toBe('0xMainDispute');
    expect(getContractAddress('milestoneRegistry')).toBe('0xMainMilestone');
  });
});
