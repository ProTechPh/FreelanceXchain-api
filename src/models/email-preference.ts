export interface EmailPreference {
  id: string;
  userId: string;
  proposalReceived: boolean;
  proposalAccepted: boolean;
  milestoneUpdates: boolean;
  paymentNotifications: boolean;
  disputeNotifications: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailPreferenceEntity {
  id: string;
  user_id: string;
  proposal_received: boolean;
  proposal_accepted: boolean;
  milestone_updates: boolean;
  payment_notifications: boolean;
  dispute_notifications: boolean;
  marketing_emails: boolean;
  weekly_digest: boolean;
  created_at: string;
  updated_at: string;
}

export type EmailType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'milestone_updates'
  | 'payment_notifications'
  | 'dispute_notifications'
  | 'marketing_emails'
  | 'weekly_digest';
