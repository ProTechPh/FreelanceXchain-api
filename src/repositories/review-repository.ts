import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';

export type ReviewEntity = {
  id: string;
  contract_id: string;
  project_id?: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  reviewer_role: 'freelancer' | 'employer';
  work_quality?: number | null;
  communication?: number | null;
  professionalism?: number | null;
  would_work_again?: boolean | null;
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
      return await this.fetchAll([
        Query.equal('contract_id', contractId),
        Query.orderDesc('$createdAt'),
      ]);
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
      const reviews = await this.fetchAll([
        Query.equal('reviewee_id', revieweeId),
      ]);
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
      return await this.fetchAll([Query.orderDesc('$createdAt')]);
    } catch (error) {
      throw new Error(`Failed to query reviews: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /**
   * All reviews a user received, newest first. Errors propagate so the caller
   * can decide how to surface them (used by aggregation/legacy services).
   */
  async findAllByRevieweeId(revieweeId: string): Promise<ReviewEntity[]> {
    return this.fetchAll([
      Query.equal('reviewee_id', revieweeId),
      Query.orderDesc('$createdAt'),
    ]);
  }

  /**
   * All reviews for a project, newest first. Errors propagate to the caller.
   */
  async findAllByProjectId(projectId: string): Promise<ReviewEntity[]> {
    return this.fetchAll([
      Query.equal('project_id', projectId),
      Query.orderDesc('$createdAt'),
    ]);
  }

  /**
   * Every review in the collection. Errors propagate to the caller.
   */
  async listAll(): Promise<ReviewEntity[]> {
    return this.fetchAll();
  }
}

export const reviewRepository = new ReviewRepositoryClass();
/** @deprecated Use `reviewRepository` (camelCase) instead. */
export const ReviewRepository = reviewRepository;
