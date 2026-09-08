import type { UserRole } from './user.js';

/**
 * Tour progress per role for a user.
 */
export interface TourProgress {
  /** Version of the tour that was completed. */
  completedVersion?: number;
  /** Whether to auto-start the tour on next visit. */
  autoStart?: boolean;
}

/**
 * User preferences stored in database (syncs across devices).
 */
export interface UserPreferences {
  id: string;
  userId: string;
  /** Tour progress per role (freelancer/employer). */
  tourProgress?: Partial<Record<UserRole, TourProgress>>;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserPreferencesInput = Omit<UserPreferences, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserPreferencesInput = Partial<Omit<UserPreferences, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
