import { Pool, QueryResult } from 'pg';
import { pool } from '../config/database.js';

export type QueryOptions = {
  limit?: number;
  offset?: number;
  // Legacy pagination options for backward compatibility
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

/**
 * Base Repository for PostgreSQL
 * Replaces Appwrite client with direct PostgreSQL queries
 */
export class BaseRepositoryPg<T extends BaseEntity> {
  protected tableName: string;
  protected pool: Pool;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.pool = pool;
  }

  protected getPool(): Pool {
    return this.pool;
  }

  /**
   * Create a new record
   */
  async create(item: Omit<T, 'created_at' | 'updated_at'>): Promise<T> {
    const now = new Date().toISOString();
    const itemWithTimestamps = {
      ...item,
      created_at: now,
      updated_at: now,
    };

    const keys = Object.keys(itemWithTimestamps);
    const values = Object.values(itemWithTimestamps);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0] as T;
    } catch (error: any) {
      throw new Error(`Failed to create in ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Get a record by ID
   */
  async getById(id: string): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    
    try {
      const result = await this.pool.query(query, [id]);
      return result.rows.length > 0 ? (result.rows[0] as T) : null;
    } catch (error: any) {
      throw new Error(`Failed to get by id from ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Update a record by ID
   */
  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const updatesWithTimestamp = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const keys = Object.keys(updatesWithTimestamp);
    const values = Object.values(updatesWithTimestamp);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await this.pool.query(query, [id, ...values]);
      return result.rows.length > 0 ? (result.rows[0] as T) : null;
    } catch (error: any) {
      throw new Error(`Failed to update in ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    // First check if the entity exists
    const existing = await this.getById(id);
    if (!existing) return false;

    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    
    try {
      await this.pool.query(query, [id]);
      return true;
    } catch (error: any) {
      throw new Error(`Failed to delete from ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Find one record by column value
   */
  async findOne(column: string, value: unknown): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE ${column} = $1 LIMIT 1`;
    
    try {
      const result = await this.pool.query(query, [value]);
      return result.rows.length > 0 ? (result.rows[0] as T) : null;
    } catch (error: any) {
      throw new Error(`Failed to find in ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Query all records with ordering
   */
  async queryAll(orderBy = 'created_at', ascending = false): Promise<T[]> {
    const direction = ascending ? 'ASC' : 'DESC';
    const query = `
      SELECT * FROM ${this.tableName}
      ORDER BY ${orderBy} ${direction}
      LIMIT 1000
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as T[];
    } catch (error: any) {
      throw new Error(`Failed to query ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Query records with pagination
   */
  async queryPaginated(
    options?: QueryOptions,
    orderBy = 'created_at',
    ascending = false
  ): Promise<PaginatedResult<T>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const direction = ascending ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM ${this.tableName}`;
    const countResult = await this.pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const dataQuery = `
      SELECT * FROM ${this.tableName}
      ORDER BY ${orderBy} ${direction}
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [limit, offset]);
      
      return {
        items: result.rows as T[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to query paginated ${this.tableName}: ${error.message}`);
    }
  }

  /**
   * Execute a custom query
   */
  protected async executeQuery<R = any>(query: string, params: any[] = []): Promise<QueryResult<any>> {
    try {
      return await this.pool.query(query, params);
    } catch (error: any) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }
}

// Export the class as both default and named export for compatibility
export { BaseRepositoryPg as BaseRepository };
export default BaseRepositoryPg;
