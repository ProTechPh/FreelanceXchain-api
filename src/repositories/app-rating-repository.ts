import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';
import type { AppRating, AppRatingEntity, AppRatingSource } from '../models/app-rating.js';

const COLLECTION_ID = 'app_ratings';

export type AppRatingFilters = {
  source?: string | undefined;
  rating?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

/** Appwrite caps a single listDocuments page; the admin table pages under it. */
const MAX_PAGE_SIZE = 100;

export class AppRatingRepository extends BaseRepository<AppRatingEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  /** The user's most recent rating, or null if they have never rated. */
  async findLatestByUser(userId: string): Promise<AppRating | null> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('user_id', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]);

      if (response.documents.length === 0) return null;

      return mapToModel(fromAppwriteDoc<AppRatingEntity>(response.documents[0]!));
    } catch (error) {
      throw new Error(`Failed to get latest app rating: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /** Every rating a user has left, newest first. */
  async findAllByUser(userId: string): Promise<AppRating[]> {
    const docs = await this.listWithQueries<AppRatingEntity>(
      [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(MAX_PAGE_SIZE)],
      doc => fromAppwriteDoc<AppRatingEntity>(doc)
    );
    return docs.map(mapToModel);
  }

  /**
   * Whether this user already rated off the back of this exact event.
   *
   * `manual` ratings carry no context id, so they never suppress a later
   * event-driven prompt through this path.
   */
  async hasRatedForContext(userId: string, source: AppRatingSource, contextId: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('user_id', userId),
        Query.equal('source', source),
        Query.equal('context_id', contextId),
        Query.limit(1),
      ]);
      return response.total > 0;
    } catch (error) {
      throw new Error(`Failed to check app rating context: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /** Filtered page for the admin table, newest first. */
  async listAll(filters: AppRatingFilters = {}): Promise<{ ratings: AppRating[]; total: number }> {
    const queries: string[] = [];
    if (filters.source) queries.push(Query.equal('source', filters.source));
    if (filters.rating !== undefined) queries.push(Query.equal('rating', filters.rating));

    const limit = Math.min(filters.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = filters.offset ?? 0;

    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        ...queries,
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ]);

      return {
        ratings: response.documents.map(doc => mapToModel(fromAppwriteDoc<AppRatingEntity>(doc))),
        total: response.total,
      };
    } catch (error) {
      throw new Error(`Failed to list app ratings: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /**
   * Every rating, for the summary figures.
   *
   * The aggregate is computed in the service rather than the database because
   * Appwrite has no aggregation, and platform feedback is low-volume by nature
   * — one rating per user per 30 days.
   */
  async fetchAllForSummary(): Promise<AppRating[]> {
    const docs = await this.fetchAll([Query.orderDesc('$createdAt')]);
    return docs.map(mapToModel);
  }

  async createRating(entity: Omit<AppRatingEntity, 'id' | 'created_at' | 'updated_at'>): Promise<AppRating> {
    const created = await this.create(entity);
    return mapToModel(created);
  }
}

/** Map database entity to domain model. */
function mapToModel(entity: AppRatingEntity): AppRating {
  return {
    id: entity.id,
    userId: entity.user_id,
    userRole: entity.user_role,
    rating: entity.rating,
    comment: entity.comment,
    source: entity.source as AppRatingSource,
    contextId: entity.context_id,
    appVersion: entity.app_version,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export const appRatingRepository = new AppRatingRepository();
