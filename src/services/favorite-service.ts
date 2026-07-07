import { logger } from '../config/logger.js';
import { Favorite } from '../models/favorite.js';
import type { ServiceResult } from '../types/service-result.js';
import { favoriteRepository } from '../repositories/favorites-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';

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
    const existing = await favoriteRepository.findByUserAndTarget(userId, targetType, targetId);

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
    const target =
      targetType === 'project'
        ? await projectRepository.getById(targetId)
        : await userRepository.getUserById(targetId);

    if (!target) {
      return {
        success: false,
        error: {
          code: 'TARGET_NOT_FOUND',
          message: `${targetType} not found`,
        },
      };
    }

    // Create favorite
    const created = await favoriteRepository.create({
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
    } as any);

    return {
      success: true,
      data: {
        id: created.id,
        userId: created.user_id,
        targetType: created.target_type,
        targetId: created.target_id,
        createdAt: new Date(created.created_at),
      } as Favorite,
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
    await favoriteRepository.removeByUserAndTarget(userId, targetType, targetId);

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
    const favorites = await favoriteRepository.findByUser(userId, targetType);

    // Batch-fetch target details instead of N+1 queries
    const projectIds = favorites.filter(f => f.target_type === 'project').map(f => f.target_id);
    const userIds = favorites.filter(f => f.target_type !== 'project').map(f => f.target_id);

    const [projectMap, userMap] = await Promise.all([
      projectIds.length > 0
        ? Promise.all(projectIds.map(id => projectRepository.getById(id))).then(results => {
            const m = new Map<string, any>();
            results.forEach(item => { if (item) m.set(item.id, item); });
            return m;
          })
        : Promise.resolve(new Map<string, any>()),
      userIds.length > 0
        ? Promise.all(userIds.map(id => userRepository.getUserById(id))).then(results => {
            const m = new Map<string, any>();
            results.forEach(item => { if (item) m.set(item.id, item); });
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
    const existing = await favoriteRepository.findByUserAndTarget(userId, targetType, targetId);

    return {
      success: true,
      data: existing !== null,
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
