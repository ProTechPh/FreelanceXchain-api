/**
 * Base Repository
 * Provides CRUD operations for the database
 */

import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import type { QueryOptions, PaginatedResult, BaseEntity } from './types.js';

export type { QueryOptions, PaginatedResult, BaseEntity } from './types.js';
export { RepositoryError } from './types.js';

// -- Serialization helpers --------------------------------------

/**
 * Attempt to deserialize a value that was JSON.stringify'd before storage.
 * Returns the original string if parsing fails or isn't plausible JSON.
 */
function deserializeIfNeeded(value: string): string | unknown {
  const trimmed = value.trimStart();
  const looksLikeJson =
    (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
    (trimmed.includes('"') || trimmed.startsWith('['));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Attributes defined with `array: true` in Appwrite schema that accept native string arrays.
 * All other array and object fields are serialized as JSON strings before storage.
 */
const NATIVE_ARRAY_ATTRIBUTES = new Set(['required_skill_ids', 'requester_ids']);

/**
 * Serialize an attribute value for Appwrite storage.
 * Objects and non-native arrays are JSON.stringify'd; primitives and native Appwrite arrays pass through.
 */
function serializeAttributeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (NATIVE_ARRAY_ATTRIBUTES.has(key) && Array.isArray(value)) {
    return value;
  }
  return typeof value === 'object' ? JSON.stringify(value) : value;
}

// -- Document mapping -------------------------------------------

/**
 * Map an Appwrite document to a domain entity.
 * Strips Appwrite-internal fields ($id, $collectionId, etc.) and
 * reverses JSON serialization done by create()/update().
 */
function mapDocument<T extends BaseEntity>(doc: Record<string, unknown>): T {
  const { $collectionId: _cid, $databaseId: _did, ...rest } = doc;
  const result = fromAppwriteDoc<Record<string, unknown>>(rest);

  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string') {
      result[key] = deserializeIfNeeded(value);
    }
  }

  return result as T;
}

function mapDocuments<T extends BaseEntity>(docs: Record<string, unknown>[]): T[] {
  return docs.map(doc => mapDocument<T>(doc));
}

/**
 * Map an Appwrite document into an entity-shaped object.
 * Strips Appwrite-internal fields and falls back to system timestamps
 * when the document does not carry its own created_at/updated_at.
 */
export function fromAppwriteDoc<T = Record<string, unknown>>(doc: Record<string, unknown>): T {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as T;
}

export class BaseRepository<T extends BaseEntity> {
  protected collectionId: string;
  protected collectionName: string;

  constructor(collectionId: string, collectionName?: string) {
    this.collectionId = collectionId;
    this.collectionName = collectionName || collectionId;
  }

  protected mapDoc(doc: Record<string, unknown>): T {
    return mapDocument<T>(doc);
  }

  /**
   * Wraps a database query with timing logs to identify slow queries.
   * Logs queries taking >100ms as warnings, others as debug.
   */
  protected async timedQuery<U>(
    operationName: string,
    fn: () => Promise<U>
  ): Promise<U> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      if (duration > 100) {
        logger.warn(`Slow query [${this.collectionName}.${operationName}]: ${duration.toFixed(2)}ms`);
      } else {
        logger.debug(`Query [${this.collectionName}.${operationName}]: ${duration.toFixed(2)}ms`);
      }
    }
  }

  async create(item: Omit<T, 'created_at' | 'updated_at' | 'id'> & { id?: string }): Promise<T> {
    const { id, ...data } = item as Record<string, unknown>;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'created_at' && key !== 'updated_at' && value !== undefined) {
        attrs[key] = serializeAttributeValue(key, value);
      }
    }

    const doc = await this.timedQuery('create', () =>
      databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        (id as string) || ID.unique(),
        attrs
      )
    );
    return mapDocument<T>(doc);
  }

  async getById(id: string): Promise<T | null> {
    try {
      const doc = await this.timedQuery('getById', () =>
        databases.getDocument(DATABASE_ID, this.collectionId, id)
      );
      return mapDocument<T>(doc);
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.getById`, { id, error });
      return null;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    try {
      const attrs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
        if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
        if (value !== undefined) {
          attrs[key] = serializeAttributeValue(key, value);
        }
      }

      const doc = await this.timedQuery('update', () =>
        databases.updateDocument(
          DATABASE_ID,
          this.collectionId,
          id,
          attrs
        )
      );
      return mapDocument<T>(doc);
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.update`, { id, error });
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.timedQuery('delete', () =>
        databases.deleteDocument(DATABASE_ID, this.collectionId, id)
      );
      return true;
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.delete`, { id, error });
      return false;
    }
  }

  async findOne(column: string, value: unknown): Promise<T | null> {
    try {
      const response = await this.timedQuery('findOne', () =>
        databases.listDocuments(
          DATABASE_ID,
          this.collectionId,
          [Query.equal(column, value as string | number | boolean), Query.limit(1)]
        )
      );
      return response.documents.length > 0 ? mapDocument<T>(response.documents[0]!) : null;
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.findOne`, { column, error });
      return null;
    }
  }

  async queryAll(orderBy: string = '$createdAt', ascending: boolean = false): Promise<T[]> {
    try {
      return await this.fetchAll([ascending ? Query.orderAsc(orderBy) : Query.orderDesc(orderBy)]);
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.queryAll`, { error });
      return [];
    }
  }

  /**
   * Fetch ALL documents matching the given queries, using cursor-based pagination.
   * Replaces the `Query.limit(1000)` pattern that silently loses data past 1000 records.
   */
  protected async fetchAll(baseQueries: string[] = [], pageSize = 100): Promise<T[]> {
    const allDocs: Record<string, unknown>[] = [];
    await this.fetchInBatches(baseQueries, pageSize, (batchDocs) => {
      allDocs.push(...batchDocs);
    });
    return mapDocuments<T>(allDocs);
  }

  /**
   * Stream documents matching queries in batches using cursor-based pagination.
   * Enables batch-by-batch processing to prevent memory spikes on large collections.
   */
  protected async fetchInBatches(
    baseQueries: string[] = [],
    pageSize = 100,
    callback: (batchDocs: Record<string, unknown>[]) => Promise<boolean | void> | boolean | void
  ): Promise<void> {
    let lastId: string | undefined;

    while (true) {
      const queries = [...baseQueries, Query.limit(pageSize)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const response = await this.timedQuery('fetchInBatches.listDocuments', () =>
        databases.listDocuments(DATABASE_ID, this.collectionId, queries)
      );
      const shouldStop = await callback(response.documents);
      if (shouldStop === false) break;

      if (response.documents.length < pageSize) break;
      lastId = response.documents[response.documents.length - 1]?.$id;
      if (!lastId) break;
    }
  }

  async queryPaginated(
    options: QueryOptions = {},
    orderBy: string = '$createdAt',
    ascending: boolean = false
  ): Promise<PaginatedResult<T>> {
    const { limit = 20, offset = 0 } = options;

    try {
      const queries = [
        ascending ? Query.orderAsc(orderBy) : Query.orderDesc(orderBy),
        Query.limit(limit),
        Query.offset(offset),
      ];

      const response = await this.timedQuery('queryPaginated', () =>
        databases.listDocuments(
          DATABASE_ID,
          this.collectionId,
          queries
        )
      );

      return {
        items: mapDocuments<T>(response.documents),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.queryPaginated`, { error });
      return { items: [], hasMore: false, total: 0 };
    }
  }

  // --- Query helpers ------------------------------------------

  protected async listWithQueries<U = T>(
    queries: string[], // Query[] at runtime � Appwrite SDK types Query as non-string but methods return strings
    mapper?: (doc: Record<string, unknown>) => U
  ): Promise<U[]> {
    try {
      const response = await this.timedQuery('listWithQueries', () =>
        databases.listDocuments(
          DATABASE_ID,
          this.collectionId,
          queries
        )
      );
      return mapper
        ? response.documents.map(mapper)
        : mapDocuments<T>(response.documents) as unknown as U[];
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.listWithQueries`, { error });
      return [];
    }
  }

  protected async countWithQueries(queries: string[]): Promise<number> {
    try {
      const response = await this.timedQuery('countWithQueries', () =>
        databases.listDocuments(
          DATABASE_ID,
          this.collectionId,
          [...queries, Query.limit(1)]
        )
      );
      return response.total;
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.countWithQueries`, { error });
      return 0;
    }
  }

  protected async paginatedWithQueries<U = T>(
    queries: string[],
    limit: number,
    offset: number,
    mapper?: (doc: Record<string, unknown>) => U
  ): Promise<PaginatedResult<U>> {
    try {
      const response = await this.timedQuery('paginatedWithQueries', () =>
        databases.listDocuments(
          DATABASE_ID,
          this.collectionId,
          [...queries, Query.limit(limit), Query.offset(offset)]
        )
      );

      const items = (mapper
        ? response.documents.map(mapper)
        : mapDocuments<T>(response.documents) as unknown as U[]
      ).slice(0, limit);

      const hasMore = offset + items.length < response.total;

      return {
        items,
        hasMore,
        total: response.total,
      };
    } catch (error) {
      logger.error(`Repository error in ${this.collectionId}.paginatedWithQueries`, { error });
      return { items: [], hasMore: false, total: 0 };
    }
  }
}
