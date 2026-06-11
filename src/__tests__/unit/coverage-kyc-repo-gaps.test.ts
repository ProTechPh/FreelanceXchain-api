// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const {
  getKycVerificationById,
  updateKycVerification,
} = await import('../../repositories/didit-kyc-repository.js');

describe('DiditKycRepository - branch gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getKycVerificationById should return null when result row is empty (line 50 || null)', async () => {
    mockAppwriteResult({ data: null });
    const result = await getKycVerificationById('k1');
    expect(result).toBeNull();
  });

  it('updateKycVerification should fallback to getById when updates empty (line 103)', async () => {
    mockAppwriteResult({ data: { id: 'k1' } });
    const result = await updateKycVerification('k1', {});
    expect(result).toEqual({ id: 'k1' });
  });

  it('updateKycVerification should return null when updated row is empty (line 116 || null)', async () => {
    (globalThis as any).__mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Document not found'));
    const result = await updateKycVerification('k1', { status: 'approved' });
    expect(result).toBeNull();
  });
});
