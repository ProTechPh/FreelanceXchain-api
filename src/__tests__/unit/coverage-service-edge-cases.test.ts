// @ts-nocheck
/**
 * Coverage for service-level catch blocks with non-Error objects.
 * Targets: escrow-refund-service, favorite-service, dispute-evidence-service,
 * reputation-aggregation-service.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    appwrite: { endpoint: 'http://localhost', projectId: 'test' },
    llm: { apiKey: 'test-key', apiUrl: 'https://api.test.com', model: 'gpt-4' },
    jwtSecret: 'test-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    isProduction: false,
  },
  getConfig: () => ({}),
}));

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: jest.fn<any>(),
    updateContract: jest.fn<any>(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: jest.fn<any>(),
  },
}));

describe('Service catch blocks - non-Error thrown objects', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
  });

  it('escrow-refund-service createRefundRequest - non-Error catch (line 114)', async () => {
    mockDatabases.listDocuments.mockRejectedValue('string error');
    mockPool.query.mockRejectedValue('string error');
    const { createRefundRequest } = await import('../../services/escrow-refund-service.js');
    const result = await createRefundRequest({
      contractId: 'c-1', requestedBy: 'user-1', reason: 'test',
      freelancerId: 'f-1', employerId: 'e-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe('Failed to create refund request');
  });

  it('escrow-refund-service rejectRefund - otherPartyId ternary (line 296)', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{
        id: 'ref-1', freelancer_id: 'f-1', employer_id: 'e-1',
        requested_by: 'f-1', contract_id: 'c-1', status: 'pending', reason: 'test',
      }],
    });
    const { rejectRefund } = await import('../../services/escrow-refund-service.js');
    const result = await rejectRefund('ref-1', { rejectedBy: 'f-1', rejectionReason: 'No' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('favorite-service getUserFavorites - target not in map (line 152)', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const { getUserFavorites } = await import('../../services/favorite-service.js');
    const result = await getUserFavorites('user-1');
    expect(result.success).toBe(true);
  });

  it('dispute-evidence-service submitEvidence - non-Error catch', async () => {
    const mockContractRepo = (await import('../../repositories/contract-repository.js')).contractRepository;
    mockContractRepo.getContractById.mockRejectedValue('string error');
    const { submitEvidence } = await import('../../services/dispute-evidence-service.js');
    const result = await submitEvidence({
      disputeId: 'd-1', submittedBy: 'u-1', content: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('reputation-aggregation getAggregatedScore - non-Error catch (line 125)', async () => {
    mockDatabases.listDocuments.mockRejectedValue('string error');
    const { getAggregatedScore } = await import('../../services/reputation-aggregation-service.js');
    const result = await getAggregatedScore('u-1');
    expect(result.success).toBe(false);
  });

  it('reputation-aggregation getReputationBreakdown - non-Error catch (line 186)', async () => {
    mockDatabases.listDocuments.mockRejectedValue('not-an-error-object');
    const { getReputationBreakdown } = await import('../../services/reputation-aggregation-service.js');
    const result = await getReputationBreakdown('u-1');
    expect(result.success).toBe(false);
  });

  it('reputation-aggregation getReputationHistory - non-Error catch (line 241)', async () => {
    mockDatabases.listDocuments.mockRejectedValue(42);
    const { getReputationHistory } = await import('../../services/reputation-aggregation-service.js');
    const result = await getReputationHistory('u-1');
    expect(result.success).toBe(false);
  });

  it('reputation-aggregation getReputationLeaderboard - non-Error catch (line 308)', async () => {
    mockDatabases.listDocuments.mockRejectedValue(null);
    const { getReputationLeaderboard } = await import('../../services/reputation-aggregation-service.js');
    const result = await getReputationLeaderboard();
    expect(result.success).toBe(false);
  });
});
