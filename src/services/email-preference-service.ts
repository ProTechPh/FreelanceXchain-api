import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { EmailPreference, EmailType } from '../models/email-preference.js';
import type { ServiceResult } from '../types/service-result.js';

const supabase = getSupabaseClient();

/**
 * Get user's email preferences (create default if doesn't exist)
 */
export async function getEmailPreferences(userId: string): Promise<ServiceResult<EmailPreference>> {
  try {
    const { data, error } = await supabase
      .from('email_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
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

      const { data: created, error: createError } = await supabase
        .from('email_preferences')
        .insert(defaultPreferences)
        .select('*')
        .single();

      if (createError) {
        logger.error('Failed to create default email preferences', { error: createError, userId });
        return {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to create email preferences',
          },
        };
      }

      return {
        success: true,
        data: created as EmailPreference,
      };
    }

    if (error) {
      logger.error('Failed to get email preferences', { error, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch email preferences',
        },
      };
    }

    return {
      success: true,
      data: data as EmailPreference,
    };
  } catch (error) {
    logger.error('Unexpected error in getEmailPreferences', { error, userId });
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
    const { id, user_id, created_at, updated_at, ...updates } = preferences as any;

    const { data, error } = await supabase
      .from('email_preferences')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update email preferences', { error, userId, updates });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update email preferences',
        },
      };
    }

    return {
      success: true,
      data: data as EmailPreference,
    };
  } catch (error) {
    logger.error('Unexpected error in updateEmailPreferences', { error, userId, preferences });
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
    const { error } = await supabase
      .from('email_preferences')
      .update({
        proposal_received: false,
        proposal_accepted: true,
        milestone_updates: true,
        payment_notifications: true,
        dispute_notifications: true,
        marketing_emails: false,
        weekly_digest: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to unsubscribe from all emails', { error, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to unsubscribe from emails',
        },
      };
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

    const preferenceMap: Record<EmailType, keyof EmailPreference> = {
      proposal_received: 'proposalReceived',
      proposal_accepted: 'proposalAccepted',
      milestone_updates: 'milestoneUpdates',
      payment_notifications: 'paymentNotifications',
      dispute_notifications: 'disputeNotifications',
      marketing_emails: 'marketingEmails',
      weekly_digest: 'weeklyDigest',
    };

    const preferenceKey = preferenceMap[emailType];
    return preferences[preferenceKey] as boolean ?? true;
  } catch (error) {
    logger.error('Error checking email preference', { error, userId, emailType });
    return ['proposal_accepted', 'milestone_updates', 'payment_notifications', 'dispute_notifications'].includes(emailType);
  }
}
