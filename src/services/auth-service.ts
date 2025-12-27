import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { generateId } from '../utils/id.js';
import {
  RegisterInput,
  LoginInput,
  TokenPayload,
  AuthResult,
  AuthError,
} from './auth-types.js';
import { getSupabaseClient } from '../config/supabase.js';
import { Provider } from '@supabase/supabase-js';
import { UserRole } from '../models/user.js';

const SALT_ROUNDS = 10;

// Password strength requirements
const PASSWORD_MIN_LENGTH = 8;

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validates password strength
 * Requirements: min 8 chars, uppercase, lowercase, number, special char
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
    config.jwt.refreshSecret, // Use separate secret for refresh tokens
    { expiresIn: config.jwt.refreshExpiresIn } as SignOptions
  );
}

function createAuthResult(user: UserEntity, accessToken: string, refreshToken: string): AuthResult {
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      createdAt: user.created_at,
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
  const userInput = {
    id: generateId(),
    email: normalizedEmail,
    password_hash: passwordHash,
    role: input.role,
    wallet_address: input.walletAddress ?? '',
  };

  const createdUser = await userRepository.createUser(userInput);

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
  const isValidPassword = await verifyPassword(input.password, user.password_hash);
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

export function validateToken(token: string, tokenType: 'access' | 'refresh' = 'access'): TokenPayload | AuthError {
  try {
    const secret = tokenType === 'refresh' ? config.jwt.refreshSecret : config.jwt.secret;
    const decoded = jwt.verify(token, secret) as TokenPayload;
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
  const payload = validateToken(refreshToken, 'refresh');

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

export async function loginWithSupabase(accessToken: string): Promise<AuthResult | AuthError> {
  const supabase = getSupabaseClient();

  // Verify user with Supabase
  const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(accessToken);

  if (error || !supabaseUser || !supabaseUser.email) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  const normalizedEmail = supabaseUser.email.toLowerCase().trim();

  // Check if user exists in our DB
  const user = await userRepository.getUserByEmail(normalizedEmail);

  if (!user) {
    // User does not exist, require registration
    return {
      code: 'AUTH_REQUIRE_REGISTRATION',
      message: 'User registration required. Please select a role.',
    };
  }

  // Generate tokens for existing user
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  const appAccessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return createAuthResult(user, appAccessToken, refreshToken);
}

export async function getOAuthUrl(provider: Provider): Promise<string> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: config.server.nodeEnv === 'production'
        ? 'https://freelancexchain-api.vercel.app/api/auth/callback'
        : `http://localhost:${config.server.port}/api/auth/callback`,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw new Error(`Failed to get OAuth URL: ${error.message}`);
  }

  return data.url;
}

export async function exchangeCodeForSession(code: string): Promise<{ accessToken: string } | AuthError> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return {
      code: 'AUTH_EXCHANGE_FAILED',
      message: error?.message || 'Failed to exchange code for session',
    };
  }

  return { accessToken: data.session.access_token };
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'code' in result;
}

export async function registerWithSupabase(accessToken: string, role: UserRole): Promise<AuthResult | AuthError> {
  const supabase = getSupabaseClient();

  // Verify user with Supabase
  const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(accessToken);

  if (error || !supabaseUser || !supabaseUser.email) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  const normalizedEmail = supabaseUser.email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await userRepository.getUserByEmail(normalizedEmail);
  if (existingUser) {
    // If user exists, just log them in (idempotency)
    const tokenPayload = {
      userId: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    };
    const appAccessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    return createAuthResult(existingUser, appAccessToken, refreshToken);
  }

  // Generate random password hash since they use OAuth
  const randomPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await hashPassword(randomPassword);

  const userInput = {
    id: generateId(),
    email: normalizedEmail,
    password_hash: passwordHash,
    role: role,
    wallet_address: '',
  };

  const newUser = await userRepository.createUser(userInput);

  // Generate tokens
  const tokenPayload = {
    userId: newUser.id,
    email: newUser.email,
    role: newUser.role,
  };
  const appAccessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return createAuthResult(newUser, appAccessToken, refreshToken);
}
