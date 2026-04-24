// User domain types
export type UserRole = 'freelancer' | 'employer' | 'admin';

export type { KycStatus } from './didit-kyc.js';
import type { KycStatus } from './didit-kyc.js';

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
