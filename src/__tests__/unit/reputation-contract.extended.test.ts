import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitTransaction = jest.fn<(...args: any[]) => Promise<any>>();
const mockConfirmTransaction = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

describe('Reputation Contract - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const importModule = async () => {
    return await import('../../services/reputation-contract.js');
  };

  describe('submitRatingToBlockchain - edge cases', () => {
    it('should handle rating at boundary value 1', async () => {
      const { submitRatingToBlockchain } = await importModule();

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash',
        blockNumber: 123,
        gasUsed: BigInt(21000),
      });
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await submitRatingToBlockchain({
        contractId: 'contract-1',
        raterId: 'user-1',
        rateeId: 'user-2',
        rating: 1,
      });

      expect(result.rating.rating).toBe(1);
    });

    it('should handle rating at boundary value 5', async () => {
      const { submitRatingToBlockchain } = await importModule();

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash',
        blockNumber: 123,
        gasUsed: BigInt(21000),
      });
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await submitRatingToBlockchain({
        contractId: 'contract-1',
        raterId: 'user-1',
        rateeId: 'user-2',
        rating: 5,
      });

      expect(result.rating.rating).toBe(5);
    });

    it('should throw for negative rating', async () => {
      const { submitRatingToBlockchain } = await importModule();

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-1',
          raterId: 'user-1',
          rateeId: 'user-2',
          rating: -1,
        })
      ).rejects.toThrow('Rating must be an integer between 1 and 5');
    });
  });

  describe('computeAggregateScore - totalWeight edge case', () => {
    it('should return 0 for empty ratings', async () => {
      const { computeAggregateScore } = await importModule();
      expect(computeAggregateScore([])).toBe(0);
    });

    it('should handle single rating', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 3, timestamp: now, transactionHash: '0xtx' },
      ];
      expect(computeAggregateScore(ratings)).toBe(3);
    });

    it('should handle very old ratings with high decay', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 5, timestamp: now - 365 * 24 * 60 * 60 * 1000, transactionHash: '0xtx' },
      ];
      const score = computeAggregateScore(ratings, 0.1);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(5);
    });

    it('should handle all same ratings', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 4, timestamp: now - 1000, transactionHash: '0xtx' },
        { id: 'r-2', contractId: 'c-2', raterId: 'u-3', rateeId: 'u-2', rating: 4, timestamp: now - 2000, transactionHash: '0xtx' },
        { id: 'r-3', contractId: 'c-3', raterId: 'u-4', rateeId: 'u-2', rating: 4, timestamp: now - 3000, transactionHash: '0xtx' },
      ];
      expect(computeAggregateScore(ratings)).toBe(4);
    });
  });

  describe('getAggregateScoreFromBlockchain - edge cases', () => {
    it('should return 0 when user has no ratings', async () => {
      const { getAggregateScoreFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getAggregateScoreFromBlockchain('u-1');
      expect(result).toBe(0);
    });

    it('should handle custom decay lambda', async () => {
      const { getAggregateScoreFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: null, timestamp: Date.now(), transaction_hash: '0xtx' },
        ],
        rowCount: 1,
      });

      const result = await getAggregateScoreFromBlockchain('u-2', 0.05);
      expect(result).toBe(5);
    });
  });

  describe('getRatingsFromBlockchain - null data', () => {
    it('should return empty array when query returns empty', async () => {
      const { getRatingsFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getRatingsFromBlockchain('u-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getRatingsGivenByUser - null data', () => {
    it('should return empty array when query returns empty', async () => {
      const { getRatingsGivenByUser } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getRatingsGivenByUser('u-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getRatingById - null data', () => {
    it('should return null when query returns empty', async () => {
      const { getRatingById } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getRatingById('r-1');
      expect(result).toBeNull();
    });
  });

  describe('getRatingsByContract - null data', () => {
    it('should return empty array when query returns empty', async () => {
      const { getRatingsByContract } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getRatingsByContract('c-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('hasUserRatedForContract - null count', () => {
    it('should return false when count is 0', async () => {
      const { hasUserRatedForContract } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      const result = await hasUserRatedForContract('u-1', 'u-2', 'c-1');
      expect(result).toBe(false);
    });
  });

  describe('clearBlockchainRatings - edge cases', () => {
    it('should skip when not in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const { clearBlockchainRatings } = await importModule();
      await clearBlockchainRatings();

      expect((global as any).mockPool.query).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('serializeBlockchainRating', () => {
    it('should preserve comment as undefined when not provided', async () => {
      const { serializeBlockchainRating } = await importModule();
      const rating = {
        id: 'r-1',
        contractId: 'c-1',
        raterId: 'u-1',
        rateeId: 'u-2',
        rating: 5,
        timestamp: Date.now(),
        transactionHash: '0xtx',
      };
      const result = serializeBlockchainRating(rating);
      expect(result.comment).toBeUndefined();
    });
  });
});