import { BaseRepository } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type FavoriteTargetType = 'project' | 'freelancer';

export type FavoriteEntity = {
  id: string;
  user_id: string;
  target_type: FavoriteTargetType;
  target_id: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'favorites';

function mapDoc(doc: Record<string, any>): FavoriteEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as FavoriteEntity;
}

export class FavoriteRepository extends BaseRepository<FavoriteEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string
  ): Promise<FavoriteEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.equal('target_type', targetType),
          Query.equal('target_id', targetId),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByUser(
    userId: string,
    targetType?: FavoriteTargetType
  ): Promise<FavoriteEntity[]> {
    const queries: any[] = [
      Query.equal('user_id', userId),
      Query.orderDesc('created_at'),
    ];
    if (targetType) {
      queries.push(Query.equal('target_type', targetType));
    }
    return this.listWithQueries<FavoriteEntity>(queries, mapDoc);
  }

  async removeByUserAndTarget(
    userId: string,
    targetType: FavoriteTargetType,
    targetId: string
  ): Promise<boolean> {
    const existing = await this.findByUserAndTarget(userId, targetType, targetId);
    if (!existing) return false;
    return this.delete(existing.id);
  }
}

export const favoriteRepository = new FavoriteRepository();
