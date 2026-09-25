// User domain types
export type UserRole = 'freelancer' | 'employer' | 'admin';

export const ADMIN_PERMISSIONS = [
  'kyc:view',
  'kyc:manage',
  'users:view',
  'users:manage',
  'disputes:view',
  'disputes:manage',
  'support:manage',
  'skills:manage',
  'analytics:view',
  'system:view',
  'audit:view',
  'admin:manage',
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];

export type { KycStatus } from './didit-kyc.js';
import type { KycStatus } from './didit-kyc.js';

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  walletAddress: string;
  kycStatus?: KycStatus | undefined;
  permissions?: AdminPermission[] | undefined;
  createdAt: string;
  updatedAt: string;
};
