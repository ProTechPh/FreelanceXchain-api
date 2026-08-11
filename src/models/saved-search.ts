export type SavedSearch = {
  id: string;
  userId: string;
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, unknown>;
  notifyOnNew: boolean;
  /** ISO timestamp of the last time matches were surfaced to the user (dedup watermark). */
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedSearchInput = {
  name: string;
  searchType: 'project' | 'freelancer';
  filters: Record<string, unknown>;
  notifyOnNew?: boolean;
};
