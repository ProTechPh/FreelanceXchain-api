import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { BlockchainRatingRepository } = await import('../../repositories/blockchain-rating-repository.js');

describe('BlockchainRatingRepository', () => {
  let repository: InstanceType<typeof BlockchainRatingRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new BlockchainRatingRepository();
  });

  describe('getRatingById', () => {
    it('returns a rating by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'rt-1',
        contract_id: 'c1',
        rater_id: 'user1',
        ratee_id: 'user2',
        rating: 5,
        comment: 'Excellent work',
        timestamp: Date.now(),
        transaction_hash: '0xtx',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getRatingById('rt-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rt-1');
      expect(result!.rating).toBe(5);
      expect(result!.comment).toBe('Excellent work');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'blockchain_ratings', 'rt-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getRatingById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createRating', () => {
    it('creates a rating', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'rt-new',
        contract_id: 'c1',
        rater_id: 'user1',
        ratee_id: 'user2',
        rating: 4,
        comment: 'Good',
        timestamp: Date.now(),
        transaction_hash: '0xtx',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createRating({
        id: 'rt-new',
        contract_id: 'c1',
        rater_id: 'user1',
        ratee_id: 'user2',
        rating: 4,
        comment: 'Good',
        timestamp: Date.now(),
        transaction_hash: '0xtx',
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('rt-new');
      expect(result.rating).toBe(4);
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateRating', () => {
    it('updates a rating', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'rt-1',
        comment: 'Updated comment',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateRating('rt-1', { comment: 'Updated comment' });
      expect(result).not.toBeNull();
      expect(result!.comment).toBe('Updated comment');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateRating('nonexistent', { rating: 3 });
      expect(result).toBeNull();
    });
  });

  describe('findByRatee', () => {
    it('returns paginated ratings by ratee_id', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'rt-1', ratee_id: 'user2', rating: 5, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.findByRatee('user2');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.ratee_id).toBe('user2');
      expect(result.items[0]!.rating).toBe(5);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns empty result when no ratings', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByRatee('user-nobody');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('returns paginated results with custom options', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'rt-1', ratee_id: 'user2', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { $id: 'rt-2', ratee_id: 'user2', $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
        ],
        total: 5,
      });
      const result = await repository.findByRatee('user2', { limit: 2, offset: 0 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });
  });

  describe('findByRater', () => {
    it('returns paginated ratings by rater_id', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'rt-1', rater_id: 'user1', rating: 4, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.findByRater('user1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.rater_id).toBe('user1');
      expect(result.items[0]!.rating).toBe(4);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns empty result when no ratings', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByRater('user-nobody');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('returns paginated results with custom limit and offset', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'rt-1', rater_id: 'user1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 10,
      });
      const result = await repository.findByRater('user1', { limit: 1, offset: 5 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(10);
    });
  });

  describe('findByContractAndRater', () => {
    it('returns a rating by contract_id and rater_id', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'rt-1', contract_id: 'c1', rater_id: 'user1', rating: 5, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
        total: 1,
      });
      const result = await repository.findByContractAndRater('c1', 'user1');
      expect(result).not.toBeNull();
      expect(result!.contract_id).toBe('c1');
      expect(result!.rater_id).toBe('user1');
      expect(result!.rating).toBe(5);
    });

    it('returns null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByContractAndRater('c-nobody', 'user-nobody');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repository.findByContractAndRater('c1', 'user1');
      expect(result).toBeNull();
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        rating: 3,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', rating: 3 });
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });

    it('getById uses base repository getById', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).getById('doc-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });

    it('delete uses base repository delete', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await (repository as any).delete('doc-1');
      expect(result).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalled();
    });

    it('findOne uses base repository findOne', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'doc-1', rating: 5 }],
        total: 1,
      });
      const result = await (repository as any).findOne('rating', 5);
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
