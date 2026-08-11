export type EmailPreference = {
  id: string;
  userId: string;
  proposalReceived: boolean;
  proposalAccepted: boolean;
  milestoneUpdates: boolean;
  paymentNotifications: boolean;
  disputeNotifications: boolean;
  contractNotifications: boolean;
  messageNotifications: boolean;
  reviewNotifications: boolean;
  kycNotifications: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
  createdAt: string;
  updatedAt: string;
};



export type EmailType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'milestone_updates'
  | 'payment_notifications'
  | 'dispute_notifications'
  | 'contract_created'
  | 'message_received'
  | 'review_received'
  | 'kyc_notifications'
  | 'marketing_emails'
  | 'weekly_digest';
