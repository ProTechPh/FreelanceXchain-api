export type SavedSearch = {
  id: string;
  userId: string;
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, unknown>;
  notifyOnNew: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SavedSearchInput = {
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, unknown>;
  notifyOnNew?: boolean;
};
