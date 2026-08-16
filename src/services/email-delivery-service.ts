import { createEmailClient } from '@opencoredev/email-sdk';
import { cloudflare } from '@opencoredev/email-sdk/cloudflare';
import { logger } from '../config/logger.js';
import { successResult, errorResult } from '../types/service-result.js';
import type { ServiceResult } from '../types/service-result.js';
import fs from 'fs/promises';
import path from 'path';
import { userRepository } from '../repositories/user-repository.js';
import { shouldSendEmail } from './email-preference-service.js';
import type { EmailType } from '../models/email-preference.js';

type EmailTemplate =
  | 'proposal_accepted'
  | 'milestone_approved'
  | 'payment_released'
  | 'dispute_created'
  | 'contract_created'
  | 'message_received'
  | 'review_received'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'weekly_digest';

type EmailData = {
  to: string;
  subject: string;
  template: EmailTemplate;
  data: Record<string, any>;
};

let emailClient: ReturnType<typeof createEmailClient> | null = null;

function getEmailClient() {
  if (emailClient) {
    return emailClient;
  }

  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

  if (!apiToken || !accountId) {
    logger.warn('Cloudflare email configuration not found, email sending disabled');
    throw new Error('Cloudflare email configuration not found');
  }

  emailClient = createEmailClient({
    adapters: [
      cloudflare({
        apiToken,
        accountId,
      }),
    ],
    retry: { retries: 1 },
  });

  return emailClient;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderTemplate(template: EmailTemplate, data: Record<string, any>): Promise<string> {
  try {
    const templatePath = path.join(process.cwd(), 'docs/email-templates', `${template}.html`);
    let html = await fs.readFile(templatePath, 'utf-8');

    // {{#each key}}...{{/each}} — repeat the block once per item in an array.
    // Used by the weekly digest to list top projects. Items are plain objects
    // whose fields are substituted as {{field}} inside the block, then escaped.
    html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, key, block) => {
      const items = data[key];
      if (!Array.isArray(items)) {
        return '';
      }
      return items.map((item: Record<string, any>) =>
        block.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m: string, field: string) => escapeHtml(String(item[field] ?? '')))
      ).join('');
    });

    // HTML-escape all template variables to prevent injection
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      html = html.replace(regex, escapeHtml(String(data[key])));
    });

    return html;
  } catch (error) {
    logger.error('Failed to render email template:', error);
    const escaped = escapeHtml(JSON.stringify(data, null, 2));
    return `<html><body><pre>${escaped}</pre></body></html>`;
  }
}

export async function sendEmail(emailData: EmailData): Promise<ServiceResult<{ messageId: string }>> {
  try {
    const client = getEmailClient();
    const html = await renderTemplate(emailData.template, emailData.data);

    const emailFrom = process.env['EMAIL_FROM'] || 'noreply@freelancexchain.com';

    const result = await client.send({
      from: emailFrom,
      to: emailData.to,
      subject: emailData.subject,
      html,
    });

    logger.info(`Email sent successfully to ${emailData.to}`, { messageId: result.id });

    return successResult({ messageId: result.id ?? 'unknown' });
  } catch (error) {
    logger.error('Failed to send email:', error);
    return errorResult('EMAIL_SEND_FAILED', error instanceof Error ? error.message : 'Failed to send email');
  }
}

export async function sendProposalAcceptedEmail(
  to: string,
  data: { freelancerName: string; projectTitle: string; projectUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'Your proposal has been accepted!',
    template: 'proposal_accepted',
    data,
  });
}

export async function sendMilestoneApprovedEmail(
  to: string,
  data: { freelancerName: string; milestoneTitle: string; amount: string; contractUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'Milestone approved - Payment released',
    template: 'milestone_approved',
    data,
  });
}

export async function sendPaymentReleasedEmail(
  to: string,
  data: { recipientName: string; amount: string; contractTitle: string; transactionHash: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'Payment released',
    template: 'payment_released',
    data,
  });
}

export async function sendDisputeCreatedEmail(
  to: string,
  data: { arbiterName: string; contractTitle: string; disputeReason: string; disputeUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'New dispute requires your attention',
    template: 'dispute_created',
    data,
  });
}

export async function sendContractCreatedEmail(
  to: string,
  data: { recipientName: string; projectTitle: string; contractUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'New contract created',
    template: 'contract_created',
    data,
  });
}

export async function sendMessageReceivedEmail(
  to: string,
  data: { recipientName: string; senderName: string; messagePreview: string; conversationUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: `New message from ${data.senderName}`,
    template: 'message_received',
    data,
  });
}

export async function sendReviewReceivedEmail(
  to: string,
  data: { recipientName: string; reviewerName: string; rating: number; projectTitle: string; reviewUrl: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'You received a new review',
    template: 'review_received',
    data,
  });
}

export async function sendKycApprovedEmail(
  to: string,
  data: { userName: string; tier: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'KYC verification approved',
    template: 'kyc_approved',
    data,
  });
}

export async function sendKycRejectedEmail(
  to: string,
  data: { userName: string; reason: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'KYC verification requires attention',
    template: 'kyc_rejected',
    data,
  });
}

export async function sendWeeklyDigestEmail(
  to: string,
  data: {
    userName: string;
    newProjects: number;
    newMessages: number;
    pendingMilestones: number;
    weeklyEarnings?: string;
    topProjects: Array<{ title: string; budget: string; url: string }>;
  }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'Your weekly FreelanceXchain digest',
    template: 'weekly_digest',
    data,
  });
}

type EmailRecipient = { email: string; name: string };

/**
 * Send an email to a user, gated by their email preferences.
 *
 * Looks up the recipient's email + display name, checks `shouldSendEmail` for
 * the given email type, and only calls the sender when both succeed.
 * Best-effort by design: preference lookups, missing emails, and send failures
 * are logged and return false — an email must never break the primary flow
 * (mirrors how notification creation is best-effort at the same call sites).
 */
export async function sendGatedEmail(
  userId: string,
  emailType: EmailType,
  send: (recipient: EmailRecipient) => Promise<ServiceResult<{ messageId: string }>> | ServiceResult<{ messageId: string }>,
): Promise<boolean> {
  try {
    const [allowed, user] = await Promise.all([
      shouldSendEmail(userId, emailType),
      userRepository.getUserById(userId),
    ]);
    if (!allowed || !user?.email) {
      logger.info('Email skipped by preference or missing address', { userId, emailType, allowed });
      return false;
    }
    const recipient: EmailRecipient = { email: user.email, name: user.name || user.email };
    const result = await send(recipient);
    return result.success;
  } catch (error) {
    logger.error('Failed to send gated email', { error, userId, emailType });
    return false;
  }
}

export async function testEmailConfiguration(): Promise<ServiceResult<{ verified: boolean }>> {
  try {
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

    if (!apiToken || !accountId) {
      throw new Error('Cloudflare email configuration not found');
    }

    logger.info('Email configuration verified successfully');

    return successResult({ verified: true });
  } catch (error) {
    logger.error('Email configuration verification failed:', error);
    return errorResult('EMAIL_CONFIG_INVALID', error instanceof Error ? error.message : 'Email configuration is invalid');
  }
}
