import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { Query } from '../config/appwrite.js';

export type SavedSearchType = 'project' | 'freelancer';

export type SavedSearchEntity = {
  id: string;
  user_id: string;
  name: string;
  search_type: SavedSearchType;
  filters: string;
  notify_on_new: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'saved_searches';

function mapDoc(doc: Record<string, unknown>): SavedSearchEntity {
  return fromAppwriteDoc<SavedSearchEntity>(doc);
}

export class SavedSearchRepository extends BaseRepository<SavedSearchEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByUser(userId: string, searchType?: SavedSearchType): Promise<SavedSearchEntity[]> {
    const queries: string[] = [
      Query.equal('user_id', userId),
      Query.orderDesc('created_at'),
    ];
    if (searchType) {
      queries.push(Query.equal('search_type', searchType));
    }
    return this.listWithQueries<SavedSearchEntity>(queries, mapDoc);
  }

  async findOwnerById(id: string): Promise<string | null> {
    const doc = await this.getById(id);
    return doc ? doc.user_id ?? null : null;
  }
}

export const savedSearchRepository = new SavedSearchRepository();
