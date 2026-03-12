import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../config/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type EmailTemplate = 
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

export type EmailData = {
  to: string;
  subject: string;
  template: EmailTemplate;
  data: Record<string, any>;
};

export type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  const smtpHost = process.env['SMTP_HOST'];
  const smtpPort = process.env['SMTP_PORT'];
  const smtpUser = process.env['SMTP_USER'];
  const smtpPassword = process.env['SMTP_PASSWORD'];

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    logger.warn('SMTP configuration not found, email sending disabled');
    throw new Error('SMTP configuration not found');
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: parseInt(smtpPort) === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  return transporter;
}

/**
 * Render email template with data
 */
async function renderTemplate(template: EmailTemplate, data: Record<string, any>): Promise<string> {
  try {
    const templatePath = path.join(__dirname, '../../docs/email-templates', `${template}.html`);
    let html = await fs.readFile(templatePath, 'utf-8');

    // Simple template variable replacement
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      html = html.replace(regex, String(data[key]));
    });

    return html;
  } catch (error) {
    logger.error('Failed to render email template:', error);
    // Fallback to plain text
    return `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
  }
}

/**
 * Send email
 */
export async function sendEmail(emailData: EmailData): Promise<ServiceResult<{ messageId: string }>> {
  try {
    const transport = getTransporter();
    const html = await renderTemplate(emailData.template, emailData.data);

    const emailFrom = process.env['EMAIL_FROM'] || 'noreply@freelancexchain.com';

    const info = await transport.sendMail({
      from: emailFrom,
      to: emailData.to,
      subject: emailData.subject,
      html,
    });

    logger.info(`Email sent successfully to ${emailData.to}`, { messageId: info.messageId });

    return {
      success: true,
      data: { messageId: info.messageId },
    };
  } catch (error) {
    logger.error('Failed to send email:', error);
    return {
      success: false,
      error: {
        code: 'EMAIL_SEND_FAILED',
        message: error instanceof Error ? error.message : 'Failed to send email',
      },
    };
  }
}

/**
 * Send proposal accepted email
 */
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

/**
 * Send milestone approved email
 */
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

/**
 * Send payment released email
 */
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

/**
 * Send dispute created email
 */
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

/**
 * Send contract created email
 */
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

/**
 * Send message received email
 */
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

/**
 * Send review received email
 */
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

/**
 * Send KYC approved email
 */
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

/**
 * Send KYC rejected email
 */
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

/**
 * Send weekly digest email
 */
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

/**
 * Test email configuration
 */
export async function testEmailConfiguration(): Promise<ServiceResult<{ verified: boolean }>> {
  try {
    const transport = getTransporter();
    const verified = await transport.verify();
    
    logger.info('Email configuration verified successfully');
    
    return {
      success: true,
      data: { verified },
    };
  } catch (error) {
    logger.error('Email configuration verification failed:', error);
    return {
      success: false,
      error: {
        code: 'EMAIL_CONFIG_INVALID',
        message: error instanceof Error ? error.message : 'Email configuration is invalid',
      },
    };
  }
}
