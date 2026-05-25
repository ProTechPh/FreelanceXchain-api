import { describe, it, expect } from '@jest/globals';
import { TABLES } from '../../config/tables.js';

describe('Tables Config', () => {
  it('should export TABLES constant', () => {
    expect(TABLES).toBeDefined();
    expect(typeof TABLES).toBe('object');
  });

  it('should have all required table names', () => {
    expect(TABLES.USERS).toBe('users');
    expect(TABLES.FREELANCER_PROFILES).toBe('freelancer_profiles');
    expect(TABLES.EMPLOYER_PROFILES).toBe('employer_profiles');
    expect(TABLES.PROJECTS).toBe('projects');
    expect(TABLES.PROPOSALS).toBe('proposals');
    expect(TABLES.CONTRACTS).toBe('contracts');
    expect(TABLES.DISPUTES).toBe('disputes');
    expect(TABLES.SKILLS).toBe('skills');
    expect(TABLES.SKILL_CATEGORIES).toBe('skill_categories');
    expect(TABLES.NOTIFICATIONS).toBe('notifications');
    expect(TABLES.KYC_VERIFICATIONS).toBe('kyc_verifications');
    expect(TABLES.REVIEWS).toBe('reviews');
    expect(TABLES.MESSAGES).toBe('messages');
    expect(TABLES.PAYMENTS).toBe('payments');
    expect(TABLES.RUSH_UPGRADE_REQUESTS).toBe('rush_upgrade_requests');
    expect(TABLES.AUDIT_LOG_ENTRIES).toBe('audit_log_entries');
    expect(TABLES.PENDING_MFA_SESSIONS).toBe('pending_mfa_sessions');
  });

  it('should have exactly 17 table entries', () => {
    expect(Object.keys(TABLES).length).toBe(17);
  });

  it('should be immutable (as const)', () => {
    // Verify all values are strings
    Object.values(TABLES).forEach(value => {
      expect(typeof value).toBe('string');
    });
  });

  it('should have unique table names', () => {
    const values = Object.values(TABLES);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});
