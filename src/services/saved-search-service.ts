import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { SavedSearch, SavedSearchInput } from '../models/saved-search.js';
import type { ServiceResult } from '../types/service-result.js';

const supabase = getSupabaseClient();

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

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: userId,
        name: input.name,
        search_type: input.searchType,
        filters: input.filters,
        notify_on_new: input.notifyOnNew || false,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to create saved search', { error, userId, input });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create saved search',
        },
      };
    }

    return {
      success: true,
      data: data as SavedSearch,
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
    let query = supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (searchType) {
      query = query.eq('search_type', searchType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get saved searches', { error, userId, searchType });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch saved searches',
        },
      };
    }

    return {
      success: true,
      data: (data || []) as SavedSearch[],
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
    const { data: existing, error: fetchError } = await supabase
      .from('saved_searches')
      .select('user_id')
      .eq('id', searchId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    if (existing.user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only update your own saved searches',
        },
      };
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.filters) updateData.filters = updates.filters;
    if (updates.notifyOnNew !== undefined) updateData.notify_on_new = updates.notifyOnNew;

    const { data, error } = await supabase
      .from('saved_searches')
      .update(updateData)
      .eq('id', searchId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update saved search', { error, searchId, updates });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update saved search',
        },
      };
    }

    return {
      success: true,
      data: data as SavedSearch,
    };
  } catch (error) {
    logger.error('Unexpected error in updateSavedSearch', { error, searchId, updates });
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
    const { data: existing, error: fetchError } = await supabase
      .from('saved_searches')
      .select('user_id')
      .eq('id', searchId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    if (existing.user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own saved searches',
        },
      };
    }

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', searchId);

    if (error) {
      logger.error('Failed to delete saved search', { error, searchId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to delete saved search',
        },
      };
    }

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in deleteSavedSearch', { error, searchId });
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
): Promise<ServiceResult<any>> {
  try {
    // Get saved search
    const { data: savedSearch, error: fetchError } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('id', searchId)
      .single();

    if (fetchError || !savedSearch) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    // Verify ownership
    if (savedSearch.user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only execute your own saved searches',
        },
      };
    }

    const filters = savedSearch.filters as Record<string, any>;
    const searchType = savedSearch.search_type;

    // Execute search based on type
    if (searchType === 'project') {
      let query = supabase
        .from('projects')
        .select('*')
        .eq('status', 'open');

      // Apply filters
      if (filters.skills && Array.isArray(filters.skills)) {
        query = query.contains('required_skills', filters.skills);
      }
      if (filters.minBudget) {
        query = query.gte('budget', filters.minBudget);
      }
      if (filters.maxBudget) {
        query = query.lte('budget', filters.maxBudget);
      }
      if (filters.keyword) {
        query = query.or(`title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

      if (error) {
        logger.error('Failed to execute project search', { error, searchId, filters });
        return {
          success: false,
          error: {
            code: 'SEARCH_ERROR',
            message: 'Failed to execute search',
          },
        };
      }

      return {
        success: true,
        data: {
          results: data || [],
          count: data?.length || 0,
        },
      };
    } else if (searchType === 'freelancer') {
      let query = supabase
        .from('freelancer_profiles')
        .select('*, users!inner(id, email, name)');

      // Apply filters
      if (filters.skills && Array.isArray(filters.skills)) {
        query = query.contains('skills', filters.skills);
      }
      if (filters.minHourlyRate) {
        query = query.gte('hourly_rate', filters.minHourlyRate);
      }
      if (filters.maxHourlyRate) {
        query = query.lte('hourly_rate', filters.maxHourlyRate);
      }
      if (filters.keyword) {
        query = query.or(`bio.ilike.%${filters.keyword}%,title.ilike.%${filters.keyword}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

      if (error) {
        logger.error('Failed to execute freelancer search', { error, searchId, filters });
        return {
          success: false,
          error: {
            code: 'SEARCH_ERROR',
            message: 'Failed to execute search',
          },
        };
      }

      return {
        success: true,
        data: {
          results: data || [],
          count: data?.length || 0,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INVALID_SEARCH_TYPE',
        message: 'Invalid search type',
      },
    };
  } catch (error) {
    logger.error('Unexpected error in executeSavedSearch', { error, searchId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
