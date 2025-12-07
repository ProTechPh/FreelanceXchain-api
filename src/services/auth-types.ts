import { UserRole } from '../models/user.js';

export type RegisterInput = {
  email: string;
  password: string;
  role: UserRole;
  walletAddress?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type TokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
};

export type AuthResult = {
  user: {
    id: string;
    email: string;
    role: UserRole;
    walletAddress: string;
    createdAt: string;
  };
  accessToken: string;
  refreshToken: string;
};

export type AuthError = {
  code: 'DUPLICATE_EMAIL' | 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN';
  message: string;
};
