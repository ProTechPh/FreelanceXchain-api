import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { logger } from '../config/logger.js';
import { EmailPreference, EmailType } from '../models/email-preference.js';
import { COLLECTIONS } from '../config/collections.js';
import type { ServiceResult } from '../types/service-result.js';

/**
 * Get user's email preferences (create default if doesn't exist)
 */
export async function getEmailPreferences(userId: string): Promise<ServiceResult<EmailPreference>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.EMAIL_PREFERENCES,
      [Query.equal('user_id', userId), Query.limit(1)]
    );

    if (response.documents.length === 0) {
      const defaultPreferences = {
        user_id: userId,
        proposal_received: true,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: true,
      };

      const doc = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.EMAIL_PREFERENCES,
        ID.unique(),
        {
          ...defaultPreferences,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      );

      return {
        success: true,
        data: mapEmailPreference(doc),
      };
    }

    return {
      success: true,
      data: mapEmailPreference(response.documents[0]!),
    };
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Unexpected error in getEmailPreferences', { error, userId });
    /* istanbul ignore next */
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Update user's email preferences
 */
export async function updateEmailPreferences(
  userId: string,
  preferences: Partial<EmailPreference>
): Promise<ServiceResult<EmailPreference>> {
  try {
    const { id: _id, user_id: _user_id, created_at: _created_at, updated_at: _updated_at, ...updates } = preferences as any;

    const ALLOWED_COLUMNS = new Set([
      'proposal_received', 'proposal_accepted', 'milestone_updates',
      'payment_notifications', 'dispute_notifications', 'marketing_emails', 'weekly_digest',
    ]);

    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_COLUMNS.has(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return await getEmailPreferences(userId);
    }

    updateData.updated_at = new Date().toISOString();

    // Find existing preference document
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.EMAIL_PREFERENCES,
      [Query.equal('user_id', userId), Query.limit(1)]
    );

    if (response.documents.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Preferences not found' }
      };
    }

    const doc = response.documents[0]!;
    const updated = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.EMAIL_PREFERENCES,
      doc.$id,
      updateData
    );

    return {
      success: true,
      data: mapEmailPreference(updated),
    };
  } catch (error) {
    logger.error('Failed to update email preferences', { error, userId, preferences });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Unsubscribe from all non-critical emails
 */
export async function unsubscribeAll(userId: string): Promise<ServiceResult<void>> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.EMAIL_PREFERENCES,
      [Query.equal('user_id', userId), Query.limit(1)]
    );

    if (response.documents.length > 0) {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.EMAIL_PREFERENCES,
        response.documents[0]!.$id,
        {
          proposal_received: false,
          proposal_accepted: true,
          milestone_updates: true,
          payment_notifications: true,
          dispute_notifications: true,
          marketing_emails: false,
          weekly_digest: false,
          updated_at: new Date().toISOString(),
        }
      );
    }

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in unsubscribeAll', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Check if an email should be sent to a user
 */
export async function shouldSendEmail(userId: string, emailType: EmailType): Promise<boolean> {
  try {
    const result = await getEmailPreferences(userId);

    if (!result.success || !result.data) {
      return ['proposal_accepted', 'milestone_updates', 'payment_notifications', 'dispute_notifications'].includes(emailType);
    }

    const preferences = result.data;

    const preferenceMap: Record<EmailType, string> = {
      proposal_received: 'proposalReceived',
      proposal_accepted: 'proposalAccepted',
      milestone_updates: 'milestoneUpdates',
      payment_notifications: 'paymentNotifications',
      dispute_notifications: 'disputeNotifications',
      marketing_emails: 'marketingEmails',
      weekly_digest: 'weeklyDigest',
    };

    const preferenceKey = preferenceMap[emailType];
    return (preferences as any)[preferenceKey] as boolean ?? true;
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error checking email preference', { error, userId, emailType });
    /* istanbul ignore next */
    return ['proposal_accepted', 'milestone_updates', 'payment_notifications', 'dispute_notifications'].includes(emailType);
  }
}

function mapEmailPreference(doc: Record<string, any>): EmailPreference {
  const { $id, $collectionId, $databaseId, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    userId: attrs.user_id,
    proposalReceived: attrs.proposal_received,
    proposalAccepted: attrs.proposal_accepted,
    milestoneUpdates: attrs.milestone_updates,
    paymentNotifications: attrs.payment_notifications,
    disputeNotifications: attrs.dispute_notifications,
    marketingEmails: attrs.marketing_emails,
    weeklyDigest: attrs.weekly_digest,
    createdAt: new Date(attrs.created_at ?? $createdAt),
    updatedAt: new Date(attrs.updated_at ?? $updatedAt),
  } as EmailPreference;
}
