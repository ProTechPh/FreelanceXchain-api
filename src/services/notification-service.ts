import { Notification, NotificationType } from '../models/notification.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

export type NotificationServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type NotificationServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: NotificationServiceError };

// Create a notification
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationServiceResult<Notification>> {
  const notification: Notification = {
    id: generateId(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    data: input.data ?? {},
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const created = await notificationRepository.createNotification(notification);
  return { success: true, data: created };
}

// Create multiple notifications at once
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<NotificationServiceResult<Notification[]>> {
  const notifications: Notification[] = [];

  for (const input of inputs) {
    const notification: Notification = {
      id: generateId(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data ?? {},
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const created = await notificationRepository.createNotification(notification);
    notifications.push(created);
  }

  return { success: true, data: notifications };
}

// Get notification by ID
export async function getNotificationById(
  notificationId: string,
  userId: string
): Promise<NotificationServiceResult<Notification>> {
  const notification = await notificationRepository.getNotificationById(notificationId, userId);
  if (!notification) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Notification not found' },
    };
  }
  return { success: true, data: notification };
}

// Get notifications for a user with pagination
export async function getNotificationsByUser(
  userId: string,
  options?: QueryOptions
): Promise<NotificationServiceResult<PaginatedResult<Notification>>> {
  const result = await notificationRepository.getNotificationsByUser(userId, options);
  return { success: true, data: result };
}

// Get all notifications for a user (sorted by creation time descending)
export async function getAllNotificationsByUser(
  userId: string
): Promise<NotificationServiceResult<Notification[]>> {
  const notifications = await notificationRepository.getAllNotificationsByUser(userId);
  return { success: true, data: notifications };
}


// Get unread notifications for a user
export async function getUnreadNotificationsByUser(
  userId: string
): Promise<NotificationServiceResult<Notification[]>> {
  const notifications = await notificationRepository.getUnreadNotificationsByUser(userId);
  return { success: true, data: notifications };
}

// Mark a notification as read
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<NotificationServiceResult<Notification>> {
  const notification = await notificationRepository.getNotificationById(notificationId, userId);
  if (!notification) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Notification not found' },
    };
  }

  // Verify the notification belongs to the user
  if (notification.userId !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to update this notification' },
    };
  }

  const updated = await notificationRepository.markAsRead(notificationId, userId);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to mark notification as read' },
    };
  }

  return { success: true, data: updated };
}

// Mark all notifications as read for a user
export async function markAllNotificationsAsRead(
  userId: string
): Promise<NotificationServiceResult<{ count: number }>> {
  const count = await notificationRepository.markAllAsRead(userId);
  return { success: true, data: { count } };
}

// Get unread notification count for a user
export async function getUnreadCount(
  userId: string
): Promise<NotificationServiceResult<number>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
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
): Promise<NotificationServiceResult<Notification>> {
  return createNotification({
    userId,
    type: 'rating_received',
    title: 'New Rating Received',
    message: `You received a ${rating}-star rating for project "${projectTitle}".`,
    data: { rating, contractId, projectTitle },
  });
}
