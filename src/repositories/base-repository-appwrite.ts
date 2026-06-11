/**
 * Base Repository for Appwrite Database
 * Provides CRUD operations using Appwrite SDK
 */

import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import type { QueryOptions, PaginatedResult, BaseEntity } from './types.js';

export type { QueryOptions, PaginatedResult, BaseEntity } from './types.js';

// Map Appwrite document to entity (remove $ prefixed fields)
function mapDocument<T extends BaseEntity>(doc: Record<string, any>): T {
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, ...attrs } = doc;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
  };
  const created = attrs.created_at ?? $createdAt;
  const updated = attrs.updated_at ?? $updatedAt;
  if (created !== undefined) result.created_at = created;
  if (updated !== undefined) result.updated_at = updated;
  return result as T;
}

function mapDocuments<T extends BaseEntity>(docs: Record<string, any>[]): T[] {
  return docs.map(doc => mapDocument<T>(doc));
}

export class BaseRepositoryAppwrite<T extends BaseEntity> {
  protected collectionId: string;

  constructor(collectionId: string) {
    this.collectionId = collectionId;
  }

  async create(item: Omit<T, 'created_at' | 'updated_at'>): Promise<T> {
    const { id, ...data } = item as any;
    const attrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
    }
    attrs.created_at = new Date().toISOString();
    attrs.updated_at = new Date().toISOString();

    const doc = await databases.createDocument(
      DATABASE_ID,
      this.collectionId,
      id || ID.unique(),
      attrs
    );
    return mapDocument<T>(doc);
  }

  async getById(id: string): Promise<T | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, this.collectionId, id);
      return mapDocument<T>(doc);
    } catch {
      return null;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    try {
      const attrs: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'created_at') continue;
        if (value !== undefined) {
          attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
        }
      }
      attrs.updated_at = new Date().toISOString();

      const doc = await databases.updateDocument(
        DATABASE_ID,
        this.collectionId,
        id,
        attrs
      );
      return mapDocument<T>(doc);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await databases.deleteDocument(DATABASE_ID, this.collectionId, id);
      return true;
    } catch {
      return false;
    }
  }

  async findOne(column: string, value: unknown): Promise<T | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [Query.equal(column, value as any), Query.limit(1)]
      );
      return response.documents.length > 0 ? mapDocument<T>(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async queryAll(orderBy: string = 'created_at', ascending: boolean = false): Promise<T[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          ascending ? Query.orderAsc(orderBy) : Query.orderDesc(orderBy),
          Query.limit(1000),
        ]
      );
      return mapDocuments<T>(response.documents);
    } catch {
      return [];
    }
  }

  async queryPaginated(
    options: QueryOptions = {},
    orderBy: string = 'created_at',
    ascending: boolean = false
  ): Promise<PaginatedResult<T>> {
    const { limit = 20, offset = 0 } = options;

    try {
      const queries = [
        ascending ? Query.orderAsc(orderBy) : Query.orderDesc(orderBy),
        Query.limit(limit),
        Query.offset(offset),
      ];

      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        queries
      );

      return {
        items: mapDocuments<T>(response.documents),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  // ─── Appwrite-specific helpers ──────────────────────────────────────────

  protected async listWithQueries<U = T>(
    queries: any[],
    mapper?: (doc: Record<string, any>) => U
  ): Promise<U[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        queries
      );
      return mapper
        ? response.documents.map(mapper)
        : mapDocuments<T>(response.documents) as unknown as U[];
    } catch {
      return [];
    }
  }

  protected async countWithQueries(queries: any[]): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [...queries, Query.limit(1)]
      );
      return response.total;
    } catch {
      return 0;
    }
  }

  protected async paginatedWithQueries<U = T>(
    queries: any[],
    limit: number,
    offset: number,
    mapper?: (doc: Record<string, any>) => U
  ): Promise<PaginatedResult<U>> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [...queries, Query.limit(limit), Query.offset(offset)]
      );

      return {
        items: mapper
          ? response.documents.map(mapper)
          : mapDocuments<T>(response.documents) as unknown as U[],
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }
}
