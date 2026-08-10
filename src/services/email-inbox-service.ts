import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
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

type CloudflareSendResponse = { success: boolean; errors?: Array<{ message: string }> };

/**
 * Interprets a Cloudflare email-send response.
 *
 * `fetch` resolves rather than rejects on HTTP 4xx/5xx, so the status is checked
 * before the body is read as a send result. On an error status Cloudflare may
 * return a non-JSON body (auth, gateway or rate-limit pages), so it is read as
 * text and only then parsed opportunistically.
 *
 * Returns an error message, or null when the send succeeded.
 */
async function readCloudflareSendError(response: Response): Promise<string | null> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let apiMessage: string | undefined;
    try {
      apiMessage = (JSON.parse(body) as CloudflareSendResponse).errors?.[0]?.message;
    } catch {
      apiMessage = undefined;
    }
    return apiMessage || `Cloudflare email send failed with HTTP ${response.status}`;
  }

  const result = (await response.json()) as CloudflareSendResponse;
  if (!result.success) {
    return result.errors?.[0]?.message || 'Cloudflare email send failed';
  }

  return null;
}

function extractUsername(toAddress: string): string | null {
  const match = toAddress.match(/^([^@]+)@(.+)$/);
  if (!match) return null;
  const [, localPart, domain] = match;
  if (domain !== PLATFORM_DOMAIN) return null;
  /* istanbul ignore next -- regex capture group [^@]+ always produces a string */
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
      return errorResult('INVALID_RECIPIENT', `Recipient address not on platform domain: ${payload.to}`);
    }

    const user = await userRepository.findOne('name', username);
    if (!user) {
      logger.warn(`Inbound email to unknown user: ${username}@${PLATFORM_DOMAIN}`);
      return errorResult('USER_NOT_FOUND', `No user found with username: ${username}`);
    }

    const existing = await emailInboxRepository.findByMessageId(payload.messageId);
    if (existing) {
      return successResult({ emailId: existing.id });
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
    return successResult({ emailId: email.id });
  } catch (error) {
    logger.error('Failed to process inbound email:', error);
    return errorResult('INBOUND_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to process inbound email');
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
    return successResult(result);
  } catch (error) {
    logger.error('Failed to list emails:', error);
    return errorResult('LIST_EMAILS_FAILED', error instanceof Error ? error.message : 'Failed to list emails');
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
      return errorResult('EMAIL_NOT_FOUND', 'Email not found');
    }

    if (markAsRead && !email.is_read) {
      await emailInboxRepository.markAsRead(emailId);
      email.is_read = true;
    }

    return successResult(email);
  } catch (error) {
    logger.error('Failed to get email:', error);
    return errorResult('GET_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to get email');
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
      return errorResult('EMAIL_NOT_FOUND', 'Email not found');
    }

    const updated = await emailInboxRepository.update(emailId, updates as Partial<EmailEntity>);
    if (!updated) {
      return errorResult('UPDATE_FAILED', 'Failed to update email');
    }

    return successResult(updated);
  } catch (error) {
    logger.error('Failed to update email:', error);
    return errorResult('UPDATE_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to update email');
  }
}

export async function deleteEmail(
  userId: string,
  emailId: string
): Promise<ServiceResult<{ deleted: boolean }>> {
  try {
    const email = await emailInboxRepository.getFullEmail(emailId, userId);
    if (!email) {
      return errorResult('EMAIL_NOT_FOUND', 'Email not found');
    }

    if (email.folder === 'trash') {
      const deleted = await emailInboxRepository.delete(emailId);
      return successResult({ deleted });
    }

    await emailInboxRepository.moveToFolder(emailId, 'trash');
    return successResult({ deleted: true });
  } catch (error) {
    logger.error('Failed to delete email:', error);
    return errorResult('DELETE_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to delete email');
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
      return errorResult('USER_NOT_FOUND', 'User not found');
    }

    const fromAddress = `${user.name}@${PLATFORM_DOMAIN}`;

    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    if (!apiToken || !accountId) {
      return errorResult('EMAIL_CONFIG_MISSING', 'Cloudflare email configuration not found');
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

    const sendError = await readCloudflareSendError(response);
    if (sendError) {
      return errorResult('EMAIL_SEND_FAILED', sendError);
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
    return successResult({ emailId: email.id });
  } catch (error) {
    logger.error('Failed to send email:', error);
    return errorResult('SEND_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to send email');
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
      return errorResult('EMAIL_NOT_FOUND', 'Original email not found');
    }

    const user = await userRepository.getUserById(userId);
    if (!user) {
      return errorResult('USER_NOT_FOUND', 'User not found');
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
      return errorResult('EMAIL_CONFIG_MISSING', 'Cloudflare email configuration not found');
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

    const sendError = await readCloudflareSendError(response);
    if (sendError) {
      return errorResult('EMAIL_SEND_FAILED', sendError);
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
    return successResult({ emailId: email.id });
  } catch (error) {
    logger.error('Failed to reply to email:', error);
    return errorResult('REPLY_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to reply to email');
  }
}

export async function getUnreadCount(
  userId: string,
  folder: EmailFolder = 'inbox'
): Promise<ServiceResult<{ count: number }>> {
  try {
    const count = await emailInboxRepository.getUnreadCount(userId, folder);
    return successResult({ count });
  } catch (error) {
    logger.error('Failed to get unread count:', error);
    return errorResult('UNREAD_COUNT_FAILED', error instanceof Error ? error.message : 'Failed to get unread count');
  }
}
