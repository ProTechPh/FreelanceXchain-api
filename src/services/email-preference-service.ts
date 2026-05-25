import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { EmailPreference, EmailType } from '../models/email-preference.js';
import type { ServiceResult } from '../types/service-result.js';

/**
 * Get user's email preferences (create default if doesn't exist)
 */
export async function getEmailPreferences(userId: string): Promise<ServiceResult<EmailPreference>> {
  try {
    const result = await pool.query(
      'SELECT * FROM email_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
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

      const createdResult = await pool.query(
        `INSERT INTO email_preferences 
         (user_id, proposal_received, proposal_accepted, milestone_updates, payment_notifications, 
          dispute_notifications, marketing_emails, weekly_digest, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [
          userId, 
          defaultPreferences.proposal_received,
          defaultPreferences.proposal_accepted,
          defaultPreferences.milestone_updates,
          defaultPreferences.payment_notifications,
          defaultPreferences.dispute_notifications,
          defaultPreferences.marketing_emails,
          defaultPreferences.weekly_digest
        ]
      );

      return {
        success: true,
        data: createdResult.rows[0] as EmailPreference,
      };
    }

    return {
      success: true,
      data: result.rows[0] as EmailPreference,
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

    const columns = [];
    const values = [];
    let pIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      columns.push(`${key} = $${pIndex++}`);
      values.push(value);
    }

    if (columns.length === 0) {
      return await getEmailPreferences(userId);
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE email_preferences SET ${columns.join(', ')}, updated_at = NOW() WHERE user_id = $${pIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Preferences not found' }
      };
    }

    return {
      success: true,
      data: result.rows[0] as EmailPreference,
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
    await pool.query(
      `UPDATE email_preferences SET 
        proposal_received = false,
        proposal_accepted = true,
        milestone_updates = true,
        payment_notifications = true,
        dispute_notifications = true,
        marketing_emails = false,
        weekly_digest = false,
        updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

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
      proposal_received: 'proposal_received',
      proposal_accepted: 'proposal_accepted',
      milestone_updates: 'milestone_updates',
      payment_notifications: 'payment_notifications',
      dispute_notifications: 'dispute_notifications',
      marketing_emails: 'marketing_emails',
      weekly_digest: 'weekly_digest',
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
