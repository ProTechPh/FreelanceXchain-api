export type UserRole = 'freelancer' | 'employer' | 'admin';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  walletAddress: string;
  createdAt: string;
  updatedAt: string;
};
