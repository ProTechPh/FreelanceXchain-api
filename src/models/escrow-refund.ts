export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export type RefundRequest = {
  id: string;
  contractId: string;
  requestedBy: string;
  amount: number;
  isPartial: boolean;
  reason: string;
  status: RefundStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  completedAt?: Date;
  transactionHash?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateRefundRequestInput = {
  contractId: string;
  requestedBy: string;
  amount?: number;
  reason: string;
};

export type ApproveRefundInput = {
  refundId: string;
  approvedBy: string;
};

export type RejectRefundInput = {
  refundId: string;
  rejectedBy: string;
  reason: string;
};
