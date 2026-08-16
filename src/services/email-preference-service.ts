import { logger } from '../config/logger.js';
import { EmailPreference, EmailType } from '../models/email-preference.js';
import {
  emailPreferenceRepository,
  type EmailPreferenceEntity,
} from '../repositories/email-preference-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';

/**
 * Account-critical email types: still delivered (fail-open) when the preference
 * lookup itself fails. Marketing/digest/plain-notice types fail closed instead.
 */
const CRITICAL_EMAIL_TYPES: EmailType[] = [
  'proposal_accepted', 'milestone_updates', 'payment_notifications', 'dispute_notifications',
  'contract_created', 'message_received', 'review_received', 'kyc_notifications',
];

/**
 * Get user's email preferences (create default if doesn't exist)
 */
export async function getEmailPreferences(userId: string): Promise<ServiceResult<EmailPreference>> {
  try {
    const existing = await emailPreferenceRepository.findByUserId(userId);

    if (!existing) {
      const created = await emailPreferenceRepository.createDefault(userId);
      return successResult(mapEmailPreference(created));
    }

    return successResult(mapEmailPreference(existing));
  } catch (error) {
    logger.error('Unexpected error in getEmailPreferences', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

const PREFERENCE_COLUMNS = [
  'proposal_received', 'proposal_accepted', 'milestone_updates',
  'payment_notifications', 'dispute_notifications',
  'contract_notifications', 'message_notifications', 'review_notifications', 'kyc_notifications',
  'marketing_emails', 'weekly_digest',
] as const;

const CAMEL_CASE_TO_COLUMN: Record<string, keyof EmailPreferenceEntity> = {
  proposalReceived: 'proposal_received',
  proposalAccepted: 'proposal_accepted',
  milestoneUpdates: 'milestone_updates',
  paymentNotifications: 'payment_notifications',
  disputeNotifications: 'dispute_notifications',
  contractNotifications: 'contract_notifications',
  messageNotifications: 'message_notifications',
  reviewNotifications: 'review_notifications',
  kycNotifications: 'kyc_notifications',
  marketingEmails: 'marketing_emails',
  weeklyDigest: 'weekly_digest',
};

/** Keys the PATCH body may carry: camelCase model keys and their snake_case columns. */
const VALID_PREFERENCE_KEYS = new Set<string>([
  ...PREFERENCE_COLUMNS,
  ...Object.keys(CAMEL_CASE_TO_COLUMN),
]);

/**
 * Request-body fields that are not updatable preferences.
 */
function findUnknownKeys(preferences: Partial<EmailPreference>): string[] {
  return Object.keys(preferences).filter(key => !VALID_PREFERENCE_KEYS.has(key));
}

/**
 * Preference fields whose value is not a boolean.
 */
function findNonBooleanPreferenceKeys(preferences: Partial<EmailPreference>): string[] {
  return Object.entries(preferences)
    .filter(([, value]) => typeof value !== 'boolean')
    .map(([key]) => key);
}

/**
 * Map an API payload onto the preference columns.
 * Accepts both the camelCase model keys and the snake_case column names.
 */
function extractAllowedUpdates(
  preferences: Partial<EmailPreference>
): Partial<EmailPreferenceEntity> {
  const updateData: Partial<EmailPreferenceEntity> = {};
  for (const [key, value] of Object.entries(preferences)) {
    const column = CAMEL_CASE_TO_COLUMN[key] ?? key;
    (updateData as Record<string, unknown>)[column] = value;
  }
  return updateData;
}

/**
 * Update user's email preferences
 */
export async function updateEmailPreferences(
  userId: string,
  preferences: Partial<EmailPreference>
): Promise<ServiceResult<EmailPreference>> {
  try {
    const unknownKeys = findUnknownKeys(preferences);
    if (unknownKeys.length > 0) {
      return errorResult('INVALID_PREFERENCES', `Unknown preference fields: ${unknownKeys.join(', ')}`);
    }

    const nonBooleanKeys = findNonBooleanPreferenceKeys(preferences);
    if (nonBooleanKeys.length > 0) {
      return errorResult('INVALID_PREFERENCES', `Preference fields must be booleans: ${nonBooleanKeys.join(', ')}`);
    }

    const updateData = extractAllowedUpdates(preferences);

    if (Object.keys(updateData).length === 0) {
      return await getEmailPreferences(userId);
    }

    const existing = await emailPreferenceRepository.findByUserId(userId);
    if (!existing) {
      return errorResult('NOT_FOUND', 'Preferences not found');
    }

    const updated = await emailPreferenceRepository.update(existing.id, updateData);
    if (!updated) {
      logger.error('Failed to update email preferences', {
        error: new Error('Preference update failed'),
        userId,
        preferences,
      });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }

    return successResult(mapEmailPreference(updated));
  } catch (error) {
    logger.error('Failed to update email preferences', { error, userId, preferences });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Unsubscribe from all non-critical emails
 */
export async function unsubscribeAll(userId: string): Promise<ServiceResult<void>> {
  try {
    const existing = await emailPreferenceRepository.findByUserId(userId);

    if (existing) {
      await emailPreferenceRepository.update(existing.id, {
        proposal_received: false,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        contract_notifications: true,
        message_notifications: true,
        review_notifications: true,
        kyc_notifications: true,
        marketing_emails: false,
        weekly_digest: false,
      });
    }

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in unsubscribeAll', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Check if an email should be sent to a user
 */
export async function shouldSendEmail(userId: string, emailType: EmailType): Promise<boolean> {
  try {
    const result = await getEmailPreferences(userId);

    if (!result.success || !result.data) {
      // Critical/transactional types still send when the preference lookup fails
      // (fail-open for account-critical notifications, fail-closed for marketing).
      return CRITICAL_EMAIL_TYPES.includes(emailType);
    }

    const preferences = result.data;

    const preferenceMap: Record<EmailType, keyof Pick<EmailPreference, 'proposalReceived' | 'proposalAccepted' | 'milestoneUpdates' | 'paymentNotifications' | 'disputeNotifications' | 'contractNotifications' | 'messageNotifications' | 'reviewNotifications' | 'kycNotifications' | 'marketingEmails' | 'weeklyDigest'>> = {
      proposal_received: 'proposalReceived',
      proposal_accepted: 'proposalAccepted',
      milestone_updates: 'milestoneUpdates',
      payment_notifications: 'paymentNotifications',
      dispute_notifications: 'disputeNotifications',
      contract_created: 'contractNotifications',
      message_received: 'messageNotifications',
      review_received: 'reviewNotifications',
      kyc_notifications: 'kycNotifications',
      marketing_emails: 'marketingEmails',
      weekly_digest: 'weeklyDigest',
    };

    const preferenceKey = preferenceMap[emailType];
    return preferences[preferenceKey] ?? true;
  } catch (error) {
    /* istanbul ignore next -- getEmailPreferences never throws past its own catch */
    logger.error('Error checking email preference', { error, userId, emailType });
    /* istanbul ignore next */
    return CRITICAL_EMAIL_TYPES.includes(emailType);
  }
}

function mapEmailPreference(entity: EmailPreferenceEntity): EmailPreference {
  return {
    id: entity.id,
    userId: entity.user_id,
    proposalReceived: entity.proposal_received,
    proposalAccepted: entity.proposal_accepted,
    milestoneUpdates: entity.milestone_updates,
    paymentNotifications: entity.payment_notifications,
    disputeNotifications: entity.dispute_notifications,
    contractNotifications: entity.contract_notifications,
    messageNotifications: entity.message_notifications,
    reviewNotifications: entity.review_notifications,
    kycNotifications: entity.kyc_notifications,
    marketingEmails: entity.marketing_emails,
    weeklyDigest: entity.weekly_digest,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}
