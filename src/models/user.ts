// User domain types
export type UserRole = 'freelancer' | 'employer' | 'admin';

export type KycStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired';

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  walletAddress: string;
  kycStatus?: KycStatus | undefined;
  createdAt: string;
  updatedAt: string;
};
