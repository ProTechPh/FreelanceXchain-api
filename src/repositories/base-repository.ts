import { Container, SqlQuerySpec } from '@azure/cosmos';
import { getContainer, CollectionName } from '../config/database.js';

export type QueryOptions = {
  maxItemCount?: number;
  continuationToken?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  continuationToken?: string;
  hasMore: boolean;
};

export type BaseEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export class BaseRepository<T extends BaseEntity> {
  protected containerName: CollectionName;
  protected container: Container | null = null;

  constructor(containerName: CollectionName) {
    this.containerName = containerName;
  }

  protected async getContainer(): Promise<Container> {
    if (!this.container) {
      this.container = await getContainer(this.containerName);
    }
    return this.container;
  }

  async create(item: T, _partitionKeyValue: string): Promise<T> {
    const container = await this.getContainer();
    const now = new Date().toISOString();
    const itemWithTimestamps = {
      ...item,
      createdAt: now,
      updatedAt: now,
    };
    const { resource } = await container.items.create(itemWithTimestamps);
    return resource as T;
  }

  async getById(id: string, partitionKeyValue: string): Promise<T | null> {
    const container = await this.getContainer();
    try {
      const { resource } = await container.item(id, partitionKeyValue).read<T>();
      return resource ?? null;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: number }).code === 404) {
        return null;
      }
      throw error;
    }
  }

  async update(id: string, partitionKeyValue: string, updates: Partial<T>): Promise<T | null> {
    const container = await this.getContainer();
    const existing = await this.getById(id, partitionKeyValue);
    if (!existing) {
      return null;
    }
    const updatedItem = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    };
    const { resource } = await container.item(id, partitionKeyValue).replace(updatedItem);
    return resource as T;
  }

  async delete(id: string, partitionKeyValue: string): Promise<boolean> {
    const container = await this.getContainer();
    try {
      await container.item(id, partitionKeyValue).delete();
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: number }).code === 404) {
        return false;
      }
      throw error;
    }
  }

  async query(querySpec: SqlQuerySpec, options?: QueryOptions): Promise<PaginatedResult<T>> {
    const container = await this.getContainer();
    const feedOptions: { maxItemCount: number; continuationToken?: string } = {
      maxItemCount: options?.maxItemCount ?? 100,
    };
    if (options?.continuationToken) {
      feedOptions.continuationToken = options.continuationToken;
    }
    const { resources, continuationToken } = await container.items
      .query<T>(querySpec, feedOptions)
      .fetchNext();

    return {
      items: resources,
      continuationToken,
      hasMore: !!continuationToken,
    };
  }

  async queryAll(querySpec: SqlQuerySpec): Promise<T[]> {
    const container = await this.getContainer();
    const { resources } = await container.items.query<T>(querySpec).fetchAll();
    return resources;
  }

  async findOne(querySpec: SqlQuerySpec): Promise<T | null> {
    const result = await this.query(querySpec, { maxItemCount: 1 });
    return result.items[0] ?? null;
  }
}
