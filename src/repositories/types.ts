export type QueryOptions = {
  limit?: number;
  offset?: number;
  maxItemCount?: number;
  continuationToken?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  hasMore: boolean;
  total?: number | undefined;
};

export type BaseEntity = {
  id: string;
  created_at: string;
  updated_at: string;
};

// Distinguishes "not found" (null return) from actual data store errors
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly collection: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
