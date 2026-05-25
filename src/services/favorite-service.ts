import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Favorite, FavoriteEntity } from '../models/favorite.js';
import type { ServiceResult } from '../types/service-result.js';

/**
 * Add a favorite (project or freelancer)
 */
export async function addFavorite(
  userId: string,
  targetType: 'project' | 'freelancer',
  targetId: string
): Promise<ServiceResult<Favorite>> {
  try {
    // Check if already favorited
    const existingResult = await pool.query(
      'SELECT * FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, targetType, targetId]
    );

    if (existingResult.rows.length > 0) {
      return {
        success: false,
        error: {
          code: 'ALREADY_FAVORITED',
          message: 'This item is already in your favorites',
        },
      };
    }

    // Verify target exists
    const targetTable = targetType === 'project' ? 'projects' : 'users';
    const targetResult = await pool.query(
      `SELECT id FROM ${targetTable} WHERE id = $1`,
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'TARGET_NOT_FOUND',
          message: `${targetType} not found`,
        },
      };
    }

    // Create favorite
    const insertResult = await pool.query(
      `INSERT INTO favorites (user_id, target_type, target_id, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING *`,
      [userId, targetType, targetId]
    );

    return {
      success: true,
      data: insertResult.rows[0] as Favorite,
    };
  } catch (error) {
    logger.error('Unexpected error in addFavorite', { error, userId, targetType, targetId });
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
 * Remove a favorite
 */
export async function removeFavorite(
  userId: string,
  targetType: 'project' | 'freelancer',
  targetId: string
): Promise<ServiceResult<void>> {
  try {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, targetType, targetId]
    );

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in removeFavorite', { error, userId, targetType, targetId });
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
 * Get user's favorites with target details
 */
export async function getUserFavorites(
  userId: string,
  targetType?: 'project' | 'freelancer'
): Promise<ServiceResult<Favorite[]>> {
  try {
    let query = 'SELECT * FROM favorites WHERE user_id = $1';
    const params: any[] = [userId];

    if (targetType) {
      query += ' AND target_type = $2';
      params.push(targetType);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    const favorites = result.rows as FavoriteEntity[];

    // Batch-fetch target details instead of N+1 queries
    const projectIds = favorites.filter(f => f.target_type === 'project').map(f => f.target_id);
    const userIds = favorites.filter(f => f.target_type !== 'project').map(f => f.target_id);

    const [projectMap, userMap] = await Promise.all([
      projectIds.length > 0
        ? pool.query('SELECT * FROM projects WHERE id = ANY($1)', [projectIds]).then(res => {
            const m = new Map<string, any>();
            for (const item of res.rows) m.set(item.id, item);
            return m;
          })
        : Promise.resolve(new Map<string, any>()),
      userIds.length > 0
        ? pool.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]).then(res => {
            const m = new Map<string, any>();
            for (const item of res.rows) m.set(item.id, item);
            return m;
          })
        : Promise.resolve(new Map<string, any>()),
    ]);

    const enrichedFavorites: (Favorite & { target: any })[] = favorites.map((fav) => {
      const targetMap = fav.target_type === 'project' ? projectMap : userMap;
      return {
        id: fav.id,
        userId: fav.user_id,
        targetType: fav.target_type,
        targetId: fav.target_id,
        createdAt: new Date(fav.created_at),
        target: targetMap.get(fav.target_id) ?? null,
      };
    });

    return {
      success: true,
      data: enrichedFavorites,
    };
  } catch (error) {
    logger.error('Unexpected error in getUserFavorites', { error, userId, targetType });
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
 * Check if an item is favorited
 */
export async function isFavorited(
  userId: string,
  targetType: 'project' | 'freelancer',
  targetId: string
): Promise<ServiceResult<boolean>> {
  try {
    const result = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, targetType, targetId]
    );

    return {
      success: true,
      data: result.rows.length > 0,
    };
  } catch (error) {
    logger.error('Unexpected error in isFavorited', { error, userId, targetType, targetId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
