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
import {
  emailDeliveryFailureRepository,
} from '../repositories/email-delivery-failure-repository.js';
import type { EmailDeliveryFailureEntity } from '../models/email-delivery-failure.js';
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

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplateNav(subject: string): string {
  return `<tr>
    <td align="center" style="padding-bottom: 24px;">
      <div style="display: inline-block; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 9999px; padding: 10px 24px; box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.05);">
        <table role="presentation" style="border-collapse: collapse; margin: 0 auto;">
          <tr>
            <td style="vertical-align: middle; padding-right: 8px;">
              <svg width="26" height="26" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                <rect x="0" y="37" width="100" height="26" rx="13" transform="rotate(45 50 50)" fill="none" stroke="#10b981" stroke-width="11" />
                <rect x="0" y="37" width="100" height="26" rx="13" transform="rotate(-45 50 50)" fill="none" stroke="#059669" stroke-width="11" />
              </svg>
            </td>
            <td style="vertical-align: middle;">
              <span style="font-size: 19px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; line-height: 1;">
                Freelance<span style="color: #10b981; font-weight: 900;">X</span>chain
              </span>
            </td>
          </tr>
        </table>
      </div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 8px 16px 28px; text-align: center;">
      <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 6px 16px; margin-bottom: 18px;">
        <span style="color: #065f46; font-size: 12px; font-weight: 700; letter-spacing: 0.2px;">
          ✨ AI Skill Matching &bull; Smart Contract Escrow &rarr;
        </span>
      </div>
      <h1 style="margin: 0 0 12px; font-size: 30px; font-weight: 800; color: #0f172a; letter-spacing: -0.8px; line-height: 1.25;">
        ${escapeHtml(subject)}
      </h1>
      <div style="margin: 24px 0 20px;">
        <a href="https://freelancexchain.works/dashboard" target="_blank" style="display: inline-block; padding: 14px 38px; background-color: #064e3b; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 9999px; box-shadow: 0 4px 14px rgba(6, 78, 59, 0.3); letter-spacing: 0.1px;">
          Open Dashboard &rarr;
        </a>
      </div>
      <table role="presentation" style="margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 10px; font-size: 12px; color: #475569; font-weight: 600;">
            <span style="color: #10b981; font-weight: 800; margin-right: 4px;">✓</span> 100% Smart Contract Escrow
          </td>
          <td style="padding: 4px 10px; font-size: 12px; color: #475569; font-weight: 600;">
            <span style="color: #10b981; font-weight: 800; margin-right: 4px;">✓</span> AI Skill Matching
          </td>
          <td style="padding: 4px 10px; font-size: 12px; color: #475569; font-weight: 600;">
            <span style="color: #10b981; font-weight: 800; margin-right: 4px;">✓</span> Verified Escrow
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderTemplateCard(senderTitle: string, formattedContent: string): string {
  return `<tr>
    <td style="padding: 0 12px;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04); overflow: hidden;">
        <tr>
          <td style="padding: 20px 28px 16px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td>
                  <div style="font-size: 15px; font-weight: 700; color: #0f172a;">Official Platform Dispatch</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 2px;">From: ${escapeHtml(senderTitle)}</div>
                </td>
                <td align="right">
                  <span style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: #065f46;">Verified 🛡️</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px;">
            <div style="color: #334155; font-size: 15px; line-height: 1.7;">${formattedContent}</div>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px; margin-top: 20px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 24px; vertical-align: middle; font-size: 16px;">🛡️</td>
                  <td style="vertical-align: middle; font-size: 12px; color: #166534; line-height: 1.4;">
                    <strong>Escrow Protected:</strong> FreelanceXchain automatically safeguards communication and contract agreements on-chain.
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderTemplateFooter(): string {
  return `<tr>
    <td align="center" style="padding: 32px 16px; text-align: center;">
      <p style="margin: 0 0 6px; color: #64748b; font-size: 12px; font-weight: 600;">&copy; 2026 FreelanceXchain. The Next-Gen Decentralized Freelance Marketplace.</p>
      <p style="margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.5;">Polygon Network &bull; Smart Contract Escrow &bull; Portable On-Chain Reputation &bull; AI Skill Matching</p>
    </td>
  </tr>`;
}

function wrapInBrandedTemplate(subject: string, bodyTextOrHtml = '', senderTitle = 'FreelanceXchain Support'): string {
  const content = bodyTextOrHtml || '';
  if (content.includes('<html') || content.includes('<!DOCTYPE')) {
    return content;
  }

  const formattedContent = content.includes('<p>') || content.includes('<div>')
    ? content
    : content
        .split(/\n\n+/)
        .map((p) => `<p style="margin: 0 0 16px; color: #334155; font-size: 15px; line-height: 1.7;">${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" style="max-width: 620px; width: 100%; border-collapse: collapse;">
          ${renderTemplateNav(subject)}
          ${renderTemplateCard(senderTitle, formattedContent)}
          ${renderTemplateFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

/**
 * Best-effort record of a permanently rejected inbound email (INVALID_RECIPIENT
 * / USER_NOT_FOUND). These can never succeed on retry, so they are recorded
 * for ops visibility instead of relying on Cloudflare's bounce alone. A failed
 * record write is logged and swallowed — recording must never break the
 * webhook response path.
 */
export async function recordInboundDeliveryFailure(
  payload: InboundEmailPayload,
  failureCode: string,
  failureMessage: string
): Promise<void> {
  try {
    await emailDeliveryFailureRepository.createFailure({
      id: '',
      message_id: payload.messageId,
      from_address: payload.from,
      to_address: payload.to,
      subject: payload.subject,
      failure_code: failureCode,
      failure_message: failureMessage,
      received_at: payload.receivedAt,
    });
  } catch (error) {
    logger.error('Failed to record inbound email delivery failure', { error, failureCode });
  }
}

/**
 * Most recent inbound delivery failures for the admin ops view.
 */
export async function getRecentDeliveryFailures(limit = 50): Promise<EmailDeliveryFailureEntity[]> {
  return emailDeliveryFailureRepository.findRecent(limit);
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

export type ListEmailsOptions = {
  folder?: EmailFolder;
  limit?: number;
  offset?: number;
  isRead?: boolean;
};

export async function listEmails(
  userId: string,
  options: ListEmailsOptions = {}
): Promise<ServiceResult<PaginatedResult<EmailListItem>>> {
  const { folder = 'inbox', limit = 20, offset = 0, isRead } = options;
  try {
    const result = await emailInboxRepository.listByUserFolder(userId, { folder, limit, offset, ...(isRead !== undefined ? { isRead } : {}) });
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

export type SenderProfileKey = 'support' | 'admin' | 'security' | 'team' | 'noreply';

export type SenderProfileInfo = {
  key: SenderProfileKey;
  name: string;
  email: string;
  description: string;
};

export const SENDER_PROFILES: Record<SenderProfileKey, SenderProfileInfo> = {
  support: {
    key: 'support',
    name: 'FreelanceXchain Support',
    email: `support@${PLATFORM_DOMAIN}`,
    description: 'Customer & Freelancer Assistance',
  },
  admin: {
    key: 'admin',
    name: 'FreelanceXchain Admin',
    email: `admin@${PLATFORM_DOMAIN}`,
    description: 'Platform Operations & Management',
  },
  security: {
    key: 'security',
    name: 'FreelanceXchain Security',
    email: `security@${PLATFORM_DOMAIN}`,
    description: 'Escrow, Disputes & KYC Security',
  },
  team: {
    key: 'team',
    name: 'FreelanceXchain Team',
    email: `team@${PLATFORM_DOMAIN}`,
    description: 'Community & Ecosystem Updates',
  },
  noreply: {
    key: 'noreply',
    name: 'FreelanceXchain Notifications',
    email: `noreply@${PLATFORM_DOMAIN}`,
    description: 'Automated Platform Notifications',
  },
};

export function getSenderProfiles(): SenderProfileInfo[] {
  return Object.values(SENDER_PROFILES);
}

function resolveSenderProfile(profileKey?: string, customName?: string): { displayName: string; emailAddress: string; title: string } {
  const profile = (profileKey && SENDER_PROFILES[profileKey as SenderProfileKey])
    ? SENDER_PROFILES[profileKey as SenderProfileKey]
    : SENDER_PROFILES['support'];

  const displayName = customName?.trim() || profile.name;
  return {
    displayName,
    emailAddress: profile.email,
    title: profile.description,
  };
}

export type SendNewEmailInput = {
  userId: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  senderProfile?: SenderProfileKey | string;
  senderName?: string;
};

async function dispatchCloudflareSend(params: {
  formattedFrom: string;
  to: string;
  subject: string;
  brandedHtml: string;
  textBody: string;
}): Promise<string | null> {
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

  if (!apiToken || !accountId) {
    return 'EMAIL_CONFIG_MISSING';
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
        from: params.formattedFrom,
        to: params.to,
        subject: params.subject,
        html: params.brandedHtml,
        text: params.textBody,
      }),
    }
  );

  return readCloudflareSendError(response);
}

async function syncSendToRecipientInbox(params: {
  userId: string;
  messageId: string;
  to: string;
  formattedFrom: string;
  subject: string;
  textBody: string;
  brandedHtml: string;
}): Promise<void> {
  try {
    const recipientUser = await userRepository.getUserByEmail(params.to);
    if (recipientUser && recipientUser.id !== params.userId) {
      await emailInboxRepository.create({
        id: '',
        message_id: params.messageId,
        user_id: recipientUser.id,
        from_address: params.formattedFrom,
        to_address: params.to,
        subject: params.subject,
        text_body: params.textBody,
        html_body: params.brandedHtml,
        attachments: '[]',
        is_read: false,
        is_starred: false,
        folder: 'inbox',
        in_reply_to: null,
        references: null,
        received_at: new Date().toISOString(),
      });
    }
  } catch {
    // Best-effort delivery to recipient inbox
  }
}

export type SendNewEmailOptions = {
  html?: string;
  senderProfile?: SenderProfileKey | string;
  senderName?: string;
};

export async function sendNewEmail(
  userIdOrInput: string | SendNewEmailInput,
  toParam?: string,
  subjectParam?: string,
  textBodyOrOptions?: string | SendNewEmailOptions,
  ...rest: Array<string | undefined>
): Promise<ServiceResult<{ emailId: string }>> {
  let userId = '';
  let to = '';
  let subject = '';
  let textBody = '';
  let htmlBody = '';
  let senderProfile: SenderProfileKey | string | undefined;
  let senderName: string | undefined;

  if (typeof userIdOrInput === 'object') {
    userId = userIdOrInput.userId;
    to = userIdOrInput.to;
    subject = userIdOrInput.subject;
    textBody = userIdOrInput.textBody || '';
    htmlBody = userIdOrInput.htmlBody || textBody;
    senderProfile = userIdOrInput.senderProfile;
    senderName = userIdOrInput.senderName;
  } else {
    userId = userIdOrInput;
    to = toParam || '';
    subject = subjectParam || '';
    textBody = typeof textBodyOrOptions === 'string' ? textBodyOrOptions : '';
    const [htmlParam, profileParam, nameParam] = rest;
    htmlBody = typeof htmlParam === 'string' ? htmlParam : (typeof textBodyOrOptions === 'object' && textBodyOrOptions?.html ? textBodyOrOptions.html : textBody);
    senderProfile = typeof textBodyOrOptions === 'object' && textBodyOrOptions?.senderProfile ? textBodyOrOptions.senderProfile : profileParam;
    senderName = typeof textBodyOrOptions === 'object' && textBodyOrOptions?.senderName ? textBodyOrOptions.senderName : nameParam;
  }

  try {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      return errorResult('USER_NOT_FOUND', 'User not found');
    }

    const { displayName, emailAddress, title } = resolveSenderProfile(senderProfile, senderName || user.name);
    const formattedFrom = `${displayName} <${emailAddress}>`;
    const brandedHtml = wrapInBrandedTemplate(subject, htmlBody || textBody, `${displayName} (${title})`);

    const sendError = await dispatchCloudflareSend({
      formattedFrom,
      to,
      subject,
      brandedHtml,
      textBody: textBody || htmlBody,
    });

    if (sendError === 'EMAIL_CONFIG_MISSING') {
      return errorResult('EMAIL_CONFIG_MISSING', 'Cloudflare email configuration is missing');
    }
    if (sendError) {
      return errorResult('EMAIL_SEND_FAILED', sendError);
    }

    const messageId = `<${crypto.randomUUID()}@${PLATFORM_DOMAIN}>`;
    const email = await emailInboxRepository.create({
      id: '',
      message_id: messageId,
      user_id: userId,
      from_address: formattedFrom,
      to_address: to,
      subject,
      text_body: textBody || htmlBody,
      html_body: brandedHtml,
      attachments: '[]',
      is_read: true,
      is_starred: false,
      folder: 'sent',
      in_reply_to: null,
      references: null,
      received_at: new Date().toISOString(),
    });

    await syncSendToRecipientInbox({
      userId,
      messageId,
      to,
      formattedFrom,
      subject,
      textBody: textBody || htmlBody,
      brandedHtml,
    });

    logger.info(`Email sent by user ${userId}`, { emailId: email.id, to, profile: displayName });
    return successResult({ emailId: email.id });
  } catch (error) {
    logger.error('Failed to send email:', error);
    return errorResult('SEND_EMAIL_FAILED', error instanceof Error ? error.message : 'Failed to send email');
  }
}


export interface ReplyToEmailOptions {
  html?: string;
  senderProfile?: string;
  senderName?: string;
}

async function dispatchCloudflareReply(params: {
  formattedFrom: string;
  replyTo: string;
  subject: string;
  brandedHtml: string;
  textBody: string;
  originalMessageId: string;
  refs: string;
}): Promise<string | null> {
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

  if (!apiToken || !accountId) {
    return 'EMAIL_CONFIG_MISSING';
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
        from: params.formattedFrom,
        to: params.replyTo,
        subject: params.subject,
        html: params.brandedHtml,
        text: params.textBody,
        headers: {
          'In-Reply-To': params.originalMessageId,
          'References': params.refs,
        },
      }),
    }
  );

  return readCloudflareSendError(response);
}

async function syncReplyToRecipientInbox(params: {
  userId: string;
  messageId: string;
  formattedFrom: string;
  replyTo: string;
  subject: string;
  textBody: string;
  brandedHtml: string;
  originalMessageId: string;
  refs: string;
}): Promise<void> {
  try {
    const recipientUser = await userRepository.getUserByEmail(params.replyTo);
    if (recipientUser && recipientUser.id !== params.userId) {
      await emailInboxRepository.create({
        id: '',
        message_id: params.messageId,
        user_id: recipientUser.id,
        from_address: params.formattedFrom,
        to_address: params.replyTo,
        subject: params.subject,
        text_body: params.textBody,
        html_body: params.brandedHtml,
        attachments: '[]',
        is_read: false,
        is_starred: false,
        folder: 'inbox',
        in_reply_to: params.originalMessageId,
        references: params.refs,
        received_at: new Date().toISOString(),
      });
    }
  } catch {
    // Best-effort delivery to recipient inbox
  }
}

export async function replyToEmail(
  userId: string,
  emailId: string,
  textBody: string,
  htmlBodyOrOptions?: string | ReplyToEmailOptions
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

    const options = typeof htmlBodyOrOptions === 'object' ? htmlBodyOrOptions : undefined;
    const htmlBody = typeof htmlBodyOrOptions === 'string' ? htmlBodyOrOptions : options?.html || textBody;

    const { displayName, emailAddress, title } = resolveSenderProfile(options?.senderProfile, options?.senderName || user.name);
    const formattedFrom = `${displayName} <${emailAddress}>`;
    const replyTo = original.from_address;
    const subject = original.subject.startsWith('Re: ') ? original.subject : `Re: ${original.subject}`;
    const brandedHtml = wrapInBrandedTemplate(subject, htmlBody || textBody, `${displayName} (${title})`);
    const refs = original.references ? `${original.references} ${original.message_id}` : original.message_id;

    const sendError = await dispatchCloudflareReply({
      formattedFrom,
      replyTo,
      subject,
      brandedHtml,
      textBody: textBody || htmlBody,
      originalMessageId: original.message_id,
      refs,
    });

    if (sendError === 'EMAIL_CONFIG_MISSING') {
      return errorResult('EMAIL_CONFIG_MISSING', 'Cloudflare email configuration is missing');
    }
    if (sendError) {
      return errorResult('EMAIL_SEND_FAILED', sendError);
    }

    const messageId = `<${crypto.randomUUID()}@${PLATFORM_DOMAIN}>`;
    const email = await emailInboxRepository.create({
      id: '',
      message_id: messageId,
      user_id: userId,
      from_address: formattedFrom,
      to_address: replyTo,
      subject,
      text_body: textBody || htmlBody,
      html_body: brandedHtml,
      attachments: '[]',
      is_read: true,
      is_starred: false,
      folder: 'sent',
      in_reply_to: original.message_id,
      references: refs,
      received_at: new Date().toISOString(),
    });

    await syncReplyToRecipientInbox({
      userId,
      messageId,
      formattedFrom,
      replyTo,
      subject,
      textBody: textBody || htmlBody,
      brandedHtml,
      originalMessageId: original.message_id,
      refs,
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
