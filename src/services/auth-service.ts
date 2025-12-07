import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../models/user.js';
import { userRepository } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { generateId } from '../utils/id.js';
import {
  RegisterInput,
  LoginInput,
  TokenPayload,
  AuthResult,
  AuthError,
} from './auth-types.js';

const SALT_ROUNDS = 10;

function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as SignOptions
  );
}

function generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn } as SignOptions
  );
}


function createAuthResult(user: User, accessToken: string, refreshToken: string): AuthResult {
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  };
}

export async function register(input: RegisterInput): Promise<AuthResult | AuthError> {
  const normalizedEmail = input.email.toLowerCase().trim();

  // Check for duplicate email
  const emailExists = await userRepository.emailExists(normalizedEmail);
  if (emailExists) {
    return {
      code: 'DUPLICATE_EMAIL',
      message: 'An account with this email already exists',
    };
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const now = new Date().toISOString();
  const user: User = {
    id: generateId(),
    email: normalizedEmail,
    passwordHash,
    role: input.role,
    walletAddress: input.walletAddress ?? '',
    createdAt: now,
    updatedAt: now,
  };

  const createdUser = await userRepository.createUser(user);

  // Generate tokens
  const tokenPayload = {
    userId: createdUser.id,
    email: createdUser.email,
    role: createdUser.role,
  };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return createAuthResult(createdUser, accessToken, refreshToken);
}


export async function login(input: LoginInput): Promise<AuthResult | AuthError> {
  const normalizedEmail = input.email.toLowerCase().trim();

  // Find user by email
  const user = await userRepository.getUserByEmail(normalizedEmail);
  if (!user) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }

  // Verify password
  const isValidPassword = await verifyPassword(input.password, user.passwordHash);
  if (!isValidPassword) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }

  // Generate tokens
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return createAuthResult(user, accessToken, refreshToken);
}

export function validateToken(token: string): TokenPayload | AuthError {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
      };
    }
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid token',
    };
  }
}

export async function refreshTokens(refreshToken: string): Promise<AuthResult | AuthError> {
  const payload = validateToken(refreshToken);
  
  if ('code' in payload) {
    return payload;
  }

  if (payload.type !== 'refresh') {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid refresh token',
    };
  }

  // Get user to ensure they still exist
  const user = await userRepository.getUserById(payload.userId);
  if (!user) {
    return {
      code: 'INVALID_TOKEN',
      message: 'User not found',
    };
  }

  // Generate new tokens
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const newAccessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  return createAuthResult(user, newAccessToken, newRefreshToken);
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'code' in result;
}
