// @ts-nocheck
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

const mockDatabases = (globalThis as any).__mockDatabases;

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id || 'pref-1',
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('Email Preference Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases.listDocuments.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  describe('getEmailPreferences', () => {
    it('should return preferences on successful fetch', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          id: 'pref-1',
          userId: 'user-1',
          proposalReceived: true,
          proposalAccepted: true,
        });
      }
    });

    it('should create default preferences when none found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      }));

      const result = await getEmailPreferences('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({ userId: 'user-1' });
      }
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Connection lost'));

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
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: true,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);

      const result = await updateEmailPreferences('user-1', { marketingEmails: true } as any);

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when user preferences not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await updateEmailPreferences('user-1', { marketing_emails: true } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Network failure'));

      const result = await updateEmailPreferences('user-1', { marketingEmails: true } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('unsubscribeAll', () => {
    it('should unsubscribe successfully', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'pref-1', user_id: 'user-1' })],
        total: 1,
      });
      mockDatabases.updateDocument.mockResolvedValueOnce({});

      const result = await unsubscribeAll('user-1');

      expect(result.success).toBe(true);
    });

    it('should return success even when no preferences exist', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await unsubscribeAll('user-1');

      expect(result.success).toBe(true);
    });

    it('should return INTERNAL_ERROR on unexpected exception', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await unsubscribeAll('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('shouldSendEmail', () => {
    it('should return true when preference is enabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'proposal_received');
      expect(result).toBe(true);
    });

    it('should return false when preference is disabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: false,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'proposal_received');
      expect(result).toBe(false);
    });

    it('should return false when marketing_emails is disabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'marketing_emails');
      expect(result).toBe(false);
    });

    it('should return true when marketing_emails is enabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: true,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'marketing_emails');
      expect(result).toBe(true);
    });

    it('should return true when weekly_digest is enabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'weekly_digest');
      expect(result).toBe(true);
    });

    it('should return false when weekly_digest is disabled', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: false,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'weekly_digest');
      expect(result).toBe(false);
    });

    it('should return true for critical email types when preferences fetch fails', async () => {
      const criticalTypes: Array<string> = [
        'proposal_accepted',
        'milestone_updates',
        'payment_notifications',
        'dispute_notifications',
      ];

      for (const emailType of criticalTypes) {
        mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
        const result = await shouldSendEmail('user-1', emailType as any);
        expect(result).toBe(true);
      }
    });

    it('should return false for non-critical email types when preferences fetch fails', async () => {
      const nonCriticalTypes: Array<string> = [
        'proposal_received',
        'marketing_emails',
        'weekly_digest',
      ];

      for (const emailType of nonCriticalTypes) {
        mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
        const result = await shouldSendEmail('user-1', emailType as any);
        expect(result).toBe(false);
      }
    });

    it('should fall back to true when preference value is null', async () => {
      const doc = toAppwriteDoc({
        id: 'pref-1',
        user_id: 'user-1',
        proposal_received: null,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await shouldSendEmail('user-1', 'proposal_received');
      expect(result).toBe(true);
    });
  });
});
