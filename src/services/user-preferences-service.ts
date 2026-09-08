import { logger } from '../config/logger.js';
import type { UserPreferences, TourProgress } from '../models/user-preferences.js';
import { userPreferencesRepository } from '../repositories/user-preferences-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import type { UserRole } from '../models/user.js';

/**
 * Get user preferences (create default if doesn't exist)
 */
export async function getUserPreferences(userId: string): Promise<ServiceResult<UserPreferences>> {
  try {
    const existing = await userPreferencesRepository.findByUserId(userId);

    if (!existing) {
      const created = await userPreferencesRepository.createDefault(userId);
      return successResult(created);
    }

    return successResult(existing);
  } catch (error) {
    logger.error('Unexpected error in getUserPreferences', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Update tour progress for a specific role
 */
export async function updateTourProgress(
  userId: string,
  role: UserRole,
  progress: TourProgress
): Promise<ServiceResult<UserPreferences>> {
  try {
    // Validate role
    if (role !== 'freelancer' && role !== 'employer') {
      return errorResult('INVALID_ROLE', 'Role must be freelancer or employer');
    }

    const existing = await userPreferencesRepository.findByUserId(userId);
    const currentProgress = existing?.tourProgress || {};

    const updated = await userPreferencesRepository.updatePreferences(userId, {
      tourProgress: {
        ...currentProgress,
        [role]: progress,
      },
    });

    if (!updated) {
      return errorResult('NOT_FOUND', 'User preferences not found');
    }

    return successResult(updated);
  } catch (error) {
    logger.error('Unexpected error in updateTourProgress', { error, userId, role });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Mark tour as completed for a specific role
 */
export async function markTourCompleted(
  userId: string,
  role: UserRole,
  version: number
): Promise<ServiceResult<UserPreferences>> {
  return updateTourProgress(userId, role, {
    completedVersion: version,
    autoStart: false,
  });
}

/**
 * Set auto-start preference for tour
 */
export async function setTourAutoStart(
  userId: string,
  role: UserRole,
  autoStart: boolean
): Promise<ServiceResult<UserPreferences>> {
  try {
    const existing = await userPreferencesRepository.findByUserId(userId);
    const currentRoleProgress = existing?.tourProgress?.[role] || {};
    
    return updateTourProgress(userId, role, {
      ...currentRoleProgress,
      autoStart,
    });
  } catch (error) {
    logger.error('Unexpected error in setTourAutoStart', { error, userId, role });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
