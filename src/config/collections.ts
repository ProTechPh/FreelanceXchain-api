export const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  CONTRACTS: 'contracts',
  REVIEWS: 'reviews',
  PROPOSALS: 'proposals',
  PAYMENTS: 'payments',
  NOTIFICATIONS: 'notifications',
  MESSAGES: 'messages',
  CONVERSATIONS: 'conversations',
  DISPUTES: 'disputes',
  FREELANCER_PROFILES: 'freelancer_profiles',
  AUDIT_LOG_ENTRIES: 'audit_log_entries',
  EMAIL_PREFERENCES: 'email_preferences',
  SAVED_SEARCHES: 'saved_searches',
  EMAILS: 'emails',
} as const;

export type CollectionId = typeof COLLECTIONS[keyof typeof COLLECTIONS];
