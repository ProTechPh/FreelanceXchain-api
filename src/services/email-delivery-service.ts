import { logger } from '../config/logger.js';
import { successResult, errorResult } from '../types/service-result.js';
import type { ServiceResult } from '../types/service-result.js';
import fs from 'fs/promises';
import path from 'path';
import { userRepository } from '../repositories/user-repository.js';
import { shouldSendEmail } from './email-preference-service.js';
import type { EmailType } from '../models/email-preference.js';

import { fileURLToPath } from 'url';

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

let emailClient: any = null;

async function getEmailClient() {
  if (emailClient) {
    return emailClient;
  }

  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];

  if (!apiToken || !accountId) {
    logger.warn('Cloudflare email configuration not found, email sending disabled');
    throw new Error('Cloudflare email configuration not found');
  }

  const { createEmailClient } = await import('@opencoredev/email-sdk');
  const { cloudflare } = await import('@opencoredev/email-sdk/cloudflare');

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

async function loadTemplateContent(template: EmailTemplate): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.join(process.cwd(), 'docs/email-templates', `${template}.html`),
    path.join(process.cwd(), 'FreelanceXchain-api/docs/email-templates', `${template}.html`),
    path.join(currentDir, '../../docs/email-templates', `${template}.html`),
    path.join(currentDir, '../docs/email-templates', `${template}.html`),
    path.join(currentDir, '../../../docs/email-templates', `${template}.html`),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = await fs.readFile(candidatePath, 'utf-8');
      if (content && content.trim().length > 0) {
        return content;
      }
    } catch {
      // Continue to next candidate path
    }
  }

  // Final attempt with standard relative path from cwd
  return await fs.readFile(path.join(process.cwd(), 'docs/email-templates', `${template}.html`), 'utf-8');
}

function renderFallbackBrandedHtml(template: EmailTemplate, data: Record<string, any>): string {
  const recipientName = escapeHtml(data.recipientName ?? data.userName ?? 'User');
  const title = escapeHtml(template.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  const appUrl = escapeHtml(process.env['FRONTEND_URL'] || 'https://freelancexchain.works');

  const detailsRows = Object.entries(data)
    .filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && k !== 'template')
    .map(([k, v]) => {
      const label = escapeHtml(k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '));
      const val = escapeHtml(String(v));
      return `<tr><td style="padding: 6px 12px 6px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: capitalize;">${label}:</td><td style="padding: 6px 0; color: #0f172a; font-size: 13px; font-weight: 700;">${val}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} - FreelanceXchain</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden;">
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #064e3b 0%, #022c22 100%); color: #ffffff;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td><span style="font-size: 20px; font-weight: 800; color: #ffffff;">Freelance<span style="color: #10b981;">X</span>chain</span></td>
                  <td align="right"><span style="background-color: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; border-radius: 9999px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: #a7f3d0;">Live Notification</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 800; color: #0f172a;">${title}</h2>
              <p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                ${detailsRows}
              </table>
              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="${appUrl}" target="_blank" style="display: inline-block; padding: 12px 32px; background-color: #064e3b; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 9999px; box-shadow: 0 4px 12px rgba(6, 78, 59, 0.25);">
                  Open FreelanceXchain &rarr;
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b;">
              &copy; 2026 FreelanceXchain &bull; Smart Escrow &bull; AI Matching
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function renderTemplate(template: EmailTemplate, data: Record<string, any>): Promise<string> {
  try {
    let html = await loadTemplateContent(template);

    // Build unified normalized context mapping all common aliases
    const recipientName =
      data.recipientName ??
      data.freelancerName ??
      data.userName ??
      data.arbiterName ??
      data.reviewerName ??
      'User';

    const projectTitle = data.projectTitle ?? data.contractTitle ?? '';
    const reason = data.reason ?? data.disputeReason ?? '';
    const feedback = data.feedback ?? data.reviewFeedback ?? data.comment ?? '';
    const newProjectsCount = data.newProjectsCount ?? data.newProjects ?? 0;
    const totalEscrowValue = data.totalEscrowValue ?? '$25,000+';
    const topMatchRate = data.topMatchRate ?? '98%';

    const rawTopProjects = Array.isArray(data.topProjects) ? data.topProjects : [];
    const topProjects = rawTopProjects.map((item: any, idx: number) => ({
      title: item.title ?? `Featured Project #${idx + 1}`,
      budget: item.budget ?? '$5,000',
      url: item.url ?? 'https://freelancexchain.works/projects',
      matchRate: item.matchRate ?? '95%',
    }));

    const normalizedData: Record<string, any> = {
      ...data,
      recipientName,
      freelancerName: data.freelancerName ?? recipientName,
      userName: data.userName ?? recipientName,
      arbiterName: data.arbiterName ?? recipientName,
      projectTitle,
      contractTitle: data.contractTitle ?? projectTitle,
      reason,
      disputeReason: data.disputeReason ?? reason,
      feedback,
      newProjectsCount,
      totalEscrowValue,
      topMatchRate,
      topProjects,
    };

    // {{#each key}}...{{/each}} — repeat the block once per item in an array.
    // Tolerates flexible whitespace such as {{ #each topProjects }} or {{#each topProjects}}
    html = html.replace(/\{\{\s*#each\s+(\w+)\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g, (_match, key, block) => {
      const items = normalizedData[key];
      if (!Array.isArray(items) || items.length === 0) {
        return '';
      }
      return items.map((item: Record<string, any>) =>
        block.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m: string, field: string) => escapeHtml(String(item[field] ?? '')))
      ).join('');
    });

    // HTML-escape all scalar template variables to prevent injection
    Object.keys(normalizedData).forEach(key => {
      if (key === 'topProjects' || Array.isArray(normalizedData[key])) return;
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      html = html.replace(regex, escapeHtml(String(normalizedData[key] ?? '')));
    });

    return html;
  } catch (error) {
    logger.error('Failed to render email template:', error);
    return renderFallbackBrandedHtml(template, data);
  }
}

export async function sendEmail(emailData: EmailData): Promise<ServiceResult<{ messageId: string }>> {
  try {
    const client = await getEmailClient();
    const html = await renderTemplate(emailData.template, emailData.data);

    const emailFrom = process.env['EMAIL_FROM'] || 'FreelanceXchain <noreply@freelancexchain.works>';

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
  data: { recipientName?: string; freelancerName?: string; projectTitle: string; projectUrl?: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.freelancerName ?? 'Freelancer';
  return sendEmail({
    to,
    subject: 'Your proposal has been accepted!',
    template: 'proposal_accepted',
    data: {
      ...data,
      recipientName,
      freelancerName: data.freelancerName ?? recipientName,
    },
  });
}

export async function sendMilestoneApprovedEmail(
  to: string,
  data: { recipientName?: string; freelancerName?: string; projectTitle?: string; milestoneTitle: string; amount: string; contractUrl?: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.freelancerName ?? 'Freelancer';
  return sendEmail({
    to,
    subject: 'Milestone approved - Payment released',
    template: 'milestone_approved',
    data: {
      ...data,
      recipientName,
      freelancerName: data.freelancerName ?? recipientName,
      projectTitle: data.projectTitle ?? '',
    },
  });
}

export async function sendPaymentReleasedEmail(
  to: string,
  data: { recipientName: string; amount: string; projectTitle?: string; contractTitle?: string; transactionHash: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const projectTitle = data.projectTitle ?? data.contractTitle ?? '';
  return sendEmail({
    to,
    subject: 'Payment released',
    template: 'payment_released',
    data: {
      ...data,
      projectTitle,
      contractTitle: data.contractTitle ?? projectTitle,
    },
  });
}

export async function sendDisputeCreatedEmail(
  to: string,
  data: { recipientName?: string; arbiterName?: string; projectTitle?: string; contractTitle?: string; disputeReason?: string; reason?: string; disputeUrl?: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.arbiterName ?? 'User';
  const projectTitle = data.projectTitle ?? data.contractTitle ?? '';
  const reason = data.reason ?? data.disputeReason ?? '';
  return sendEmail({
    to,
    subject: 'New dispute requires your attention',
    template: 'dispute_created',
    data: {
      ...data,
      recipientName,
      arbiterName: data.arbiterName ?? recipientName,
      projectTitle,
      contractTitle: data.contractTitle ?? projectTitle,
      reason,
      disputeReason: data.disputeReason ?? reason,
    },
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
  data: { recipientName: string; reviewerName?: string; rating: number; projectTitle: string; feedback?: string; reviewUrl?: string }
): Promise<ServiceResult<{ messageId: string }>> {
  return sendEmail({
    to,
    subject: 'You received a new review',
    template: 'review_received',
    data: {
      ...data,
      feedback: data.feedback ?? '',
    },
  });
}

export async function sendKycApprovedEmail(
  to: string,
  data: { recipientName?: string; userName?: string; tier?: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.userName ?? 'User';
  return sendEmail({
    to,
    subject: 'KYC verification approved',
    template: 'kyc_approved',
    data: {
      ...data,
      recipientName,
      userName: data.userName ?? recipientName,
    },
  });
}

export async function sendKycRejectedEmail(
  to: string,
  data: { recipientName?: string; userName?: string; reason: string }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.userName ?? 'User';
  return sendEmail({
    to,
    subject: 'KYC verification requires attention',
    template: 'kyc_rejected',
    data: {
      ...data,
      recipientName,
      userName: data.userName ?? recipientName,
    },
  });
}

export async function sendWeeklyDigestEmail(
  to: string,
  data: {
    recipientName?: string;
    userName?: string;
    newProjects?: number;
    newProjectsCount?: number;
    newMessages?: number;
    pendingMilestones?: number;
    weeklyEarnings?: string;
    totalEscrowValue?: string;
    topMatchRate?: string;
    topProjects?: Array<{ title: string; budget: string; url?: string; matchRate?: string }>;
  }
): Promise<ServiceResult<{ messageId: string }>> {
  const recipientName = data.recipientName ?? data.userName ?? 'User';
  return sendEmail({
    to,
    subject: 'Your weekly FreelanceXchain digest',
    template: 'weekly_digest',
    data: {
      ...data,
      recipientName,
      userName: data.userName ?? recipientName,
      newProjectsCount: data.newProjectsCount ?? data.newProjects ?? 0,
      totalEscrowValue: data.totalEscrowValue ?? '$0',
      topMatchRate: data.topMatchRate ?? '95%',
      topProjects: data.topProjects ?? [],
    },
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
