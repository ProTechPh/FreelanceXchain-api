/**
 * Base Repository for PostgreSQL — STUB.
 * PostgreSQL is not used in this project. Use Appwrite repositories instead.
 */

import type { QueryOptions, PaginatedResult, BaseEntity } from './types.js';

export type { QueryOptions, PaginatedResult, BaseEntity };

const PG_ERR = 'PostgreSQL is not configured — use Appwrite repositories instead.';

export class BaseRepositoryPg<T extends BaseEntity> {
  constructor(_tableName: string) {
    // stub — no-op
  }

  getPool(): never { throw new Error(PG_ERR); }
  async create(): Promise<T> { throw new Error(PG_ERR); }
  async getById(): Promise<T | null> { throw new Error(PG_ERR); }
  async update(): Promise<T | null> { throw new Error(PG_ERR); }
  async delete(): Promise<boolean> { throw new Error(PG_ERR); }
  async findOne(): Promise<T | null> { throw new Error(PG_ERR); }
  async queryAll(): Promise<T[]> { throw new Error(PG_ERR); }
  async queryPaginated(): Promise<PaginatedResult<T>> { throw new Error(PG_ERR); }
  protected async executeQuery(): Promise<any> { throw new Error(PG_ERR); }
}

export { BaseRepositoryPg as BaseRepository };
export default BaseRepositoryPg;
