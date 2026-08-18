import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { Query } from '../config/appwrite.js';

type SavedSearchType = 'project' | 'freelancer';

export type SavedSearchEntity = {
  id: string;
  user_id: string;
  name: string;
  search_type: SavedSearchType;
  filters: string;
  notify_on_new: boolean;
  /** ISO timestamp of the last notification run (dedup watermark). */
  last_notified_at?: string | null;
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
    try {
      // fetchAll (cursor pagination) instead of listWithQueries: Appwrite's
      // default 25-doc page silently hid a user's older saved searches (the
      // default-page-size truncation class).
      return (await this.fetchAll(queries)).map(mapDoc);
    } catch {
      return [];
    }
  }

  async findOwnerById(id: string): Promise<string | null> {
    const doc = await this.getById(id);
    return doc ? doc.user_id ?? null : null;
  }

  /**
   * Saved searches that should notify on new matches. Errors propagate to the caller.
   */
  async findAllWithNotifyEnabled(): Promise<SavedSearchEntity[]> {
    // fetchAll instead of Query.limit(100): the scheduler must scan EVERY
    // notify-enabled saved search — the 101st+ were silently skipped (the
    // limit(1000) truncation class, at a lower cap). Errors still propagate
    // to the caller (scheduler job), as before.
    return this.fetchAll([
      Query.equal('notify_on_new', true),
    ]);
  }
}

export const savedSearchRepository = new SavedSearchRepository();
