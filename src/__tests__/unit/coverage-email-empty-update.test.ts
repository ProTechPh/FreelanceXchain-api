// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const { updateEmailPreferences } = await import('../../services/email-preference-service.js');

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

const mappedPreferenceData = {
  id: 'pref-1',
  userId: 'user-1',
  proposalReceived: true,
  proposalAccepted: true,
  milestoneUpdates: true,
  paymentNotifications: true,
  disputeNotifications: true,
  marketingEmails: false,
  weeklyDigest: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

describe('Email Preference Service - empty update (line 90)', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
  });

  it('should fall back to getEmailPreferences when update has no fields', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'pref-1', ...mockPreferenceData }],
      total: 1,
    });

    const result = await updateEmailPreferences('user-1', {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('pref-1');
      expect(result.data.userId).toBe('user-1');
    }
    expect(mockDatabases.listDocuments).toHaveBeenCalled();
  });
});
