import { logger } from '../config/logger.js';
import { SavedSearch, SavedSearchInput } from '../models/saved-search.js';
import type { ServiceResult } from '../types/service-result.js';
import { savedSearchRepository } from '../repositories/saved-search-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';

/**
 * Create a saved search
 */
export async function createSavedSearch(
  userId: string,
  input: SavedSearchInput
): Promise<ServiceResult<SavedSearch>> {
  try {
    // Validate filters
    if (!input.filters || Object.keys(input.filters).length === 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search filters are required',
        },
      };
    }

    const created = await savedSearchRepository.create({
      user_id: userId,
      name: input.name,
      search_type: input.searchType,
      filters: JSON.stringify(input.filters),
      notify_on_new: input.notifyOnNew || false,
    } as any);

    return {
      success: true,
      data: {
        id: created.id,
        userId: created.user_id,
        name: created.name,
        searchType: created.search_type,
        filters: typeof created.filters === 'string' ? JSON.parse(created.filters) : created.filters,
        notifyOnNew: created.notify_on_new,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      } as SavedSearch,
    };
  } catch (error) {
    logger.error('Unexpected error in createSavedSearch', { error, userId, input });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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

    return {
      success: true,
      data: results.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        searchType: row.search_type,
        filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
        notifyOnNew: row.notify_on_new,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } as SavedSearch)),
    };
  } catch (error) {
    logger.error('Unexpected error in getUserSavedSearches', { error, userId, searchType });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
    // Verify ownership
    const ownerId = await savedSearchRepository.findOwnerById(searchId);

    if (ownerId === null) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Saved search not found' },
      };
    }

    if (ownerId !== userId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You can only update your own saved searches' },
      };
    }

    // Build update data
    const updateData: Record<string, any> = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.filters) updateData.filters = JSON.stringify(updates.filters);
    if (updates.notifyOnNew !== undefined) updateData.notify_on_new = updates.notifyOnNew;

    if (Object.keys(updateData).length === 0) {
      const existing = await savedSearchRepository.getById(searchId);
      return {
        success: true,
        data: {
          id: existing!.id,
          userId: (existing as any).user_id,
          name: (existing as any).name,
          searchType: (existing as any).search_type,
          filters: typeof (existing as any).filters === 'string' ? JSON.parse((existing as any).filters) : (existing as any).filters,
          notifyOnNew: (existing as any).notify_on_new,
          createdAt: (existing as any).created_at,
          updatedAt: (existing as any).updated_at,
        } as SavedSearch,
      };
    }

    const updated = await savedSearchRepository.update(searchId, updateData);

    if (!updated) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    return {
      success: true,
      data: {
        id: updated.id,
        userId: (updated as any).user_id,
        name: (updated as any).name,
        searchType: (updated as any).search_type,
        filters: typeof (updated as any).filters === 'string' ? JSON.parse((updated as any).filters) : (updated as any).filters,
        notifyOnNew: (updated as any).notify_on_new,
        createdAt: (updated as any).created_at,
        updatedAt: (updated as any).updated_at,
      } as SavedSearch,
    };
  } catch (error) {
    logger.error('Unexpected error in updateSavedSearch', { error, searchId, userId, updates });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
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
    // Verify ownership
    const ownerId = await savedSearchRepository.findOwnerById(searchId);

    if (ownerId === null) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    if (ownerId !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own saved searches',
        },
      };
    }

    await savedSearchRepository.delete(searchId);

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in deleteSavedSearch', { error, searchId, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Execute a saved search
 */
export async function executeSavedSearch(
  searchId: string,
  userId: string
): Promise<ServiceResult<{ results: any[]; count: number }>> {
  try {
    // Get saved search
    const savedSearchDoc = await savedSearchRepository.getById(searchId);

    if (!savedSearchDoc) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    // Verify ownership
    if ((savedSearchDoc as any).user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only execute your own saved searches',
        },
      };
    }

    const filters = typeof (savedSearchDoc as any).filters === 'string'
      ? JSON.parse((savedSearchDoc as any).filters)
      : (savedSearchDoc as any).filters;
    const searchType = (savedSearchDoc as any).search_type;

    // Execute search based on type
    if (searchType === 'project') {
      const allProjects = await projectRepository.getAllOpenProjects({ limit: 1000, offset: 0 });
      let filtered = allProjects.items;

      // Apply filters in-memory
      if (filters.skills && Array.isArray(filters.skills)) {
        const filterSkills = filters.skills.map((s: string) => s.toLowerCase());
        filtered = filtered.filter(p =>
          p.required_skills?.some((s: any) =>
            filterSkills.includes((s.skill_name || s.name || '').toLowerCase())
          )
        );
      }
      if (filters.minBudget) {
        filtered = filtered.filter(p => p.budget >= filters.minBudget);
      }
      if (filters.maxBudget) {
        filtered = filtered.filter(p => p.budget <= filters.maxBudget);
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw)
        );
      }

      // Sort and limit
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const results = filtered.slice(0, 50);

      return {
        success: true,
        data: {
          results,
          count: results.length,
        },
      };
    } else {
      const allProfiles = await freelancerProfileRepository.getAllProfilesPaginated({ limit: 1000, offset: 0 });
      let filtered = allProfiles.items;

      // Apply filters in-memory
      if (filters.skills && Array.isArray(filters.skills)) {
        const filterSkills = filters.skills.map((s: string) => s.toLowerCase());
        filtered = filtered.filter(fp =>
          fp.skills?.some((s: any) => filterSkills.includes((s.name || '').toLowerCase()))
        );
      }
      if (filters.minHourlyRate) {
        filtered = filtered.filter(fp => fp.hourly_rate >= filters.minHourlyRate);
      }
      if (filters.maxHourlyRate) {
        filtered = filtered.filter(fp => fp.hourly_rate <= filters.maxHourlyRate);
      }

      // Sort and limit
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const results = filtered.slice(0, 50);

      return {
        success: true,
        data: {
          results,
          count: results.length,
        },
      };
    }
  } catch (error) {
    logger.error('Unexpected error in executeSavedSearch', { error, searchId, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
