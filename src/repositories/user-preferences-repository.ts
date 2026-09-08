import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';
import type { UserPreferences, UpdateUserPreferencesInput } from '../models/user-preferences.js';

export type UserPreferencesEntity = {
  id: string;
  user_id: string;
  tour_progress?: string; // JSON stringified
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'user_preferences';

export class UserPreferencesRepository extends BaseRepository<UserPreferencesEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  /**
   * Get user preferences by user ID
   */
  async findByUserId(userId: string): Promise<UserPreferences | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.equal('user_id', userId), Query.limit(1)]
      );
      
      if (response.documents.length === 0) return null;
      
      return this.mapToModel(fromAppwriteDoc<UserPreferencesEntity>(response.documents[0]!));
    } catch (error) {
      throw new Error(`Failed to get user preferences: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /**
   * Create default preferences for a user
   */
  async createDefault(userId: string): Promise<UserPreferences> {
    const entity = await this.create({
      user_id: userId,
      tour_progress: JSON.stringify({}),
    });
    return this.mapToModel(entity);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, updates: UpdateUserPreferencesInput): Promise<UserPreferences | null> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      // Create if doesn't exist then apply updates
      await this.createDefault(userId);
      return this.updatePreferences(userId, updates);
    }

    const entity: Partial<UserPreferencesEntity> = {};
    
    if (updates.tourProgress !== undefined) {
      entity.tour_progress = JSON.stringify(updates.tourProgress);
    }

    // Get the entity ID from the existing record
    const existingEntity = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [Query.equal('user_id', userId), Query.limit(1)]
    );
    
    if (existingEntity.documents.length === 0) return null;
    
    const docId = existingEntity.documents[0]!.$id;
    const updated = await this.update(docId, entity);
    return this.mapToModel(updated!);
  }

  /**
   * Map database entity to domain model
   */
  private mapToModel(entity: UserPreferencesEntity): UserPreferences {
    let tourProgress = {};
    try {
      if (entity.tour_progress) {
        tourProgress = JSON.parse(entity.tour_progress);
      }
    } catch {
      tourProgress = {};
    }

    return {
      id: entity.id,
      userId: entity.user_id,
      tourProgress,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    };
  }
}

export const userPreferencesRepository = new UserPreferencesRepository();
