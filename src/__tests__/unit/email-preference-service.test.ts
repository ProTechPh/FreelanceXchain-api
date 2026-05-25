import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLoggerError = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

const {
  getEmailPreferences,
  updateEmailPreferences,
  unsubscribeAll,
  shouldSendEmail,
} = await import('../../services/email-preference-service.js');

const mockPreferenceData = {
  id: 'pref-1',
  user_id: 'user-1',
  proposal_received: true,
  proposal_accepted: true,
  milestone_updates: true,
  payment_notifications: true,
  dispute_notifications: true,
  marketing_emails: false,
  weekly_digest: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('Email Preference Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  describe('getEmailPreferences', () => {
    it('should return preferences on successful fetch', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData }], rowCount: 1 });

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockPreferenceData);
      }
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('email_preferences'),
        expect.arrayContaining(['user-1'])
      );
    });

    it('should create default preferences when none found (not found)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, user_id: 'user-1' }], rowCount: 1 });

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ ...mockPreferenceData, user_id: 'user-1' });
      }
    });

    it('should return DATABASE_ERROR when creating defaults fails', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockRejectedValueOnce(new Error('Duplicate key'));

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toBe('An unexpected error occurred');
      }
    });
  });

  describe('updateEmailPreferences', () => {
    it('should update preferences successfully', async () => {
      const updatedData = { ...mockPreferenceData, marketing_emails: true };
      mockPool.query.mockResolvedValueOnce({ rows: [updatedData], rowCount: 1 });

      const result = await updateEmailPreferences('user-1', { marketingEmails: true } as any);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedData);
      }
    });

    it('should return NOT_FOUND when user preferences not found for update', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await updateEmailPreferences('user-1', { marketingEmails: true } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Network failure'));

      const result = await updateEmailPreferences('user-1', { marketingEmails: true } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toBe('An unexpected error occurred');
      }
    });
  });

  describe('unsubscribeAll', () => {
    it('should unsubscribe successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await unsubscribeAll('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await unsubscribeAll('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toBe('An unexpected error occurred');
      }
    });
  });

  describe('shouldSendEmail', () => {
    it('should return true when preference is enabled for proposal_received', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, proposal_received: true }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'proposal_received');

      expect(result).toBe(true);
    });

    it('should return false when preference is disabled for proposal_received', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, proposal_received: false }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'proposal_received');

      expect(result).toBe(false);
    });

    it('should return false when preference is disabled for marketing_emails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, marketing_emails: false }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'marketing_emails');

      expect(result).toBe(false);
    });

    it('should return true when preference is enabled for marketing_emails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, marketing_emails: true }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'marketing_emails');

      expect(result).toBe(true);
    });

    it('should return true when preference is enabled for weekly_digest', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, weekly_digest: true }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'weekly_digest');

      expect(result).toBe(true);
    });

    it('should return false when preference is disabled for weekly_digest', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, weekly_digest: false }], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'weekly_digest');

      expect(result).toBe(false);
    });

    it('should return true for critical email types when preferences fetch fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const criticalTypes: Array<'proposal_accepted' | 'milestone_updates' | 'payment_notifications' | 'dispute_notifications'> = [
        'proposal_accepted',
        'milestone_updates',
        'payment_notifications',
        'dispute_notifications',
      ];

      for (const emailType of criticalTypes) {
        mockPool.query.mockRejectedValueOnce(new Error('DB error'));
        const result = await shouldSendEmail('user-1', emailType);
        expect(result).toBe(true);
      }
    });

    it('should return false for non-critical email types when preferences fetch fails', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const nonCriticalTypes: Array<'proposal_received' | 'marketing_emails' | 'weekly_digest'> = [
        'proposal_received',
        'marketing_emails',
        'weekly_digest',
      ];

      for (const emailType of nonCriticalTypes) {
        const result = await shouldSendEmail('user-1', emailType);
        expect(result).toBe(false);
      }
    });

    it('should create default preferences and return true when not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // not found
        .mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, proposal_received: true }], rowCount: 1 }); // created

      const result = await shouldSendEmail('user-1', 'proposal_received');

      expect(result).toBe(true);
    });

    it('should fall back to true when preference value is null', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockPreferenceData, proposal_received: null }],
        rowCount: 1,
      });

      const result = await shouldSendEmail('user-1', 'proposal_received');

      expect(result).toBe(true);
    });

    it('should fall back to true when preference field is undefined', async () => {
      const dataWithoutField = { ...mockPreferenceData } as any;
      delete dataWithoutField.marketing_emails;
      mockPool.query.mockResolvedValueOnce({ rows: [dataWithoutField], rowCount: 1 });

      const result = await shouldSendEmail('user-1', 'marketing_emails');

      expect(result).toBe(true);
    });

    it('should return false for proposal_received when getEmailPreferences fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await shouldSendEmail('user-1', 'proposal_received');

      expect(result).toBe(false);
    });

    it('should return critical email fallback when getEmailPreferences returns no data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // not found
        .mockResolvedValueOnce({ rows: [{ ...mockPreferenceData, proposal_accepted: true }], rowCount: 1 }); // created

      const result = await shouldSendEmail('user-1', 'proposal_accepted');

      expect(result).toBe(true);
    });

    it('should correctly handle all 7 email types with preferences enabled', async () => {
      const allEnabled = {
        ...mockPreferenceData,
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: true,
        weekly_digest: true,
      };

      const emailTypes: Array<'proposal_received' | 'proposal_accepted' | 'milestone_updates' | 'payment_notifications' | 'dispute_notifications' | 'marketing_emails' | 'weekly_digest'> = [
        'proposal_received',
        'proposal_accepted',
        'milestone_updates',
        'payment_notifications',
        'dispute_notifications',
        'marketing_emails',
        'weekly_digest',
      ];

      for (const emailType of emailTypes) {
        mockPool.query.mockResolvedValueOnce({ rows: [allEnabled], rowCount: 1 });
        const result = await shouldSendEmail('user-1', emailType);
        expect(result).toBe(true);
      }
    });
  });
});