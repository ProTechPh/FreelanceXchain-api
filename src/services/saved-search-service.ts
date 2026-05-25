import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { SavedSearch, SavedSearchInput } from '../models/saved-search.js';
import type { ServiceResult } from '../types/service-result.js';

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

    const result = await pool.query(
      `INSERT INTO saved_searches (user_id, name, search_type, filters, notify_on_new, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [userId, input.name, input.searchType, JSON.stringify(input.filters), input.notifyOnNew || false]
    );

    return {
      success: true,
      data: result.rows[0] as SavedSearch,
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
    let query = 'SELECT * FROM saved_searches WHERE user_id = $1';
    const params: any[] = [userId];

    if (searchType) {
      query += ' AND search_type = $2';
      params.push(searchType);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return {
      success: true,
      data: result.rows as SavedSearch[],
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
    const existingResult = await pool.query(
      'SELECT user_id FROM saved_searches WHERE id = $1',
      [searchId]
    );

    if (existingResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Saved search not found' },
      };
    }

    if (existingResult.rows[0].user_id !== userId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You can only update your own saved searches' },
      };
    }

    // Build update query
    const columns = [];
    const values = [];
    let paramIndex = 1;

    if (updates.name) {
      columns.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.filters) {
      columns.push(`filters = $${paramIndex++}`);
      values.push(JSON.stringify(updates.filters));
    }
    if (updates.notifyOnNew !== undefined) {
      columns.push(`notify_on_new = $${paramIndex++}`);
      values.push(updates.notifyOnNew);
    }

    if (columns.length === 0) {
      const result = await pool.query('SELECT * FROM saved_searches WHERE id = $1', [searchId]);
      return { success: true, data: result.rows[0] as SavedSearch };
    }

    columns.push(`updated_at = NOW()`);
    values.push(searchId);

    const result = await pool.query(
      `UPDATE saved_searches SET ${columns.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
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
      data: result.rows[0] as SavedSearch,
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
    const existingResult = await pool.query(
      'SELECT user_id FROM saved_searches WHERE id = $1',
      [searchId]
    );

    if (existingResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    if (existingResult.rows[0].user_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own saved searches',
        },
      };
    }

    await pool.query('DELETE FROM saved_searches WHERE id = $1', [searchId]);

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
    const searchResult = await pool.query(
      'SELECT * FROM saved_searches WHERE id = $1',
      [searchId]
    );

    if (searchResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Saved search not found',
        },
      };
    }

    const savedSearch = searchResult.rows[0];

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
      let query = "SELECT * FROM projects WHERE status = 'open'";
      const params: any[] = [];
      let pIndex = 1;

      // Apply filters
      if (filters.skills && Array.isArray(filters.skills)) {
        query += ` AND required_skills @> $${pIndex++}`;
        params.push(filters.skills);
      }
      if (filters.minBudget) {
        query += ` AND budget >= $${pIndex++}`;
        params.push(filters.minBudget);
      }
      if (filters.maxBudget) {
        query += ` AND budget <= $${pIndex++}`;
        params.push(filters.maxBudget);
      }
      if (filters.keyword) {
        query += ` AND (title ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
        params.push(`%${filters.keyword}%`);
        pIndex++;
      }

      query += ' ORDER BY created_at DESC LIMIT 50';

      const results = await pool.query(query, params);

      return {
        success: true,
        data: {
          results: results.rows,
          count: results.rows.length,
        },
      };
    } else {
      let query = `
        SELECT fp.*, u.email, u.name 
        FROM freelancer_profiles fp
        INNER JOIN users u ON fp.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let pIndex = 1;

      // Apply filters
      if (filters.skills && Array.isArray(filters.skills)) {
        query += ` AND fp.skills @> $${pIndex++}`;
        params.push(filters.skills);
      }
      if (filters.minHourlyRate) {
        query += ` AND fp.hourly_rate >= $${pIndex++}`;
        params.push(filters.minHourlyRate);
      }
      if (filters.maxHourlyRate) {
        query += ` AND fp.hourly_rate <= $${pIndex++}`;
        params.push(filters.maxHourlyRate);
      }

      query += ' ORDER BY fp.created_at DESC LIMIT 50';

      const results = await pool.query(query, params);

      return {
        success: true,
        data: {
          results: results.rows,
          count: results.rows.length,
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
