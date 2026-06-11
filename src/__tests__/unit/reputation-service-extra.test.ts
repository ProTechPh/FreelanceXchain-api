// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockLogger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
const mockNotify = jest.fn() as jest.Mock<any>;
const mockGetContractById = jest.fn() as jest.Mock<any>;
const mockGetUserContracts = jest.fn() as jest.Mock<any>;
const mockFindProjectById = jest.fn() as jest.Mock<any>;
const mockSubmitRatingToBlockchain = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyRatingReceived: mockNotify,
}));
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: mockGetContractById,
    getUserContracts: mockGetUserContracts,
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { findProjectById: mockFindProjectById, getProjectById: mockFindProjectById },
}));
jest.unstable_mockModule(resolveModule('src/services/reputation-blockchain.ts'), () => ({
  submitRatingToBlockchain: mockSubmitRatingToBlockchain,
}));

const {
  getReputation,
  getWorkHistory,
  getContractRatings,
  canUserRate,
  getReviewById,
  getUserReviews,
  getProjectReviews,
} = await import('../../services/reputation-service.js');

function makeReviewRow(overrides: Record<string, any> = {}) {
  return {
    id: 'review-1',
    contract_id: 'c-1',
    reviewer_id: 'reviewer-1',
    reviewee_id: 'reviewee-1',
    rating: 4,
    comment: 'Good work',
    reviewer_role: 'employer',
    work_quality: 4,
    communication: 5,
    professionalism: 4,
    would_work_again: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeContractEntity(overrides: Record<string, any> = {}) {
  return {
    id: 'c-1',
    project_id: 'proj-1',
    employer_id: 'emp-1',
    freelancer_id: 'fl-1',
    status: 'completed',
    budget: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Reputation Service - Extra Coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockRejectedValue(new Error('Document not found'));
    mockNotify.mockResolvedValue({ success: true });
    mockSubmitRatingToBlockchain.mockResolvedValue({ transactionHash: '0xabc' });
  });

  describe('getReputation', () => {
    it('should return empty reputation when no reviews found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await getReputation('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRatings).toBe(0);
        expect(result.data.score).toBe(0);
        expect(result.data.userId).toBe('user-1');
      }
    });

    it('should calculate weighted average from review rows', async () => {
      const docs = [
        { $id: 'r1', reviewee_id: 'user-1', rating: 5, created_at: new Date().toISOString(), comment: null },
        { $id: 'r2', reviewee_id: 'user-1', rating: 3, created_at: new Date(Date.now() - 86400000).toISOString(), comment: null },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await getReputation('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRatings).toBe(2);
        expect(result.data.averageRating).toBeCloseTo(4, 0);
      }
    });

    it('should return error when query fails', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await getReputation('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('getWorkHistory', () => {
    it('should return empty work history when no contracts', async () => {
      mockGetUserContracts.mockResolvedValue({ items: [] });
      const result = await getWorkHistory('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(0);
    });

    it('should return work history for completed contracts', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetUserContracts.mockResolvedValue({ items: [contract] });
      mockFindProjectById.mockResolvedValue({
        id: 'proj-1', title: 'Test Project',
        employer_id: 'emp-1', status: 'completed',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getWorkHistory('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].projectTitle).toBe('Test Project');
      }
    });

    it('should return DATABASE_ERROR when query fails', async () => {
      mockGetUserContracts.mockRejectedValueOnce(new Error('fail'));
      const result = await getWorkHistory('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });

    it('should include rating in work history when review exists', async () => {
      const contract = makeContractEntity({ status: 'completed', freelancer_id: 'user-1' });
      mockGetUserContracts.mockResolvedValue({ items: [contract] });
      mockFindProjectById.mockResolvedValue({
        id: 'proj-1', title: 'Test Project',
        employer_id: 'emp-1', status: 'completed',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ contract_id: contract.id, rating: 5, comment: 'Great' }],
        total: 1,
      });

      const result = await getWorkHistory('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].rating).toBe(5);
        expect(result.data[0].ratingComment).toBe('Great');
      }
    });
  });

  describe('getContractRatings', () => {
    it('should return ratings for a contract', async () => {
      const docs = [makeReviewRow({ contract_id: 'c-1', rating: 5 })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await getContractRatings('c-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should return DATABASE_ERROR when query fails', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const result = await getContractRatings('c-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('canUserRate', () => {
    it('should return true when user can rate a completed contract', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success && result.data.canRate).toBe(true);
    });

    it('should return false when contract is not completed', async () => {
      const contract = makeContractEntity({ status: 'active' });
      mockGetContractById.mockResolvedValueOnce(contract);

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success && !result.data.canRate).toBe(true);
    });

    it('should return false when user is not a participant', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);

      const result = await canUserRate('unrelated-user', 'fl-1', 'c-1');
      expect(result.success && !result.data.canRate).toBe(true);
    });

    it('should return false when user has already rated', async () => {
      const contract = makeContractEntity({ status: 'completed' });
      mockGetContractById.mockResolvedValueOnce(contract);
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'existing-review' }],
        total: 1,
      });

      const result = await canUserRate('emp-1', 'fl-1', 'c-1');
      expect(result.success && !result.data.canRate).toBe(true);
    });

    it('should return false when contract not found', async () => {
      mockGetContractById.mockResolvedValueOnce(null);
      const result = await canUserRate('emp-1', 'fl-1', 'nonexistent');
      expect(result.success && !result.data.canRate).toBe(true);
    });
  });

  describe('getReviewById', () => {
    it('should return review when found', async () => {
      const reviewRow = makeReviewRow({ id: 'review-1' });
      mockDatabases.getDocument.mockResolvedValueOnce(reviewRow);

      const result = await getReviewById('review-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeDefined();
    });

    it('should return NOT_FOUND when review does not exist', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Document not found'));

      const result = await getReviewById('nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('getUserReviews', () => {
    it('should return reviews for a user', async () => {
      const docs = [makeReviewRow({ reviewee_id: 'user-1' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await getUserReviews('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should return DATABASE_ERROR when query fails', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const result = await getUserReviews('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('getProjectReviews', () => {
    it('should return reviews for a project', async () => {
      const docs = [makeReviewRow()];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await getProjectReviews('proj-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should return DATABASE_ERROR when query fails', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const result = await getProjectReviews('proj-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
