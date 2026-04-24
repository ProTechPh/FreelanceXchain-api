// Rush upgrade request domain types
export type RushUpgradeRequestStatus = 'pending' | 'accepted' | 'declined' | 'counter_offered' | 'expired';

export type RushUpgradeRequest = {
  id: string;
  contractId: string;
  requestedBy: string;
  proposedPercentage: number;
  counterPercentage: number | null;
  status: RushUpgradeRequestStatus;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
