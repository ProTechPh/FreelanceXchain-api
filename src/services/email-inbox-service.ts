import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import {
  emailInboxRepository,
  type EmailEntity,
  type EmailListItem,
  type EmailFolder,
} from '../repositories/email-inbox-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { PaginatedResult } from '../repositories/base-repository.js';
import crypto from 'crypto';

export type InboundEmailPayload = {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: Array<{ filename: string; size: number; mimeType: string }>;
  inReplyTo: string | null;
  references: string | null;
  receivedAt: string;
};

const PLATFORM_DOMAIN = 'freelancexchain.works';

function extractUsername(toAddress: string): string | null {
  const match = toAddress.match(/^([^@]+)@(.+)$/);
  if (!match) return null;
  const [, localPart, domain] = match;
  if (domain !== PLATFORM_DOMAIN) return null;
  return localPart ?? null;
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

export async function processInboundEmail(
  payload: InboundEmailPayload
): Promise<ServiceResult<{ emailId: string }>> {
  try {
    const username = extractUsername(payload.to);
    if (!username) {
      return {
        success: false,
        error: { code: 'INVALID_RECIPIENT', message: `Recipient address not on platform domain: ${payload.to}` },
      };
    }

    const user = await userRepository.findOne('name', username);
    if (!user) {
      logger.warn(`Inbound email to unknown user: ${username}@${PLATFORM_DOMAIN}`);
      return {
        success: false,
        error: { code: 'USER_NOT_FOUND', message: `No user found with username: ${username}` },
      };
    }

    const existing = await emailInboxRepository.findByMessageId(payload.messageId);
    if (existing) {
      return { success: true, data: { emailId: existing.id } };
    }

    const email = await emailInboxRepository.create({
      id: '',
      message_id: payload.messageId,
      user_id: user.id,
      from_address: payload.from,
      to_address: payload.to,
      subject: payload.subject,
      text_body: payload.textBody,
      html_body: payload.htmlBody,
      attachments: JSON.stringify(payload.attachments),
      is_read: false,
      is_starred: false,
      folder: 'inbox',
      in_reply_to: payload.inReplyTo,
      references: payload.references,
      received_at: payload.receivedAt,
    });

    logger.info(`Email stored for user ${user.id}`, { emailId: email.id, from: payload.from });
    return { success: true, data: { emailId: email.id } };
  } catch (error) {
    logger.error('Failed to process inbound email:', error);
    return {
      success: false,
      error: { code: 'INBOUND_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to process inbound email' },
    };
  }
}

export async function listEmails(
  userId: string,
  folder: EmailFolder = 'inbox',
  limit: number = 20,
  offset: number = 0,
  isRead?: boolean
): Promise<ServiceResult<PaginatedResult<EmailListItem>>> {
  try {
    const result = await emailInboxRepository.listByUserFolder(userId, folder, limit, offset, isRead);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to list emails:', error);
    return {
      success: false,
      error: { code: 'LIST_EMAILS_FAILED', message: error instanceof Error ? error.message : 'Failed to list emails' },
    };
  }
}

export async function getEmail(
  userId: string,
  emailId: string,
  markAsRead: boolean = true
): Promise<ServiceResult<EmailEntity>> {
  try {
    const email = await emailInboxRepository.getFullEmail(emailId, userId);
    if (!email) {
      return {
        success: false,
        error: { code: 'EMAIL_NOT_FOUND', message: 'Email not found' },
      };
    }

    if (markAsRead && !email.is_read) {
      await emailInboxRepository.markAsRead(emailId);
      email.is_read = true;
    }

    return { success: true, data: email };
  } catch (error) {
    logger.error('Failed to get email:', error);
    return {
      success: false,
      error: { code: 'GET_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to get email' },
    };
  }
}

export async function updateEmail(
  userId: string,
  emailId: string,
  updates: { is_read?: boolean; is_starred?: boolean; folder?: EmailFolder }
): Promise<ServiceResult<EmailEntity>> {
  try {
    const email = await emailInboxRepository.getFullEmail(emailId, userId);
    if (!email) {
      return {
        success: false,
        error: { code: 'EMAIL_NOT_FOUND', message: 'Email not found' },
      };
    }

    const updated = await emailInboxRepository.update(emailId, updates as Partial<EmailEntity>);
    if (!updated) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update email' },
      };
    }

    return { success: true, data: updated };
  } catch (error) {
    logger.error('Failed to update email:', error);
    return {
      success: false,
      error: { code: 'UPDATE_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to update email' },
    };
  }
}

export async function deleteEmail(
  userId: string,
  emailId: string
): Promise<ServiceResult<{ deleted: boolean }>> {
  try {
    const email = await emailInboxRepository.getFullEmail(emailId, userId);
    if (!email) {
      return {
        success: false,
        error: { code: 'EMAIL_NOT_FOUND', message: 'Email not found' },
      };
    }

    if (email.folder === 'trash') {
      const deleted = await emailInboxRepository.delete(emailId);
      return { success: true, data: { deleted } };
    }

    await emailInboxRepository.moveToFolder(emailId, 'trash');
    return { success: true, data: { deleted: true } };
  } catch (error) {
    logger.error('Failed to delete email:', error);
    return {
      success: false,
      error: { code: 'DELETE_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to delete email' },
    };
  }
}

export async function sendNewEmail(
  userId: string,
  to: string,
  subject: string,
  textBody: string,
  htmlBody: string
): Promise<ServiceResult<{ emailId: string }>> {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      };
    }

    const fromAddress = `${user.name}@${PLATFORM_DOMAIN}`;

    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    if (!apiToken || !accountId) {
      return {
        success: false,
        error: { code: 'EMAIL_CONFIG_MISSING', message: 'Cloudflare email configuration not found' },
      };
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to,
          subject,
          html: htmlBody,
          text: textBody,
        }),
      }
    );

    const result = await response.json() as { success: boolean; errors?: Array<{ message: string }> };
    if (!result.success) {
      const errMsg = result.errors?.[0]?.message || 'Cloudflare email send failed';
      return {
        success: false,
        error: { code: 'EMAIL_SEND_FAILED', message: errMsg },
      };
    }

    const messageId = `<${crypto.randomUUID()}@${PLATFORM_DOMAIN}>`;
    const email = await emailInboxRepository.create({
      id: '',
      message_id: messageId,
      user_id: userId,
      from_address: fromAddress,
      to_address: to,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      attachments: '[]',
      is_read: true,
      is_starred: false,
      folder: 'sent',
      in_reply_to: null,
      references: null,
      received_at: new Date().toISOString(),
    });

    logger.info(`Email sent by user ${userId}`, { emailId: email.id, to });
    return { success: true, data: { emailId: email.id } };
  } catch (error) {
    logger.error('Failed to send email:', error);
    return {
      success: false,
      error: { code: 'SEND_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to send email' },
    };
  }
}

export async function replyToEmail(
  userId: string,
  emailId: string,
  textBody: string,
  htmlBody: string
): Promise<ServiceResult<{ emailId: string }>> {
  try {
    const original = await emailInboxRepository.getFullEmail(emailId, userId);
    if (!original) {
      return {
        success: false,
        error: { code: 'EMAIL_NOT_FOUND', message: 'Original email not found' },
      };
    }

    const user = await userRepository.getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      };
    }

    const fromAddress = `${user.name}@${PLATFORM_DOMAIN}`;
    const replyTo = original.from_address;
    const subject = original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`;

    const refs = original.references
      ? `${original.references} ${original.message_id}`
      : original.message_id;

    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    if (!apiToken || !accountId) {
      return {
        success: false,
        error: { code: 'EMAIL_CONFIG_MISSING', message: 'Cloudflare email configuration not found' },
      };
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: replyTo,
          subject,
          html: htmlBody,
          text: textBody,
          headers: {
            'In-Reply-To': original.message_id,
            'References': refs,
          },
        }),
      }
    );

    const result = await response.json() as { success: boolean; errors?: Array<{ message: string }> };
    if (!result.success) {
      const errMsg = result.errors?.[0]?.message || 'Cloudflare email send failed';
      return {
        success: false,
        error: { code: 'EMAIL_SEND_FAILED', message: errMsg },
      };
    }

    const messageId = `<${crypto.randomUUID()}@${PLATFORM_DOMAIN}>`;
    const email = await emailInboxRepository.create({
      id: '',
      message_id: messageId,
      user_id: userId,
      from_address: fromAddress,
      to_address: replyTo,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      attachments: '[]',
      is_read: true,
      is_starred: false,
      folder: 'sent',
      in_reply_to: original.message_id,
      references: refs,
      received_at: new Date().toISOString(),
    });

    logger.info(`Reply sent by user ${userId}`, { emailId: email.id, to: replyTo });
    return { success: true, data: { emailId: email.id } };
  } catch (error) {
    logger.error('Failed to reply to email:', error);
    return {
      success: false,
      error: { code: 'REPLY_EMAIL_FAILED', message: error instanceof Error ? error.message : 'Failed to reply to email' },
    };
  }
}

export async function getUnreadCount(
  userId: string,
  folder: EmailFolder = 'inbox'
): Promise<ServiceResult<{ count: number }>> {
  try {
    const count = await emailInboxRepository.getUnreadCount(userId, folder);
    return { success: true, data: { count } };
  } catch (error) {
    logger.error('Failed to get unread count:', error);
    return {
      success: false,
      error: { code: 'UNREAD_COUNT_FAILED', message: error instanceof Error ? error.message : 'Failed to get unread count' },
    };
  }
}
