import { ReviewRepository, ReviewEntity, CreateReviewInput } from '../repositories/review-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { createNotification } from './notification-service.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';

export type SubmitReviewInput = {
  contractId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
};

export type UserRatingSummary = {
  userId: string;
  averageRating: number;
  totalReviews: number;
  reviews: ReviewEntity[];
};

async function submitReview(input: SubmitReviewInput): Promise<ReviewEntity> {
  const { contractId, reviewerId, rating, comment } = input;

  // Validate rating
  if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

  // Verify contract exists and is completed
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) throw new Error('Contract not found');
  if (contract.status !== 'completed') throw new Error('Can only review completed contracts');

  // Verify reviewer is part of the contract
  const isFreelancer = contract.freelancer_id === reviewerId;
  const isEmployer = contract.employer_id === reviewerId;
  if (!isFreelancer && !isEmployer) throw new Error('User is not part of this contract');

  // Check if already reviewed
  const hasReviewed = await ReviewRepository.hasReviewed(contractId, reviewerId);
  if (hasReviewed) throw new Error('You have already reviewed this contract');

  // Determine reviewee
  const revieweeId = isFreelancer ? contract.employer_id : contract.freelancer_id;
  const reviewerRole = isFreelancer ? 'freelancer' : 'employer';

  const reviewData: CreateReviewInput = {
    contract_id: contractId,
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    rating,
    comment: comment ?? null,
    reviewer_role: reviewerRole,
  };

  const review = await ReviewRepository.create({ ...reviewData, id: crypto.randomUUID() });

  // Notify the reviewee
  await createNotification({
    userId: revieweeId,
    type: 'rating_received',
    title: 'New Review Received',
    message: `You received a ${rating}-star review`,
    data: { contractId, reviewId: review.id, rating },
  });

  return review;
}

async function getReviewsByContract(contractId: string): Promise<ReviewEntity[]> {
  return ReviewRepository.findByContractId(contractId);
}

async function getUserReviews(userId: string, options?: QueryOptions): Promise<PaginatedResult<ReviewEntity>> {
  return ReviewRepository.findByRevieweeId(userId, options);
}

async function getUserRatingSummary(userId: string): Promise<UserRatingSummary> {
  const [ratingStats, reviewsResult] = await Promise.all([
    ReviewRepository.getAverageRating(userId),
    ReviewRepository.findByRevieweeId(userId, { limit: 10 }),
  ]);

  return {
    userId,
    averageRating: Math.round(ratingStats.average * 10) / 10,
    totalReviews: ratingStats.count,
    reviews: reviewsResult.items,
  };
}

async function canReview(contractId: string, userId: string): Promise<boolean> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract || contract.status !== 'completed') return false;

  const isParticipant = contract.freelancer_id === userId || contract.employer_id === userId;
  if (!isParticipant) return false;

  const hasReviewed = await ReviewRepository.hasReviewed(contractId, userId);
  return !hasReviewed;
}

export const ReviewService = {
  submitReview,
  getReviewsByContract,
  getUserReviews,
  getUserRatingSummary,
  canReview,
};
