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

describe('Reputation Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const importModule = async () => {
    return await import('../../services/reputation-contract.js');
  };

  describe('serializeBlockchainRating', () => {
    it('should return the same rating object', async () => {
      const { serializeBlockchainRating } = await importModule();
      const rating = {
        id: 'rating-1',
        contractId: 'contract-1',
        raterId: 'user-1',
        rateeId: 'user-2',
        rating: 5,
        timestamp: Date.now(),
        transactionHash: '0xtx',
      };
      expect(serializeBlockchainRating(rating)).toBe(rating);
    });
  });

  describe('deserializeBlockchainRating', () => {
    it('should return the same rating object', async () => {
      const { deserializeBlockchainRating } = await importModule();
      const rating = {
        id: 'rating-1',
        contractId: 'contract-1',
        raterId: 'user-1',
        rateeId: 'user-2',
        rating: 5,
        timestamp: Date.now(),
        transactionHash: '0xtx',
      };
      expect(deserializeBlockchainRating(rating)).toBe(rating);
    });
  });

  describe('submitRatingToBlockchain', () => {
    it('should submit rating successfully', async () => {
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
        comment: 'Great work!',
      });

      expect(result.rating.rating).toBe(5);
      expect(result.rating.comment).toBe('Great work!');
      expect(result.receipt.status).toBe('success');
    });

    it('should throw for rating below 1', async () => {
      const { submitRatingToBlockchain } = await importModule();

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-1',
          raterId: 'user-1',
          rateeId: 'user-2',
          rating: 0,
        })
      ).rejects.toThrow('Rating must be an integer between 1 and 5');
    });

    it('should throw for rating above 5', async () => {
      const { submitRatingToBlockchain } = await importModule();

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-1',
          raterId: 'user-1',
          rateeId: 'user-2',
          rating: 6,
        })
      ).rejects.toThrow('Rating must be an integer between 1 and 5');
    });

    it('should throw for non-integer rating', async () => {
      const { submitRatingToBlockchain } = await importModule();

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-1',
          raterId: 'user-1',
          rateeId: 'user-2',
          rating: 3.5,
        })
      ).rejects.toThrow('Rating must be an integer between 1 and 5');
    });

    it('should throw when transaction confirmation fails', async () => {
      const { submitRatingToBlockchain } = await importModule();

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
      mockConfirmTransaction.mockResolvedValueOnce(null);

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-1',
          raterId: 'user-1',
          rateeId: 'user-2',
          rating: 4,
        })
      ).rejects.toThrow('Failed to confirm rating transaction');
    });
  });

  describe('getRatingsFromBlockchain', () => {
    it('should return ratings for user', async () => {
      const { getRatingsFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: 'Great', timestamp: 1000, transaction_hash: '0xtx1' },
          { id: 'r-2', contract_id: 'c-2', rater_id: 'u-3', ratee_id: 'u-2', rating: 4, comment: null, timestamp: 2000, transaction_hash: '0xtx2' },
        ],
        rowCount: 2,
      });

      const result = await getRatingsFromBlockchain('u-2');

      expect(result).toHaveLength(2);
      expect(result[0]?.rating).toBe(5);
      expect(result[1]?.comment).toBeUndefined();
    });

    it('should return empty array on error', async () => {
      const { getRatingsFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getRatingsFromBlockchain('u-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getRatingsGivenByUser', () => {
    it('should return ratings given by user', async () => {
      const { getRatingsGivenByUser } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: null, timestamp: 1000, transaction_hash: '0xtx' }],
        rowCount: 1,
      });

      const result = await getRatingsGivenByUser('u-1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      const { getRatingsGivenByUser } = await importModule();

      (global as any).mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getRatingsGivenByUser('u-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getRatingById', () => {
    it('should return rating by id', async () => {
      const { getRatingById } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: null, timestamp: 1000, transaction_hash: '0xtx' }],
        rowCount: 1,
      });

      const result = await getRatingById('r-1');
      expect(result).not.toBeNull();
      expect(result?.rating).toBe(5);
    });

    it('should return null when not found', async () => {
      const { getRatingById } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getRatingById('r-1');
      expect(result).toBeNull();
    });
  });

  describe('getRatingsByContract', () => {
    it('should return ratings for contract', async () => {
      const { getRatingsByContract } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: null, timestamp: 1000, transaction_hash: '0xtx' },
        ],
        rowCount: 1,
      });

      const result = await getRatingsByContract('c-1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      const { getRatingsByContract } = await importModule();

      (global as any).mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getRatingsByContract('c-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('computeAggregateScore', () => {
    it('should return 0 for empty ratings', async () => {
      const { computeAggregateScore } = await importModule();
      expect(computeAggregateScore([])).toBe(0);
    });

    it('should compute simple average for recent ratings', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 5, timestamp: now - 1000, transactionHash: '0xtx1' },
        { id: 'r-2', contractId: 'c-2', raterId: 'u-3', rateeId: 'u-2', rating: 3, timestamp: now - 1000, transactionHash: '0xtx2' },
      ];
      expect(computeAggregateScore(ratings)).toBe(4);
    });

    it('should weight recent ratings higher', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 1, timestamp: now - 30 * 24 * 60 * 60 * 1000, transactionHash: '0xtx1' },
        { id: 'r-2', contractId: 'c-2', raterId: 'u-3', rateeId: 'u-2', rating: 5, timestamp: now, transactionHash: '0xtx2' },
      ];
      const score = computeAggregateScore(ratings);
      expect(score).toBeGreaterThan(3);
    });

    it('should handle custom decay lambda', async () => {
      const { computeAggregateScore } = await importModule();
      const now = Date.now();
      const ratings = [
        { id: 'r-1', contractId: 'c-1', raterId: 'u-1', rateeId: 'u-2', rating: 5, timestamp: now, transactionHash: '0xtx' },
      ];
      expect(computeAggregateScore(ratings, 0.1)).toBe(5);
    });
  });

  describe('getAggregateScoreFromBlockchain', () => {
    it('should compute aggregate score for user', async () => {
      const { getAggregateScoreFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'r-1', contract_id: 'c-1', rater_id: 'u-1', ratee_id: 'u-2', rating: 5, comment: null, timestamp: Date.now(), transaction_hash: '0xtx' },
        ],
        rowCount: 1,
      });

      const result = await getAggregateScoreFromBlockchain('u-2');
      expect(result).toBe(5);
    });
  });

  describe('hasUserRatedForContract', () => {
    it('should return true when rating exists', async () => {
      const { hasUserRatedForContract } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1,
      });

      const result = await hasUserRatedForContract('u-1', 'u-2', 'c-1');
      expect(result).toBe(true);
    });

    it('should return false when no rating exists', async () => {
      const { hasUserRatedForContract } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      const result = await hasUserRatedForContract('u-1', 'u-2', 'c-1');
      expect(result).toBe(false);
    });
  });

  describe('clearBlockchainRatings', () => {
    it('should clear ratings in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { clearBlockchainRatings } = await importModule();
      await expect(clearBlockchainRatings()).resolves.not.toThrow();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not clear ratings outside test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { clearBlockchainRatings } = await importModule();
      await clearBlockchainRatings();
      expect((global as any).mockPool.query).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('getReputationContractAddress', () => {
    it('should return a valid address', async () => {
      const { getReputationContractAddress } = await importModule();
      const address = getReputationContractAddress();
      expect(address).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });
});