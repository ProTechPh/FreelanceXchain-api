/**
 * The filter object stored on a saved search. Mirrors the live search API's
 * filters. For BOTH search types (`project` and `freelancer`) the `skills`
 * array accepts skill document IDs, skill names, or a mix — matching is
 * case-insensitive. Project searches additionally support `keyword`,
 * `minBudget`, and `maxBudget`; freelancer searches support `minHourlyRate`
 * and `maxHourlyRate`.
 */
export type SavedSearchFilters = Record<string, unknown>;

export type SavedSearch = {
  id: string;
  userId: string;
  name: string;
  searchType: 'project' | 'freelancer';
  filters: SavedSearchFilters;
  notifyOnNew: boolean;
  /** ISO timestamp of the last time matches were surfaced to the user (dedup watermark). */
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedSearchInput = {
  name: string;
  searchType: 'project' | 'freelancer';
  filters: SavedSearchFilters;
  notifyOnNew?: boolean;
};
