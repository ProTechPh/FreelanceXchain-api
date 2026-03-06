/**
 * Reputation Blockchain Integration Tests - Refactored
 * Tests for reputation system blockchain functionality
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

// Mock web3-client
const mockGetContract = jest.fn();
const mockGetContractWithSigner = jest.fn();
const mockIsWeb3Available = jest.fn();
const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  getContract: mockGetContract,
  getContractWithSigner: mockGetContractWithSigner,
  isWeb3Available: mockIsWeb3Available,
}));

// Mock contracts config
jest.unstable_mockModule(resolveModule('src/config/contracts.ts'), () => ({
  getContractAddress: jest.fn().mockReturnValue('0xReputationContract'),
}));

describe('Reputation Blockchain Integration - Refactored', () => {
  let mockContract: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWeb3Available.mockReturnValue(true);

    // Setup mock contract
    mockContract = {
      submitRating: jest.fn(),
      getUserRatingIndices: jest.fn(),
      getGivenRatingIndices: jest.fn(),
      getRating: jest.fn(),
      getAverageRating: jest.fn(),
      getRatingCount: jest.fn(),
      hasRated: jest.fn(),
      getTotalRatings: jest.fn(),
      interface: {
        parseLog: jest.fn(),
      },
    };

    mockGetContract.mockReturnValue(mockContract);
    mockGetContractWithSigner.mockReturnValue(mockContract);
  });

  describe('submitRatingToBlockchain', () => {
    it('should submit rating successfully', async () => {
      const mockReceipt = {
        hash: '0xTxHash',
        logs: [{ topics: ['0xRatingSubmitted'] }],
      };

      mockContract.submitRating.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.interface.parseLog.mockReturnValue({
        name: 'RatingSubmitted',
        args: [BigInt(1)],
      });

      const { submitRatingToBlockchain } = await import('../../services/reputation-blockchain.js');

      const result = await submitRatingToBlockchain({
        contractId: 'contract-123',
        rateeAddress: '0xRatee',
        rating: 5,
        comment: 'Excellent work!',
        isEmployerRating: true,
      });

      expect(result).toEqual({
        ratingIndex: BigInt(1),
        transactionHash: '0xTxHash',
        receipt: mockReceipt,
      });

      expect(mockContract.submitRating).toHaveBeenCalledWith(
        '0xRatee',
        5,
        'Excellent work!',
        'contract-123',
        true
      );
    });

    it('should throw error for invalid rating', async () => {
      const { submitRatingToBlockchain } = await import('../../services/reputation-blockchain.js');

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-123',
          rateeAddress: '0xRatee',
          rating: 6,
          comment: 'Test',
          isEmployerRating: true,
        })
      ).rejects.toThrow('Rating must be an integer between 1 and 5');
    });

    it('should throw error when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);

      const { submitRatingToBlockchain } = await import('../../services/reputation-blockchain.js');

      await expect(
        submitRatingToBlockchain({
          contractId: 'contract-123',
          rateeAddress: '0xRatee',
          rating: 5,
          comment: 'Test',
          isEmployerRating: true,
        })
      ).rejects.toThrow('Web3 is not configured');
    });
  });

  describe('getRatingsFromBlockchain', () => {
    it('should retrieve all ratings for a user', async () => {
      const mockIndices = [BigInt(0), BigInt(1)];
      const mockRating1 = ['0xRater1', '0xRatee', BigInt(5), 'Great work!', 'contract-1', BigInt(1640000000), true];
      const mockRating2 = ['0xRater2', '0xRatee', BigInt(4), 'Good job', 'contract-2', BigInt(1640000100), false];

      mockContract.getUserRatingIndices.mockResolvedValue(mockIndices);
      mockContract.getRating
        .mockResolvedValueOnce(mockRating1)
        .mockResolvedValueOnce(mockRating2);

      const { getRatingsFromBlockchain } = await import('../../services/reputation-blockchain.js');
      const ratings = await getRatingsFromBlockchain('0xRatee');

      expect(ratings).toHaveLength(2);
      expect(ratings[0]).toMatchObject({
        rater: '0xRater1',
        score: 5,
        comment: 'Great work!',
      });
      expect(ratings[1]).toMatchObject({
        rater: '0xRater2',
        score: 4,
        comment: 'Good job',
      });
    });

    it('should return empty array for user with no ratings', async () => {
      mockContract.getUserRatingIndices.mockResolvedValue([]);

      const { getRatingsFromBlockchain } = await import('../../services/reputation-blockchain.js');
      const ratings = await getRatingsFromBlockchain('0xNoRatings');

      expect(ratings).toEqual([]);
    });
  });

  describe('getAverageRating', () => {
    it('should return average rating', async () => {
      mockContract.getAverageRating.mockResolvedValue(BigInt(450));

      const { getAverageRating } = await import('../../services/reputation-blockchain.js');
      const average = await getAverageRating('0xUser');

      expect(average).toBe(4.5);
    });

    it('should return 0 for user with no ratings', async () => {
      mockContract.getAverageRating.mockResolvedValue(BigInt(0));

      const { getAverageRating } = await import('../../services/reputation-blockchain.js');
      const average = await getAverageRating('0xUser');

      expect(average).toBe(0);
    });
  });

  describe('getRatingCount', () => {
    it('should return rating count', async () => {
      mockContract.getRatingCount.mockResolvedValue(BigInt(10));

      const { getRatingCount } = await import('../../services/reputation-blockchain.js');
      const count = await getRatingCount('0xUser');

      expect(count).toBe(10);
    });
  });

  describe('getTotalRatings', () => {
    it('should return total ratings count', async () => {
      mockContract.getTotalRatings.mockResolvedValue(BigInt(100));

      const { getTotalRatings } = await import('../../services/reputation-blockchain.js');
      const total = await getTotalRatings();

      expect(total).toBe(100);
    });
  });
});
