/**
 * Best-effort notifications for the hiring flow (negotiation, signing, funding).
 * A failed notification or email never fails the action that triggered it.
 */
import { logger } from '../config/logger.js';
import { notificationRepository, type NotificationType } from '../repositories/notification-repository.js';
import { generateId } from '../utils/id.js';
import { sendGatedEmail, sendContractActionEmail } from './email-delivery-service.js';

export type ContractRole = 'employer' | 'freelancer';

export function contractDashboardUrl(role: ContractRole, contractId: string): string {
  const base = process.env['FRONTEND_URL'] || 'http://localhost:3000';
  return `${base}/dashboard/${role}/contracts/${contractId}`;
}

export async function notifyContractParty(params: {
  userId: string;
  role: ContractRole;
  contractId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  email?: boolean;
  projectTitle?: string;
}): Promise<void> {
  try {
    await notificationRepository.createNotification({
      id: generateId(),
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: { contractId: params.contractId, ...(params.data ?? {}) },
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create contract notification', { error, type: params.type, contractId: params.contractId });
  }

  if (params.email) {
    await sendGatedEmail(params.userId, 'contract_created', (recipient) =>
      sendContractActionEmail(recipient.email, {
        recipientName: recipient.name,
        title: params.title,
        message: params.message,
        ctaUrl: contractDashboardUrl(params.role, params.contractId),
        ...(params.projectTitle ? { projectTitle: params.projectTitle } : {}),
      })
    );
  }
}
