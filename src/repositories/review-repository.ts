import { BaseRepository, BaseEntity, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type ReviewEntity = BaseEntity & {
  contract_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  reviewer_role: 'freelancer' | 'employer';
};

export type CreateReviewInput = Omit<ReviewEntity, 'id' | 'created_at' | 'updated_at'>;

class ReviewRepositoryClass extends BaseRepository<ReviewEntity> {
  constructor() {
    super(TABLES.REVIEWS);
  }

  async findByContractId(contractId: string): Promise<ReviewEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to find reviews: ${error.message}`);
    return (data ?? []) as ReviewEntity[];
  }

  async findByRevieweeId(revieweeId: string, options?: QueryOptions): Promise<PaginatedResult<ReviewEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('reviewee_id', revieweeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to find reviews: ${error.message}`);

    return {
      items: (data ?? []) as ReviewEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAverageRating(revieweeId: string): Promise<{ average: number; count: number }> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('rating')
      .eq('reviewee_id', revieweeId);

    if (error) throw new Error(`Failed to get average rating: ${error.message}`);

    const ratings = (data ?? []) as { rating: number }[];
    if (ratings.length === 0) return { average: 0, count: 0 };

    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    return { average: sum / ratings.length, count: ratings.length };
  }

  async hasReviewed(contractId: string, reviewerId: string): Promise<boolean> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('id')
      .eq('contract_id', contractId)
      .eq('reviewer_id', reviewerId)
      .limit(1);

    if (error) throw new Error(`Failed to check review: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
}

export const ReviewRepository = new ReviewRepositoryClass();
