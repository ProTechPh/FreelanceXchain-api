import { describe, it, expect } from '@jest/globals';

describe('Collections Config', () => {
  const importModule = async () => {
    return await import('../../config/collections.js');
  };

  describe('COLLECTIONS', () => {
    it('should export COLLECTIONS object', async () => {
      const { COLLECTIONS } = await importModule();
      expect(COLLECTIONS).toBeDefined();
      expect(typeof COLLECTIONS).toBe('object');
    });

    it('should have all required collection keys', async () => {
      const { COLLECTIONS } = await importModule();
      const expectedKeys = [
        'USERS',
        'PROJECTS',
        'CONTRACTS',
        'REVIEWS',
        'PROPOSALS',
        'PAYMENTS',
        'NOTIFICATIONS',
        'MESSAGES',
        'CONVERSATIONS',
        'DISPUTES',
        'AUDIT_LOG_ENTRIES',
        'EMAIL_PREFERENCES',
        'SAVED_SEARCHES',
      ];
      expect(Object.keys(COLLECTIONS).sort()).toEqual(expectedKeys.sort());
    });

    it('should have correct collection values', async () => {
      const { COLLECTIONS } = await importModule();
      expect(COLLECTIONS.USERS).toBe('users');
      expect(COLLECTIONS.PROJECTS).toBe('projects');
      expect(COLLECTIONS.CONTRACTS).toBe('contracts');
      expect(COLLECTIONS.REVIEWS).toBe('reviews');
      expect(COLLECTIONS.PROPOSALS).toBe('proposals');
      expect(COLLECTIONS.PAYMENTS).toBe('payments');
      expect(COLLECTIONS.NOTIFICATIONS).toBe('notifications');
      expect(COLLECTIONS.MESSAGES).toBe('messages');
      expect(COLLECTIONS.CONVERSATIONS).toBe('conversations');
      expect(COLLECTIONS.DISPUTES).toBe('disputes');
      expect(COLLECTIONS.AUDIT_LOG_ENTRIES).toBe('audit_log_entries');
      expect(COLLECTIONS.EMAIL_PREFERENCES).toBe('email_preferences');
      expect(COLLECTIONS.SAVED_SEARCHES).toBe('saved_searches');
    });

    it('should have string values for all collections', async () => {
      const { COLLECTIONS } = await importModule();
      for (const value of Object.values(COLLECTIONS)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CollectionId type', () => {
    it('should be assignable from COLLECTIONS values', async () => {
      const { COLLECTIONS } = await importModule();
      const id: string = COLLECTIONS.USERS;
      expect(id).toBe('users');
    });
  });
});
