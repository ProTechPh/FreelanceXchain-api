import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';

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

class ReviewRepositoryClass extends BaseRepositoryPg<ReviewEntity> {
  constructor() {
    super('reviews');
  }

  async findByContractId(contractId: string): Promise<ReviewEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [contractId]);
      return result.rows as ReviewEntity[];
    } catch (error: any) {
      throw new Error(`Failed to find reviews: ${error.message}`);
    }
  }

  async findByRevieweeId(revieweeId: string, options?: QueryOptions): Promise<PaginatedResult<ReviewEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE reviewee_id = $1`;
    const countResult = await this.pool.query(countQuery, [revieweeId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE reviewee_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [revieweeId, limit, offset]);
      return {
        items: result.rows as ReviewEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to find reviews: ${error.message}`);
    }
  }

  async getAverageRating(revieweeId: string): Promise<{ average: number; count: number }> {
    const query = `
      SELECT AVG(rating) as average, COUNT(*) as count 
      FROM ${this.tableName} 
      WHERE reviewee_id = $1
    `;
    
    try {
      const result = await this.pool.query(query, [revieweeId]);
      const row = result.rows[0];
      return { 
        average: row.average ? parseFloat(row.average) : 0, 
        count: parseInt(row.count, 10) 
      };
    } catch (error: any) {
      throw new Error(`Failed to get average rating: ${error.message}`);
    }
  }

  async hasReviewed(contractId: string, reviewerId: string): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT 1 FROM ${this.tableName} 
        WHERE contract_id = $1 AND reviewer_id = $2
      )
    `;
    
    try {
      const result = await this.pool.query(query, [contractId, reviewerId]);
      return result.rows[0].exists;
    } catch (error: any) {
      throw new Error(`Failed to check review: ${error.message}`);
    }
  }

  async getAllReviews(): Promise<ReviewEntity[]> {
    return this.queryAll('created_at', false);
  }
}

export const ReviewRepository = new ReviewRepositoryClass();
