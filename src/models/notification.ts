// Notification domain types
export type NotificationType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'milestone_rejected'
  | 'payment_released'
  | 'dispute_created'
  | 'dispute_resolved'
  | 'dispute_evidence_submitted'
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_rejected'
  | 'rating_received'
  | 'message';

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};
