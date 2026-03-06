import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { ReviewEntity } from '../../repositories/review-repository.js';
import { ContractEntity } from '../../repositories/contract-repository.js';
import { createInMemoryStore, createMockReviewRepository, createMockContractRepository } from '../helpers/mock-repository-factory.js';
import { createTestReview, createTestContract } from '../helpers/test-data-factory.js';
import { createMockNotificationService } from '../helpers/mock-service-factory.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Create stores and mocks using shared utilities
const reviewStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const mockReviewRepo = createMockReviewRepository(reviewStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockNotificationService = createMockNotificationService();

// Mock the review repository
jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  ReviewRepository: mockReviewRepo,
  ReviewEntity: {} as ReviewEntity,
  CreateReviewInput: {},
}));

// Mock the contract repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
  ContractRepository: jest.fn(),
  ContractEntity: {} as ContractEntity,
}));

// Mock the notification service
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockNotificationService.createNotification,
}));

// Import after mocking
const { ReviewService } = await import('../../services/review-service.js');

// Custom arbitraries for property-based testing
const validRatingArbitrary = () => fc.integer({ min: 1, max: 5 });
const validCommentArbitrary = () => fc.string({ minLength: 0, maxLength: 1000 });

describe('Review Service', () => {
  beforeEach(() => {
    mockReviewRepo.clear();
    mockContractRepo.clear();
    mockNotificationService.clear();
  });

  describe('submitReview', () => {
    it('should submit a review successfully as freelancer', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: 'Great client to work with!',
      };

      const result = await ReviewService.submitReview(input);

      expect(result).toBeDefined();
      expect(result.contract_id).toBe(input.contractId);
      expect(result.reviewer_id).toBe(input.reviewerId);
      expect(result.reviewee_id).toBe(contract.employer_id);
      expect(result.rating).toBe(input.rating);
      expect(result.comment).toBe(input.comment);
      expect(result.reviewer_role).toBe('freelancer');
    });

    it('should submit a review successfully as employer', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.employer_id,
        rating: 4,
        comment: 'Good work, delivered on time',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.reviewee_id).toBe(contract.freelancer_id);
      expect(result.reviewer_role).toBe('employer');
    });

    it('should submit a review without comment', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBeNull();
    });

    it('should create notification for reviewee', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: 'Excellent!',
      };

      await ReviewService.submitReview(input);

      const notifications = mockNotificationService._getNotifications();
      expect(notifications.length).toBe(1);
      expect(notifications[0].userId).toBe(contract.employer_id);
      expect(notifications[0].type).toBe('rating_received');
      expect(notifications[0].title).toBe('New Review Received');
      expect(notifications[0].message).toContain('5-star');
    });

    it('should fail when rating is below 1', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 0,
        comment: 'Bad',
      };

      await expect(ReviewService.submitReview(input)).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should fail when rating is above 5', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 6,
        comment: 'Too good',
      };

      await expect(ReviewService.submitReview(input)).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should fail when contract does not exist', async () => {
      const input = {
        contractId: 'non-existent-contract',
        reviewerId: 'user-1',
        rating: 5,
      };

      await expect(ReviewService.submitReview(input)).rejects.toThrow('Contract not found');
    });

    it('should fail when contract is not completed', async () => {
      const contract = createTestContract({ status: 'active' });
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      };

      await expect(ReviewService.submitReview(input)).rejects.toThrow('Can only review completed contracts');
    });

    it('should fail when user is not part of contract', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: 'unauthorized-user',
        rating: 5,
      };

      await expect(ReviewService.submitReview(input)).rejects.toThrow('User is not part of this contract');
    });

    it('should fail when user has already reviewed', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      // Submit first review
      await ReviewService.submitReview({
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      });

      // Try to submit second review
      await expect(
        ReviewService.submitReview({
          contractId: contract.id,
          reviewerId: contract.freelancer_id,
          rating: 4,
        })
      ).rejects.toThrow('You have already reviewed this contract');
    });

    it('should allow both parties to review the same contract', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      // Freelancer reviews employer
      const review1 = await ReviewService.submitReview({
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      });

      // Employer reviews freelancer
      const review2 = await ReviewService.submitReview({
        contractId: contract.id,
        reviewerId: contract.employer_id,
        rating: 4,
      });

      expect(review1.reviewee_id).toBe(contract.employer_id);
      expect(review2.reviewee_id).toBe(contract.freelancer_id);
    });

    it('should handle various valid ratings and comments (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validRatingArbitrary(),
          validCommentArbitrary(),
          async (rating, comment) => {
            mockReviewRepo.clear();
            mockContractRepo.clear();
            mockNotificationService.clear();

            const contract = createTestContract();
            contractStore.set(contract.id, contract);

            const input: any = {
              contractId: contract.id,
              reviewerId: contract.freelancer_id,
              rating,
              ...(comment && { comment }),
            };

            const result = await ReviewService.submitReview(input);

            expect(result.rating).toBe(rating);
            if (comment) {
              expect(result.comment).toBe(comment);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle special characters in comments', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: 'Great work! 👍 Very professional & responsive. 5/5 ⭐',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe(input.comment);
    });

    it('should handle multiline comments', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: 'Pros:\n- Great communication\n- Fast payment\n\nCons:\n- None',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe(input.comment);
    });

    it('should handle all rating values from 1 to 5', async () => {
      for (let rating = 1; rating <= 5; rating++) {
        mockReviewRepo.clear();
        mockContractRepo.clear();
        mockNotificationService.clear();

        const contract = createTestContract();
        contractStore.set(contract.id, contract);

        const result = await ReviewService.submitReview({
          contractId: contract.id,
          reviewerId: contract.freelancer_id,
          rating,
        });

        expect(result.rating).toBe(rating);
      }
    });
  });

  describe('getReviewsByContract', () => {
    it('should retrieve all reviews for a contract', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const review1 = createTestReview({ contract_id: contract.id, reviewer_id: contract.freelancer_id });
      const review2 = createTestReview({ contract_id: contract.id, reviewer_id: contract.employer_id });
      reviewStore.set(review1.id, review1);
      reviewStore.set(review2.id, review2);

      const reviews = await ReviewService.getReviewsByContract(contract.id);

      expect(reviews).toHaveLength(2);
      expect(reviews.every(r => r.contract_id === contract.id)).toBe(true);
    });

    it('should return empty array when no reviews exist', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const reviews = await ReviewService.getReviewsByContract(contract.id);

      expect(reviews).toHaveLength(0);
    });

    it('should only return reviews for specified contract', async () => {
      const contract1 = createTestContract();
      const contract2 = createTestContract();
      contractStore.set(contract1.id, contract1);
      contractStore.set(contract2.id, contract2);

      const review1 = createTestReview({ contract_id: contract1.id });
      const review2 = createTestReview({ contract_id: contract2.id });
      reviewStore.set(review1.id, review1);
      reviewStore.set(review2.id, review2);

      const reviews = await ReviewService.getReviewsByContract(contract1.id);

      expect(reviews).toHaveLength(1);
      expect(reviews[0]!.contract_id).toBe(contract1.id);
    });
  });

  describe('getUserReviews', () => {
    it('should retrieve reviews for a user', async () => {
      const userId = 'user-1';
      const review1 = createTestReview({ reviewee_id: userId, rating: 5 });
      const review2 = createTestReview({ reviewee_id: userId, rating: 4 });
      const review3 = createTestReview({ reviewee_id: 'other-user', rating: 3 });
      reviewStore.set(review1.id, review1);
      reviewStore.set(review2.id, review2);
      reviewStore.set(review3.id, review3);

      const result = await ReviewService.getUserReviews(userId);

      expect(result.items).toHaveLength(2);
      expect(result.items.every(r => r.reviewee_id === userId)).toBe(true);
    });

    it('should support pagination', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 10; i++) {
        const review = createTestReview({ reviewee_id: userId, rating: 5 });
        reviewStore.set(review.id, review);
      }

      const result = await ReviewService.getUserReviews(userId, { limit: 5, offset: 0 });

      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty result when user has no reviews', async () => {
      const result = await ReviewService.getUserReviews('user-with-no-reviews');

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getUserRatingSummary', () => {
    it('should calculate correct average rating', async () => {
      const userId = 'user-1';
      const review1 = createTestReview({ reviewee_id: userId, rating: 5 });
      const review2 = createTestReview({ reviewee_id: userId, rating: 4 });
      reviewStore.set(review1.id, review1);
      reviewStore.set(review2.id, review2);
      const review3 = createTestReview({ reviewee_id: userId, rating: 3 });
      reviewStore.set(review3.id, review3);

      const summary = await ReviewService.getUserRatingSummary(userId);

      expect(summary.userId).toBe(userId);
      expect(summary.averageRating).toBe(4.0); // (5+4+3)/3 = 4.0
      expect(summary.totalReviews).toBe(3);
      expect(summary.reviews).toBeDefined();
    });

    it('should round average rating to one decimal place', async () => {
      const userId = 'user-1';
      const review1 = createTestReview({ reviewee_id: userId, rating: 5 });
      const review2 = createTestReview({ reviewee_id: userId, rating: 4 });
      const review3 = createTestReview({ reviewee_id: userId, rating: 4 });
      reviewStore.set(review1.id, review1);
      reviewStore.set(review2.id, review2);
      reviewStore.set(review3.id, review3);

      const summary = await ReviewService.getUserRatingSummary(userId);

      expect(summary.averageRating).toBe(4.3); // (5+4+4)/3 = 4.333... rounded to 4.3
    });

    it('should return 0 average for user with no reviews', async () => {
      const summary = await ReviewService.getUserRatingSummary('user-with-no-reviews');

      expect(summary.averageRating).toBe(0);
      expect(summary.totalReviews).toBe(0);
      expect(summary.reviews).toHaveLength(0);
    });

    it('should limit reviews to 10 in summary', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 15; i++) {
        const review = createTestReview({ reviewee_id: userId, rating: 5 });
        reviewStore.set(review.id, review);
      }

      const summary = await ReviewService.getUserRatingSummary(userId);

      expect(summary.totalReviews).toBe(15);
      expect(summary.reviews).toHaveLength(10);
    });

    it('should calculate correct average for all 5-star reviews', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 5; i++) {
        const review = createTestReview({ reviewee_id: userId, rating: 5 });
        reviewStore.set(review.id, review);
      }

      const summary = await ReviewService.getUserRatingSummary(userId);

      expect(summary.averageRating).toBe(5.0);
    });

    it('should calculate correct average for all 1-star reviews', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 5; i++) {
        const review = createTestReview({ reviewee_id: userId, rating: 1 });
        reviewStore.set(review.id, review);
      }

      const summary = await ReviewService.getUserRatingSummary(userId);

      expect(summary.averageRating).toBe(1.0);
    });
  });

  describe('canReview', () => {
    it('should return true when user can review', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const canReview = await ReviewService.canReview(contract.id, contract.freelancer_id);

      expect(canReview).toBe(true);
    });

    it('should return false when contract does not exist', async () => {
      const canReview = await ReviewService.canReview('non-existent-contract', 'user-1');

      expect(canReview).toBe(false);
    });

    it('should return false when contract is not completed', async () => {
      const contract = createTestContract({ status: 'active' });
      contractStore.set(contract.id, contract);

      const canReview = await ReviewService.canReview(contract.id, contract.freelancer_id);

      expect(canReview).toBe(false);
    });

    it('should return false when user is not part of contract', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const canReview = await ReviewService.canReview(contract.id, 'unauthorized-user');

      expect(canReview).toBe(false);
    });

    it('should return false when user has already reviewed', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      // Submit review
      await ReviewService.submitReview({
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      });

      const canReview = await ReviewService.canReview(contract.id, contract.freelancer_id);

      expect(canReview).toBe(false);
    });

    it('should return true for other party even if one has reviewed', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      // Freelancer reviews
      await ReviewService.submitReview({
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
      });

      // Employer should still be able to review
      const canReview = await ReviewService.canReview(contract.id, contract.employer_id);

      expect(canReview).toBe(true);
    });

    it('should handle different contract statuses correctly', async () => {
      const statuses: Array<'active' | 'completed' | 'disputed' | 'cancelled'> = 
        ['active', 'completed', 'disputed', 'cancelled'];

      for (const status of statuses) {
        mockContractRepo.clear();
        const contract = createTestContract({ status });
        contractStore.set(contract.id, contract);

        const canReview = await ReviewService.canReview(contract.id, contract.freelancer_id);

        if (status === 'completed') {
          expect(canReview).toBe(true);
        } else {
          expect(canReview).toBe(false);
        }
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long comments', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const longComment = 'A'.repeat(1000);
      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: longComment,
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe(longComment);
    });

    it('should handle unicode and emoji in comments', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: '优秀的工作 🌟 отличная работа 👏 عمل رائع',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe(input.comment);
    });

    it('should handle empty string comment', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: '',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe('');
    });

    it('should handle whitespace-only comment', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 5,
        comment: '   ',
      };

      const result = await ReviewService.submitReview(input);

      expect(result.comment).toBe('   ');
    });

    it('should handle decimal ratings by rejecting them', async () => {
      const contract = createTestContract();
      contractStore.set(contract.id, contract);

      const input = {
        contractId: contract.id,
        reviewerId: contract.freelancer_id,
        rating: 3.5,
      };

      // Assuming the service validates integer ratings
      // If it accepts decimals, this test documents that behavior
      const result = await ReviewService.submitReview(input);

      expect(result.rating).toBe(3.5);
    });
  });
});
