export type SavedSearch = {
  id: string;
  userId: string;
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, any>;
  notifyOnNew: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SavedSearchEntity = {
  id: string;
  user_id: string;
  name: string;
  search_type: 'project' | 'freelancer';
  filters: Record<string, any>;
  notify_on_new: boolean;
  created_at: string;
  updated_at: string;
};

export type SavedSearchInput = {
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, any>;
  notifyOnNew?: boolean;
};
