// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockLogger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
const mockNotifyRatingReceived = jest.fn().mockResolvedValue({ success: true });
const mockGetContractById = jest.fn();
const mockGetUserContracts = jest.fn();
const mockGetProjectById = jest.fn();
const mockSubmitRatingToBlockchain = jest.fn().mockResolvedValue({ transactionHash: '0xabc' });

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyRatingReceived: mockNotifyRatingReceived,
}));
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  default: { sendToUser: jest.fn() },
  initializeSSE: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: mockGetContractById,
    getUserContracts: mockGetUserContracts,
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { findProjectById: mockGetProjectById, getProjectById: mockGetProjectById },
}));
jest.unstable_mockModule(resolveModule('src/services/reputation-blockchain.ts'), () => ({
  submitRatingToBlockchain: mockSubmitRatingToBlockchain,
}));

const {
  submitRating,
  getReputation,
  getWorkHistory,
  canUserRate,
} = await import('../../services/reputation-service.js');

function makeContractEntity(overrides = {}) {
  return {
    id: 'c-1',
    project_id: 'proj-1',
    proposal_id: 'prop-1',
    employer_id: 'emp-1',
    freelancer_id: 'fl-1',
    escrow_address: '0x' + 'e'.repeat(40),
    base_amount: 1000,
    rush_fee: 0,
    total_amount: 1000,
    status: 'completed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Reputation Service - Extended Coverage (submitRating validation)', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockNotifyRatingReceived.mockResolvedValue({ success: true });
    mockSubmitRatingToBlockchain.mockResolvedValue({ transactionHash: '0xabc' });
  });

  describe('submitRating', () => {
    it('should succeed with valid rating', async () => {
      const contract = makeContractEntity();
      mockGetContractById.mockResolvedValueOnce(contract);
      // Check for existing review - none
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Insert review
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', contract_id: 'c-1', reviewer_id: 'emp-1', reviewee_id: 'fl-1', rating: 4, created_at: new Date().toISOString() }],
        rowCount: 1,
      });
      // Get users for blockchain sync
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'fl-1', wallet_address: null }], rowCount: 1 });
      // Get project for notification
      mockGetProjectById.mockResolvedValueOnce({ id: 'proj-1', title: 'Test Project' });

      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 4,
        comment: 'Good work',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rating.rating).toBe(4);
      }
    });

    it('should return NOT_FOUND when contract does not exist', async () => {
      mockGetContractById.mockResolvedValueOnce(null);

      const result = await submitRating({
        contractId: 'nonexistent',
        raterId: 'emp-1',
        rating: 4,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when rater is not a contract party', async () => {
      const contract = makeContractEntity();
      mockGetContractById.mockResolvedValueOnce(contract);

      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'unrelated-user',
        rating: 4,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return DUPLICATE_RATING when already rated', async () => {
      const contract = makeContractEntity();
      mockGetContractById.mockResolvedValueOnce(contract);
      // Existing review found
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-review' }], rowCount: 1 });

      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 5,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_RATING');
    });

    it('should return INVALID_RATING for rating below 1', async () => {
      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_RATING');
    });

    it('should return INVALID_RATING for rating above 5', async () => {
      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 6,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_RATING');
    });

    it('should return INVALID_RATING for non-integer rating', async () => {
      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 3.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_RATING');
    });

    it('should return INVALID_CONTRACT_STATUS when contract is not completed', async () => {
      const contract = makeContractEntity({ status: 'active' });
      mockGetContractById.mockResolvedValueOnce(contract);

      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 4,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_CONTRACT_STATUS');
    });

    it('should handle optional fields (workQuality, communication, professionalism)', async () => {
      const contract = makeContractEntity();
      mockGetContractById.mockResolvedValueOnce(contract);
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'rev-2', contract_id: 'c-1', reviewer_id: 'emp-1', reviewee_id: 'fl-1', rating: 5, created_at: new Date().toISOString() }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'fl-1', wallet_address: null }], rowCount: 1 });
      mockGetProjectById.mockResolvedValueOnce({ id: 'proj-1', title: 'Test' });

      const result = await submitRating({
        contractId: 'c-1',
        raterId: 'emp-1',
        rating: 5,
        workQuality: 5,
        communication: 4,
        professionalism: 5,
        wouldWorkAgain: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getReputation', () => {
    it('should return reputation score for user with reviews', async () => {
      const rows = [
        { id: 'r1', contract_id: 'c-1', reviewer_id: 'emp-1', reviewee_id: 'fl-1', rating: 5, comment: 'Great', created_at: new Date().toISOString() },
        { id: 'r2', contract_id: 'c-2', reviewer_id: 'emp-2', reviewee_id: 'fl-1', rating: 4, comment: null, created_at: new Date(Date.now() - 86400000).toISOString() },
      ];
      mockPool.query.mockResolvedValueOnce({ rows, rowCount: 2 });

      const result = await getReputation('fl-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRatings).toBe(2);
        expect(result.data.averageRating).toBeGreaterThan(0);
        expect(result.data.score).toBeGreaterThan(0);
      }
    });

    it('should return zero score for user with no reviews', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getReputation('new-user');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBe(0);
        expect(result.data.totalRatings).toBe(0);
        expect(result.data.averageRating).toBe(0);
      }
    });
  });

  describe('getWorkHistory', () => {
    it('should return work history for completed contracts', async () => {
      const contract = makeContractEntity({ status: 'completed', freelancer_id: 'fl-1' });
      mockGetUserContracts.mockResolvedValueOnce({ items: [contract] });
      mockGetProjectById.mockResolvedValueOnce({ id: 'proj-1', title: 'My Project' });
      mockPool.query.mockResolvedValueOnce({ rows: [{ contract_id: 'c-1', rating: 5, comment: 'Excellent' }], rowCount: 1 });

      const result = await getWorkHistory('fl-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].projectTitle).toBe('My Project');
        expect(result.data[0].rating).toBe(5);
      }
    });

    it('should return empty history when no completed contracts', async () => {
      mockGetUserContracts.mockResolvedValueOnce({ items: [makeContractEntity({ status: 'active' })] });

      const result = await getWorkHistory('fl-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(0);
    });
  });

  describe('canUserRate', () => {
    it('should return canRate true when eligible', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.canRate).toBe(true);
    });

    it('should return canRate false when already rated', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 });

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.canRate).toBe(false);
    });

    it('should return canRate false when user is not a party', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);

      const result = await canUserRate('stranger', 'fl-1', 'c-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canRate).toBe(false);
        expect(result.data.reason).toContain('not a participant');
      }
    });

    it('should return canRate false when contract not found', async () => {
      mockGetContractById.mockResolvedValueOnce(null);

      const result = await canUserRate('emp-1', 'fl-1', 'nonexistent');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.canRate).toBe(false);
    });

    it('should return DATABASE_ERROR when query fails', async () => {
      mockGetContractById.mockRejectedValueOnce(new Error('DB failure'));

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
