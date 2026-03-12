export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, any>;
  notifyOnNew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedSearchEntity {
  id: string;
  user_id: string;
  name: string;
  search_type: 'project' | 'freelancer';
  filters: Record<string, any>;
  notify_on_new: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchInput {
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, any>;
  notifyOnNew?: boolean;
}
