import { Notification, NotificationType, mapNotificationFromEntity } from '../utils/entity-mapper.js';
import { notificationRepository, NotificationEntity } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';
import type { ServiceResult } from '../types/service-result.js';

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
  return { success: true, data: mapNotificationFromEntity(createdEntity) };
}

// Create multiple notifications at once
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<ServiceResult<Notification[]>> {
  const notifications: Notification[] = [];

  for (const input of inputs) {
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
    notifications.push(mapNotificationFromEntity(createdEntity));
  }

  return { success: true, data: notifications };
}

// Get notification by ID
export async function getNotificationById(
  notificationId: string,
  userId: string
): Promise<ServiceResult<Notification>> {
  const notificationEntity = await notificationRepository.getNotificationById(notificationId);
  if (!notificationEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Notification not found' },
    };
  }

  // Verify the notification belongs to the requesting user
  if (notificationEntity.user_id !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You do not have access to this notification' },
    };
  }

  return { success: true, data: mapNotificationFromEntity(notificationEntity) };
}

// Get notifications for a user with pagination
export async function getNotificationsByUser(
  userId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<Notification>>> {
  const result = await notificationRepository.getNotificationsByUser(userId, options);
  return { 
    success: true, 
    data: {
      items: result.items.map(mapNotificationFromEntity),
      hasMore: result.hasMore,
      total: result.total,
    }
  };
}

// Get all notifications for a user (sorted by creation time descending)
export async function getAllNotificationsByUser(
  userId: string
): Promise<ServiceResult<Notification[]>> {
  const notificationEntities = await notificationRepository.getAllNotificationsByUser(userId);
  return { success: true, data: notificationEntities.map(mapNotificationFromEntity) };
}


// Get unread notifications for a user
export async function getUnreadNotificationsByUser(
  userId: string
): Promise<ServiceResult<Notification[]>> {
  const notificationEntities = await notificationRepository.getUnreadNotificationsByUser(userId);
  return { success: true, data: notificationEntities.map(mapNotificationFromEntity) };
}

// Mark a notification as read
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<ServiceResult<Notification>> {
  const notificationEntity = await notificationRepository.getNotificationById(notificationId);
  if (!notificationEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Notification not found' },
    };
  }

  // Verify the notification belongs to the user
  if (notificationEntity.user_id !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to update this notification' },
    };
  }

  const updatedEntity = await notificationRepository.markAsRead(notificationId);
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to mark notification as read' },
    };
  }

  return { success: true, data: mapNotificationFromEntity(updatedEntity) };
}

// Mark all notifications as read for a user
export async function markAllNotificationsAsRead(
  userId: string
): Promise<ServiceResult<{ count: number }>> {
  const count = await notificationRepository.markAllAsRead(userId);
  return { success: true, data: { count } };
}

// Get unread notification count for a user
export async function getUnreadCount(
  userId: string
): Promise<ServiceResult<number>> {
  const count = await notificationRepository.getUnreadCount(userId);
  return { success: true, data: count };
}


// Helper functions for creating specific notification types

export async function notifyProposalReceived(
  employerId: string,
  proposalId: string,
  projectId: string,
  projectTitle: string,
  freelancerId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: employerId,
    type: 'proposal_received',
    title: 'New Proposal Received',
    message: `A freelancer has submitted a proposal for your project "${projectTitle}"`,
    data: { proposalId, projectId, projectTitle, freelancerId },
  });
}

export async function notifyProposalAccepted(
  freelancerId: string,
  proposalId: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: freelancerId,
    type: 'proposal_accepted',
    title: 'Proposal Accepted',
    message: `Your proposal for "${projectTitle}" has been accepted!`,
    data: { proposalId, projectId, projectTitle, contractId },
  });
}

export async function notifyProposalRejected(
  freelancerId: string,
  proposalId: string,
  projectId: string,
  projectTitle: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: freelancerId,
    type: 'proposal_rejected',
    title: 'Proposal Rejected',
    message: `Your proposal for "${projectTitle}" was not accepted.`,
    data: { proposalId, projectId, projectTitle },
  });
}


export async function notifyMilestoneSubmitted(
  employerId: string,
  milestoneId: string,
  milestoneTitle: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: employerId,
    type: 'milestone_submitted',
    title: 'Milestone Submitted for Review',
    message: `Milestone "${milestoneTitle}" for project "${projectTitle}" has been submitted for your approval.`,
    data: { milestoneId, milestoneTitle, projectId, projectTitle, contractId },
  });
}

export async function notifyMilestoneApproved(
  freelancerId: string,
  milestoneId: string,
  milestoneTitle: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId: freelancerId,
    type: 'milestone_approved',
    title: 'Milestone Approved',
    message: `Milestone "${milestoneTitle}" for project "${projectTitle}" has been approved.`,
    data: { milestoneId, milestoneTitle, projectId, projectTitle, contractId },
  });
}

export async function notifyPaymentReleased(
  userId: string,
  amount: number,
  milestoneId: string,
  milestoneTitle: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId,
    type: 'payment_released',
    title: 'Payment Released',
    message: `Payment of $${amount} for milestone "${milestoneTitle}" has been released.`,
    data: { amount, milestoneId, milestoneTitle, projectId, projectTitle, contractId },
  });
}


export async function notifyDisputeCreated(
  userId: string,
  disputeId: string,
  milestoneId: string,
  milestoneTitle: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId,
    type: 'dispute_created',
    title: 'Dispute Created',
    message: `A dispute has been created for milestone "${milestoneTitle}" in project "${projectTitle}".`,
    data: { disputeId, milestoneId, milestoneTitle, projectId, projectTitle, contractId },
  });
}

export async function notifyDisputeResolved(
  userId: string,
  disputeId: string,
  resolution: string,
  milestoneId: string,
  milestoneTitle: string,
  projectId: string,
  projectTitle: string,
  contractId: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId,
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    message: `The dispute for milestone "${milestoneTitle}" in project "${projectTitle}" has been resolved.`,
    data: { disputeId, resolution, milestoneId, milestoneTitle, projectId, projectTitle, contractId },
  });
}

export async function notifyRatingReceived(
  userId: string,
  rating: number,
  contractId: string,
  projectTitle: string
): Promise<ServiceResult<Notification>> {
  return createNotification({
    userId,
    type: 'rating_received',
    title: 'New Rating Received',
    message: `You received a ${rating}-star rating for project "${projectTitle}".`,
    data: { rating, contractId, projectTitle },
  });
}
