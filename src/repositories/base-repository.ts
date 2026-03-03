import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient, TableName } from '../config/supabase.js';

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

export class BaseRepository<T extends BaseEntity> {
  protected tableName: TableName;
  protected client: SupabaseClient | null = null;

  constructor(tableName: TableName) {
    this.tableName = tableName;
  }

  protected getClient(): SupabaseClient {
    if (!this.client) {
      this.client = getSupabaseServiceClient();
    }
    return this.client;
  }

  async create(item: Omit<T, 'created_at' | 'updated_at'>): Promise<T> {
    const client = this.getClient();
    const now = new Date().toISOString();
    const itemWithTimestamps = {
      ...item,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await client
      .from(this.tableName)
      .insert(itemWithTimestamps)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create: ${error.message}`);
    return data as T;
  }

  async getById(id: string): Promise<T | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No rows returned
      throw new Error(`Failed to get by id: ${error.message}`);
    }
    return data as T;
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to update: ${error.message}`);
    }
    return data as T;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.getClient();
    // First check if the entity exists, since Supabase delete() returns
    // success with 0 affected rows when no match is found (no PGRST116).
    const existing = await this.getById(id);
    if (!existing) return false;

    const { error } = await client
      .from(this.tableName)
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new Error(`Failed to delete: ${error.message}`);
    }
    return true;
  }

  async findOne(column: string, value: unknown): Promise<T | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq(column, value)
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find: ${error.message}`);
    }
    return data as T;
  }

  async queryAll(orderBy = 'created_at', ascending = false): Promise<T[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .order(orderBy, { ascending });
    
    if (error) throw new Error(`Failed to query: ${error.message}`);
    return (data ?? []) as T[];
  }

  async queryPaginated(options?: QueryOptions, orderBy = 'created_at', ascending = false): Promise<PaginatedResult<T>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order(orderBy, { ascending })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to query: ${error.message}`);
    
    return {
      items: (data ?? []) as T[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }
}
