/**
 * Shared repository types — used by both Appwrite and (legacy) PostgreSQL repositories.
 */

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
