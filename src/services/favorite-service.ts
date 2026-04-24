import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { Favorite, FavoriteEntity } from '../models/favorite.js';
import type { ServiceResult } from '../types/service-result.js';

const supabase = getSupabaseClient();

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
    const { data: existing } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .single();

    if (existing) {
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
    const { data: target, error: targetError } = await supabase
      .from(targetTable)
      .select('id')
      .eq('id', targetId)
      .single();

    if (targetError || !target) {
      return {
        success: false,
        error: {
          code: 'TARGET_NOT_FOUND',
          message: `${targetType} not found`,
        },
      };
    }

    // Create favorite
    const { data, error } = await supabase
      .from('favorites')
      .insert({
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to add favorite', { error, userId, targetType, targetId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to add favorite',
        },
      };
    }

    return {
      success: true,
      data: data as Favorite,
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
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (error) {
      logger.error('Failed to remove favorite', { error, userId, targetType, targetId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to remove favorite',
        },
      };
    }

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
    let query = supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (targetType) {
      query = query.eq('target_type', targetType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get favorites', { error, userId, targetType });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch favorites',
        },
      };
    }

    const favorites = (data || []) as FavoriteEntity[];

    // Batch-fetch target details instead of N+1 queries
    const projectIds = favorites.filter(f => f.target_type === 'project').map(f => f.target_id);
    const userIds = favorites.filter(f => f.target_type !== 'project').map(f => f.target_id);

    const [projectMap, userMap] = await Promise.all([
      projectIds.length > 0
        ? supabase.from('projects').select('*').in('id', projectIds).then(({ data: d }) => {
            const m = new Map<string, any>();
            for (const item of (d ?? [])) m.set(item.id, item);
            return m;
          })
        : Promise.resolve(new Map<string, any>()),
      userIds.length > 0
        ? supabase.from('users').select('*').in('id', userIds).then(({ data: d }) => {
            const m = new Map<string, any>();
            for (const item of (d ?? [])) m.set(item.id, item);
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
    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error('Failed to check favorite status', { error, userId, targetType, targetId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to check favorite status',
        },
      };
    }

    return {
      success: true,
      data: !!data,
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
