import { logger } from '../config/logger.js';
import { SavedSearch, SavedSearchInput } from '../models/saved-search.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { savedSearchRepository, type SavedSearchEntity } from '../repositories/saved-search-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
import { freelancerProfileRepository, type FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { safeJsonParse } from '../utils/index.js';
import { resolveSkillFilterToNames } from './search-service.js';

/**
 * Fetch ALL open projects using offset pagination (no 1000-row truncation).
 */
async function fetchAllOpenProjects(): Promise<ProjectEntity[]> {
  const all: ProjectEntity[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const page = await projectRepository.getAllOpenProjects({ limit: PAGE_SIZE, offset });
    all.push(...page.items);
    if (!page.hasMore || page.items.length === 0) break;
    offset += page.items.length;
  }
  return all;
}

/**
 * Fetch ALL freelancer profiles using offset pagination (no 1000-row truncation).
 */
async function fetchAllProfiles(): Promise<FreelancerProfileEntity[]> {
  const all: FreelancerProfileEntity[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const page = await freelancerProfileRepository.getAllProfilesPaginated({ limit: PAGE_SIZE, offset });
    all.push(...page.items);
    if (!page.hasMore || page.items.length === 0) break;
    offset += page.items.length;
  }
  return all;
}

function mapSavedSearchFromEntity(entity: SavedSearchEntity): SavedSearch {
  return {
    id: entity.id,
    userId: entity.user_id,
    name: entity.name,
    searchType: entity.search_type,
    filters: safeJsonParse<Record<string, unknown>>(entity.filters),
    notifyOnNew: entity.notify_on_new,
    lastNotifiedAt: entity.last_notified_at ?? null,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

/**
 * Apply a saved search's filters to a list of open projects.
 * Shared by the REST executeSavedSearch and the scheduler's notify job so
 * both agree on what matches (skills, budget range, keyword, status).
 */
export function filterProjectsBySavedSearch(
  projects: ProjectEntity[],
  filters: Record<string, unknown>
): ProjectEntity[] {
  let filtered = projects;

  if (filters.skills && Array.isArray(filters.skills)) {
    const filterSkillSet = new Set(filters.skills.map((s: unknown) => String(s).toLowerCase()));
    // Projects store both the skill document ID and its name on each
    // required-skill ref, so accept either (the live search API documents IDs).
    filtered = filtered.filter(p =>
      p.required_skills?.some((s: { skill_id?: string; skill_name?: string; name?: string }) =>
        filterSkillSet.has((s.skill_id || '').toLowerCase()) ||
        filterSkillSet.has((s.skill_name || s.name || '').toLowerCase())
      )
    );
  }
  if (filters.minBudget !== undefined && filters.minBudget !== null) {
    const min = Number(filters.minBudget);
    filtered = filtered.filter(p => p.budget >= min);
  }
  if (filters.maxBudget !== undefined && filters.maxBudget !== null) {
    const max = Number(filters.maxBudget);
    filtered = filtered.filter(p => p.budget <= max);
  }
  if (filters.keyword) {
    const kw = String(filters.keyword).toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw)
    );
  }
  return filtered;
}

/**
 * Apply a saved search's filters to a list of freelancer profiles.
 * Shared by the REST executeSavedSearch and the scheduler's notify job.
 */
export function filterFreelancersBySavedSearch(
  profiles: FreelancerProfileEntity[],
  filters: Record<string, unknown>
): FreelancerProfileEntity[] {
  let filtered = profiles;

  if (filters.skills && Array.isArray(filters.skills)) {
    const filterSkillSet = new Set(filters.skills.map((s: unknown) => String(s).toLowerCase()));
    filtered = filtered.filter(fp =>
      fp.skills?.some((s) => filterSkillSet.has((s.name || '').toLowerCase()))
    );
  }
  if (filters.minHourlyRate !== undefined && filters.minHourlyRate !== null) {
    const min = Number(filters.minHourlyRate);
    filtered = filtered.filter(fp => fp.hourly_rate >= min);
  }
  if (filters.maxHourlyRate !== undefined && filters.maxHourlyRate !== null) {
    const max = Number(filters.maxHourlyRate);
    filtered = filtered.filter(fp => fp.hourly_rate <= max);
  }
  return filtered;
}

/**
 * Create a saved search
 */
export async function createSavedSearch(
  userId: string,
  input: SavedSearchInput
): Promise<ServiceResult<SavedSearch>> {
  try {
    if (!input.filters || Object.keys(input.filters).length === 0) {
      return errorResult('VALIDATION_ERROR', 'Search filters are required');
    }

    const created = await savedSearchRepository.create({
      user_id: userId,
      name: input.name,
      search_type: input.searchType,
      filters: JSON.stringify(input.filters),
      notify_on_new: input.notifyOnNew || false,
    });

    return successResult(mapSavedSearchFromEntity(created));
  } catch (error) {
    logger.error('Unexpected error in createSavedSearch', { error, userId, input });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get user's saved searches
 */
export async function getUserSavedSearches(
  userId: string,
  searchType?: 'project' | 'freelancer'
): Promise<ServiceResult<SavedSearch[]>> {
  try {
    const results = await savedSearchRepository.findByUser(userId, searchType);

    return successResult(results.map(mapSavedSearchFromEntity));
  } catch (error) {
    logger.error('Unexpected error in getUserSavedSearches', { error, userId, searchType });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Update a saved search
 */
export async function updateSavedSearch(
  searchId: string,
  userId: string,
  updates: Partial<SavedSearchInput>
): Promise<ServiceResult<SavedSearch>> {
  try {
    const ownerId = await savedSearchRepository.findOwnerById(searchId);

    if (ownerId === null) {
      return errorResult('NOT_FOUND', 'Saved search not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only update your own saved searches');
    }

    const updateData: Partial<SavedSearchEntity> = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.filters) updateData.filters = JSON.stringify(updates.filters);
    if (updates.notifyOnNew !== undefined) updateData.notify_on_new = updates.notifyOnNew;

    if (Object.keys(updateData).length === 0) {
      const existing = await savedSearchRepository.getById(searchId);
      return successResult(mapSavedSearchFromEntity(existing!));
    }

    const updated = await savedSearchRepository.update(searchId, updateData);

    if (!updated) {
      return errorResult('NOT_FOUND', 'Saved search not found');
    }

    return successResult(mapSavedSearchFromEntity(updated));
  } catch (error) {
    logger.error('Unexpected error in updateSavedSearch', { error, searchId, userId, updates });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(
  searchId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    const ownerId = await savedSearchRepository.findOwnerById(searchId);

    if (ownerId === null) {
      return errorResult('NOT_FOUND', 'Saved search not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only delete your own saved searches');
    }

    await savedSearchRepository.delete(searchId);

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in deleteSavedSearch', { error, searchId, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Execute a saved search
 */
export async function executeSavedSearch(
  searchId: string,
  userId: string
): Promise<ServiceResult<{ results: ProjectEntity[] | FreelancerProfileEntity[]; count: number }>> {
  try {
    const savedSearchDoc = await savedSearchRepository.getById(searchId);

    if (!savedSearchDoc) {
      return errorResult('NOT_FOUND', 'Saved search not found');
    }

    if (savedSearchDoc.user_id !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only execute your own saved searches');
    }

    const filters = safeJsonParse<Record<string, unknown>>(savedSearchDoc.filters);
    // Filters are client-supplied JSON — treat numeric fields as number (runtime coercion preserved).
    const searchType = savedSearchDoc.search_type;

    // Execute search based on type. All open candidates are fetched via cursor
    // pagination so results are not silently truncated at 1000 rows.
    if (searchType === 'project') {
      const allProjects = await fetchAllOpenProjects();
      const filtered = filterProjectsBySavedSearch(allProjects, filters);

      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const results = filtered.slice(0, 50);

      return successResult({
        results,
        count: results.length,
      });
    }

    const allProfiles = await fetchAllProfiles();
    // Profiles store skills by name, but saved-search filters may contain skill
    // IDs (the live search API accepts both) — resolve IDs to names first so a
    // saved search with IDs matches instead of silently returning nothing.
    const resolvedFilters = { ...filters };
    if (Array.isArray(resolvedFilters.skills)) {
      resolvedFilters.skills = await resolveSkillFilterToNames(
        resolvedFilters.skills.map((s: unknown) => String(s))
      );
    }
    const filtered = filterFreelancersBySavedSearch(allProfiles, resolvedFilters);

    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const results = filtered.slice(0, 50);

    return successResult({
      results,
      count: results.length,
    });
  } catch (error) {
    logger.error('Unexpected error in executeSavedSearch', { error, searchId, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
