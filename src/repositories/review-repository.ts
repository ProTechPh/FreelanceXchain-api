import { BaseRepositoryAppwrite, PaginatedResult, QueryOptions } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

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

class ReviewRepositoryClass extends BaseRepositoryAppwrite<ReviewEntity> {
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
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as ReviewEntity;
      });
    } catch (error: any) {
      throw new Error(`Failed to find reviews: ${error.message}`);
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
      const items = response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as ReviewEntity;
      });
      return { items, total, hasMore: items.length === limit };
    } catch (error: any) {
      throw new Error(`Failed to find reviews: ${error.message}`);
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
      const totalRating = reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0);
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
    } catch (error: any) {
      throw new Error(`Failed to check review: ${error.message}`);
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
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as ReviewEntity;
      });
    } catch (error: any) {
      throw new Error(`Failed to query reviews: ${error.message}`);
    }
  }
}

export const ReviewRepository = new ReviewRepositoryClass();
