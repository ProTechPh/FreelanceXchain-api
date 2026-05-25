/**
 * Database table names
 * Centralized table name constants for PostgreSQL
 */
export const TABLES = {
  USERS: 'users',
  FREELANCER_PROFILES: 'freelancer_profiles',
  EMPLOYER_PROFILES: 'employer_profiles',
  PROJECTS: 'projects',
  PROPOSALS: 'proposals',
  CONTRACTS: 'contracts',
  DISPUTES: 'disputes',
  SKILLS: 'skills',
  SKILL_CATEGORIES: 'skill_categories',
  NOTIFICATIONS: 'notifications',
  KYC_VERIFICATIONS: 'kyc_verifications',
  REVIEWS: 'reviews',
  MESSAGES: 'messages',
  PAYMENTS: 'payments',
  RUSH_UPGRADE_REQUESTS: 'rush_upgrade_requests',
  AUDIT_LOG_ENTRIES: 'audit_log_entries',
  PENDING_MFA_SESSIONS: 'pending_mfa_sessions',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];
