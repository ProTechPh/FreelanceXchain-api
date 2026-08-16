import { Notification, NotificationType, mapNotificationFromEntity } from '../utils/entity-mapper.js';
import { notificationRepository, NotificationEntity } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import { generateId } from '../utils/id.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

// Create a notification
export async function createNotification(
  input: CreateNotificationInput
): Promise<ServiceResult<Notification>> {
  const notificationEntity: Omit<NotificationEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    data: input.data ?? {},
    is_read: false,
  };

  const createdEntity = await notificationRepository.createNotification(notificationEntity);
  return successResult(mapNotificationFromEntity(createdEntity));
}

// Create multiple notifications at once
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<ServiceResult<Notification[]>> {
  const createdEntities = await Promise.all(
    inputs.map(async (input) => {
      const notificationEntity: Omit<NotificationEntity, 'created_at' | 'updated_at'> = {
        id: generateId(),
        user_id: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data ?? {},
        is_read: false,
      };
      return notificationRepository.createNotification(notificationEntity);
    })
  );
  const notifications = createdEntities.map(mapNotificationFromEntity);

  return successResult(notifications);
}

// Get notification by ID
export async function getNotificationById(
  notificationId: string,
  userId: string
): Promise<ServiceResult<Notification>> {
  const notificationEntity = await notificationRepository.getNotificationById(notificationId);
  if (!notificationEntity) {
    return errorResult('NOT_FOUND', 'Notification not found');
  }

  // Verify the notification belongs to the requesting user
  if (notificationEntity.user_id !== userId) {
    return errorResult('UNAUTHORIZED', 'You do not have access to this notification');
  }

  return successResult(mapNotificationFromEntity(notificationEntity));
}

// Get notifications for a user with pagination
export async function getNotificationsByUser(
  userId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<Notification>>> {
  const result = await notificationRepository.getNotificationsByUser(userId, options);
  return successResult({
    items: result.items.map(mapNotificationFromEntity),
    hasMore: result.hasMore,
    total: result.total,
  });
  }

// Get all notifications for a user (sorted by creation time descending)
export async function getAllNotificationsByUser(
  userId: string
): Promise<ServiceResult<Notification[]>> {
  const notificationEntities = await notificationRepository.getAllNotificationsByUser(userId);
  return successResult(notificationEntities.map(mapNotificationFromEntity));
}


// Get unread notifications for a user
export async function getUnreadNotificationsByUser(
  userId: string
): Promise<ServiceResult<Notification[]>> {
  const notificationEntities = await notificationRepository.getUnreadNotificationsByUser(userId);
  return successResult(notificationEntities.map(mapNotificationFromEntity));
}

// Mark a notification as read
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<ServiceResult<Notification>> {
  const notificationEntity = await notificationRepository.getNotificationById(notificationId);
  if (!notificationEntity) {
    return errorResult('NOT_FOUND', 'Notification not found');
  }

  // Verify the notification belongs to the user
  if (notificationEntity.user_id !== userId) {
    return errorResult('UNAUTHORIZED', 'You are not authorized to update this notification');
  }

  const updatedEntity = await notificationRepository.markAsRead(notificationId);
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to mark notification as read');
  }

  return successResult(mapNotificationFromEntity(updatedEntity));
}

// Mark all notifications as read for a user
export async function markAllNotificationsAsRead(
  userId: string
): Promise<ServiceResult<{ count: number }>> {
  const count = await notificationRepository.markAllAsRead(userId);
  return successResult({ count });
}

// Get unread notification count for a user
export async function getUnreadCount(
  userId: string
): Promise<ServiceResult<number>> {
  const count = await notificationRepository.getUnreadCount(userId);
  return successResult(count);
}


// Helper functions for creating specific notification types

export type NotifyProposalReceivedInput = {
  employerId: string;
  proposalId: string;
  projectId: string;
  projectTitle: string;
  freelancerId: string;
};

export async function notifyProposalReceived(
  input: NotifyProposalReceivedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.employerId,
    type: 'proposal_received',
    title: 'New Proposal Received',
    message: `A freelancer has submitted a proposal for your project "${input.projectTitle}"`,
    data: { proposalId: input.proposalId, projectId: input.projectId, projectTitle: input.projectTitle, freelancerId: input.freelancerId },
  });
}

export type NotifyProposalAcceptedInput = {
  freelancerId: string;
  proposalId: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyProposalAccepted(
  input: NotifyProposalAcceptedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.freelancerId,
    type: 'proposal_accepted',
    title: 'Proposal Accepted',
    message: `Your proposal for "${input.projectTitle}" has been accepted!`,
    data: { proposalId: input.proposalId, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyProposalRejectedInput = {
  freelancerId: string;
  proposalId: string;
  projectId: string;
  projectTitle: string;
};

export async function notifyProposalRejected(
  input: NotifyProposalRejectedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.freelancerId,
    type: 'proposal_rejected',
    title: 'Proposal Rejected',
    message: `Your proposal for "${input.projectTitle}" was not accepted.`,
    data: { proposalId: input.proposalId, projectId: input.projectId, projectTitle: input.projectTitle },
  });
}

export type NotifyMilestoneSubmittedInput = {
  employerId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyMilestoneSubmitted(
  input: NotifyMilestoneSubmittedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.employerId,
    type: 'milestone_submitted',
    title: 'Milestone Submitted for Review',
    message: `Milestone "${input.milestoneTitle}" for project "${input.projectTitle}" has been submitted for your approval.`,
    data: { milestoneId: input.milestoneId, milestoneTitle: input.milestoneTitle, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyMilestoneApprovedInput = {
  freelancerId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyMilestoneApproved(
  input: NotifyMilestoneApprovedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.freelancerId,
    type: 'milestone_approved',
    title: 'Milestone Approved',
    message: `Milestone "${input.milestoneTitle}" for project "${input.projectTitle}" has been approved.`,
    data: { milestoneId: input.milestoneId, milestoneTitle: input.milestoneTitle, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyPaymentReleasedInput = {
  userId: string;
  amount: number;
  milestoneId: string;
  milestoneTitle: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyPaymentReleased(
  input: NotifyPaymentReleasedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.userId,
    type: 'payment_released',
    title: 'Payment Released',
    message: `Payment of $${input.amount} for milestone "${input.milestoneTitle}" has been released.`,
    data: { amount: input.amount, milestoneId: input.milestoneId, milestoneTitle: input.milestoneTitle, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyDisputeCreatedInput = {
  userId: string;
  disputeId: string;
  milestoneId: string;
  milestoneTitle: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyDisputeCreated(
  input: NotifyDisputeCreatedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.userId,
    type: 'dispute_created',
    title: 'Dispute Created',
    message: `A dispute has been created for milestone "${input.milestoneTitle}" in project "${input.projectTitle}".`,
    data: { disputeId: input.disputeId, milestoneId: input.milestoneId, milestoneTitle: input.milestoneTitle, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyDisputeResolvedInput = {
  userId: string;
  disputeId: string;
  resolution: string;
  milestoneId: string;
  milestoneTitle: string;
  projectId: string;
  projectTitle: string;
  contractId: string;
};

export async function notifyDisputeResolved(
  input: NotifyDisputeResolvedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.userId,
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    message: `The dispute for milestone "${input.milestoneTitle}" in project "${input.projectTitle}" has been resolved.`,
    data: { disputeId: input.disputeId, resolution: input.resolution, milestoneId: input.milestoneId, milestoneTitle: input.milestoneTitle, projectId: input.projectId, projectTitle: input.projectTitle, contractId: input.contractId },
  });
}

export type NotifyRatingReceivedInput = {
  userId: string;
  rating: number;
  contractId: string;
  projectTitle: string;
};

export async function notifyRatingReceived(
  input: NotifyRatingReceivedInput
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: input.userId,
    type: 'rating_received',
    title: 'New Rating Received',
    message: `You received a ${input.rating}-star rating for project "${input.projectTitle}".`,
    data: { rating: input.rating, contractId: input.contractId, projectTitle: input.projectTitle },
  });
}
