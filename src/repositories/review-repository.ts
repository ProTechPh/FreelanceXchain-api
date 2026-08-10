import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';

export type ReviewEntity = {
  id: string;
  contract_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  reviewer_role: 'freelancer' | 'employer';
  created_at: string;
  updated_at: string;
};

export type CreateReviewInput = Omit<ReviewEntity, 'id' | 'created_at' | 'updated_at'>;

const COLLECTION_ID = 'reviews';

class ReviewRepositoryClass extends BaseRepository<ReviewEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByContractId(contractId: string): Promise<ReviewEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(doc => fromAppwriteDoc<ReviewEntity>(doc));
    } catch (error) {
      throw new Error(`Failed to find reviews: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async findByRevieweeId(
    revieweeId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: ReviewEntity[]; total: number; hasMore: boolean }> {
    const { limit = 20, offset = 0 } = options;
    try {
      const countResponse = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('reviewee_id', revieweeId),
          Query.limit(1),
        ]
      );
      const total = countResponse.total;

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('reviewee_id', revieweeId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      const items = response.documents.map(doc => fromAppwriteDoc<ReviewEntity>(doc));
      return { items, total, hasMore: items.length === limit };
    } catch (error) {
      throw new Error(`Failed to find reviews: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getAverageRating(revieweeId: string): Promise<{ average: number; count: number }> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('reviewee_id', revieweeId),
          Query.limit(1000),
        ]
      );
      const reviews = response.documents;
      if (reviews.length === 0) {
        return { average: 0, count: 0 };
      }
      const totalRating = reviews.reduce((sum, r) => sum + Number(r.rating ?? 0), 0);
      return {
        average: totalRating / reviews.length,
        count: reviews.length,
      };
    } catch {
      return { average: 0, count: 0 };
    }
  }

  async hasReviewed(contractId: string, reviewerId: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.equal('reviewer_id', reviewerId),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0;
    } catch (error) {
      throw new Error(`Failed to check review: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getAllReviews(): Promise<ReviewEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(doc => fromAppwriteDoc<ReviewEntity>(doc));
    } catch (error) {
      throw new Error(`Failed to query reviews: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }
}

export const reviewRepository = new ReviewRepositoryClass();
/** @deprecated Use `reviewRepository` (camelCase) instead. */
export const ReviewRepository = reviewRepository;
