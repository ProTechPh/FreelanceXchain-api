import { logger } from '../config/logger.js';
import type { Favorite } from '../models/favorite.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { favoriteRepository } from '../repositories/favorites-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
import { userRepository, type UserEntity } from '../repositories/user-repository.js';

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
      return errorResult('ALREADY_FAVORITED', 'This item is already in your favorites');
    }

    // Verify target exists
    const target =
      targetType === 'project'
        ? await projectRepository.getById(targetId)
        : await userRepository.getUserById(targetId);

    if (!target) {
      return errorResult('TARGET_NOT_FOUND', `${targetType} not found`);
    }

    // Create favorite. A concurrent identical request can race past the check
    // above and hit the unique (user_id, target_type, target_id) index backstop
    // — treat that as already-favorited rather than a generic internal error.
    let created: Awaited<ReturnType<typeof favoriteRepository.create>>;
    try {
      created = await favoriteRepository.create({
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
      });
    } catch (error) {
      const raced = await favoriteRepository.findByUserAndTarget(userId, targetType, targetId);
      if (raced) {
        return errorResult('ALREADY_FAVORITED', 'This item is already in your favorites');
      }
      throw error;
    }

    return successResult({
      id: created.id,
      userId: created.user_id,
      targetType: created.target_type,
      targetId: created.target_id,
      createdAt: created.created_at,
    });
  } catch (error) {
    logger.error('Unexpected error in addFavorite', { error, userId, targetType, targetId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in removeFavorite', { error, userId, targetType, targetId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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

    // Batch-fetch target details with ONE query per target type (kills the old
    // N+1 pattern where each favorite triggered its own getById).
    const projectIds: string[] = [];
    const userIds: string[] = [];
    for (const f of favorites) {
      if (f.target_type === 'project') projectIds.push(f.target_id);
      else userIds.push(f.target_id);
    }

    const [projectMap, userMap] = await Promise.all([
      projectRepository.getProjectsByIds(projectIds),
      userRepository.getUsersByIds(userIds),
    ]);

    const projectMapById = new Map(projectMap.map(p => [p.id, p]));
    const userMapById = new Map(userMap.map(u => [u.id, u]));

    // Favorites whose target has been deleted are stale — drop them from the
    // response instead of leaking `target: null` entries to the client.
    const enrichedFavorites: (Favorite & { target: ProjectEntity | UserEntity })[] = [];
    for (const fav of favorites) {
      const targetMap = fav.target_type === 'project' ? projectMapById : userMapById;
      const target = targetMap.get(fav.target_id);
      if (!target) continue;
      enrichedFavorites.push({
        id: fav.id,
        userId: fav.user_id,
        targetType: fav.target_type,
        targetId: fav.target_id,
        createdAt: fav.created_at,
        target,
      });
    }

    return successResult(enrichedFavorites);
  } catch (error) {
    logger.error('Unexpected error in getUserFavorites', { error, userId, targetType });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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

    return successResult(existing !== null);
  } catch (error) {
    logger.error('Unexpected error in isFavorited', { error, userId, targetType, targetId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
