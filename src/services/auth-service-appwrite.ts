/**
 * Appwrite Authentication Service
 * Handles user authentication using Appwrite Auth API
 * Migrated from Appwrite Auth
 */

import { ID, Account, Models, OAuthProvider, AuthenticatorType } from 'node-appwrite';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { createUserClient, users } from '../config/appwrite.js';
import { UserRole } from '../models/user.js';
import { logger } from '../config/logger.js';
import { pool } from '../config/database.js';
import {
  RegisterInput,
  LoginInput,
  AuthResult,
  AuthError,
  AuthResponse,
} from './auth-types.js';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

const MFA_ENCRYPTION_KEY = process.env['MFA_ENCRYPTION_KEY'];
if (!MFA_ENCRYPTION_KEY) {
  logger.warn('MFA_ENCRYPTION_KEY not set — falling back to JWT_SECRET (insecure in production)');
}
const MFA_ENCRYPTION_ALGO = 'aes-256-gcm';

function getMfaEncryptionKey(): Buffer {
  const keyMaterial = MFA_ENCRYPTION_KEY ?? config.jwt.secret;
  return scryptSync(keyMaterial, 'mfa-salt-freelancex', 32);
}

function encryptToken(plaintext: string): string {
  const key = getMfaEncryptionKey();
  const iv = randomBytes(12); // AES-256-GCM requires exactly 12-byte IV
  const cipher = createCipheriv(MFA_ENCRYPTION_ALGO, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv}:${authTag}:${encrypted}`;
}

function decryptToken(encrypted: string): string {
  const key = getMfaEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const [ivHex, authTagHex, data] = parts as [string, string, string];
  const ivBuf = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(MFA_ENCRYPTION_ALGO, key, ivBuf);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
  return decrypted;
}

// ============================================================
// MFA Session Management
// Uses PostgreSQL for persistence
// ============================================================
const MFA_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

type PendingMfaSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  factorId: string;
  expiresAt: number;
};

function generateMfaSessionId(): string {
  return `mfa_${randomUUID()}`;
}

/**
 * Store a pending MFA session in PostgreSQL
 */
async function storeMfaSession(sessionId: string, session: PendingMfaSession): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pending_mfa_sessions (session_id, access_token, refresh_token, user_id, factor_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at`,
      [
        sessionId,
        encryptToken(session.accessToken),
        encryptToken(session.refreshToken),
        session.userId,
        session.factorId,
        session.expiresAt,
      ]
    );
  } catch (error: any) {
    logger.error('Failed to store MFA session', { error: error.message, sessionId });
    throw new Error(`Failed to store MFA session: ${error.message}`);
  }
}

/**
 * Retrieve and consume a pending MFA session
 */
export async function consumeMfaSession(mfaSessionId: string): Promise<PendingMfaSession | null> {
  try {
    // Atomic delete-and-return
    const result = await pool.query(
      `DELETE FROM pending_mfa_sessions 
       WHERE session_id = $1 
       RETURNING access_token, refresh_token, user_id, factor_id, expires_at`,
      [mfaSessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Check expiry
    if (row.expires_at < Date.now()) {
      return null;
    }

    // Decrypt tokens
    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = decryptToken(row.access_token);
      refreshToken = decryptToken(row.refresh_token);
    } catch {
      logger.error('Failed to decrypt MFA session tokens');
      return null;
    }

    return {
      accessToken,
      refreshToken,
      userId: row.user_id,
      factorId: row.factor_id,
      expiresAt: row.expires_at,
    };
  } catch (error: any) {
    logger.error('Failed to consume MFA session', { error: error.message, mfaSessionId });
    return null;
  }
}

/**
 * Clean up expired MFA sessions periodically
 */
async function cleanupExpiredMfaSessions(): Promise<void> {
  try {
    await pool.query('DELETE FROM pending_mfa_sessions WHERE expires_at < $1', [Date.now()]);
  } catch (error: any) {
    logger.error('Failed to cleanup expired MFA sessions', { error: error.message });
  }
}

// Clean up expired sessions every 60 seconds
const mfaCleanupTimer = setInterval(cleanupExpiredMfaSessions, 60_000);
mfaCleanupTimer.unref(); // Don't prevent graceful shutdown

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
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
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

export async function createAuthResult(user: UserEntity, accessToken: string, refreshToken: string): Promise<AuthResult | AuthError> {
  // Check if user is suspended
  if (user.is_suspended) {
    return {
      code: 'USER_SUSPENDED',
      message: user.suspension_reason || 'Your account has been suspended',
    };
  }

  // Get KYC status
  const { getKycVerificationByUserId } = await import('../repositories/didit-kyc-repository.js');
  const kycVerification = await getKycVerificationByUserId(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      ...(kycVerification?.status ? { kycStatus: kycVerification.status } : {}),
      createdAt: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Register a new user with Appwrite Auth
 */
export async function register(input: RegisterInput): Promise<AuthResult | AuthError> {
  const normalizedEmail = input.email.toLowerCase().trim();

  // Check for duplicate email in database
  const emailExists = await userRepository.emailExists(normalizedEmail);
  if (emailExists) {
    return {
      code: 'DUPLICATE_EMAIL',
      message: 'An account with this email already exists',
    };
  }

  let appwriteUser: any;
  try {
    // Create user in Appwrite
    appwriteUser = await users.create(
      ID.unique(),
      normalizedEmail,
      undefined, // phone (optional)
      input.password,
      input.email.split('@')[0] // name from email
    );

    // Create user record in database
    const publicUser = await userRepository.createUser({
      id: appwriteUser.$id,
      email: normalizedEmail,
      password_hash: '', // Appwrite handles password
      role: input.role,
      wallet_address: '',
      name: input.email.split('@')[0] || 'User',
      is_suspended: false,
      suspension_reason: null,
      mfa_enabled: false,
    });

    // Create session for the user
    const userClient = createUserClient(''); // Will be set after login
    const account = new Account(userClient);
    
    // Create email session
    const session = await account.createEmailPasswordSession(normalizedEmail, input.password);

    return {
      user: {
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
        walletAddress: publicUser.wallet_address,
        createdAt: publicUser.created_at,
      },
      accessToken: session.secret, // Appwrite session secret as access token
      refreshToken: session.secret, // Same for now, can be enhanced
    };
  } catch (error: any) {
    // Compensate: if Appwrite user was created but PostgreSQL or session failed, delete the Appwrite user
    if (appwriteUser?.$id) {
      try {
        await users.delete(appwriteUser.$id);
        logger.warn('Compensated: deleted orphaned Appwrite user after registration failure', {
          appwriteUserId: appwriteUser.$id,
          email: normalizedEmail,
        });
      } catch (deleteError) {
        logger.error('CRITICAL: Failed to delete orphaned Appwrite user', {
          appwriteUserId: appwriteUser.$id,
          email: normalizedEmail,
          deleteError: deleteError instanceof Error ? deleteError.message : String(deleteError),
        });
      }
    }

    logger.error('Registration failed', { error: error.message, email: normalizedEmail });
    
    if (error.message?.includes('already exists') || error.code === 409) {
      return {
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      };
    }
    
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Failed to create user',
    };
  }
}

/**
 * Login with Appwrite Auth (email/password)
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const normalizedEmail = input.email.toLowerCase().trim();

  try {
    // Create a temporary client for login
    const userClient = createUserClient('');
    const account = new Account(userClient);

    // Create email session
    const session = await account.createEmailPasswordSession(normalizedEmail, input.password);

    // Get user from database
    const publicUser = await userRepository.getUserByEmail(normalizedEmail);

    if (!publicUser) {
      return {
        code: 'INVALID_CREDENTIALS',
        message: 'User profile not found',
      };
    }

    // Check for MFA (Appwrite MFA support)
    // Note: Appwrite MFA implementation would go here
    // For now, we'll skip MFA and return the session

    return await createAuthResult(publicUser, session.secret, session.secret);
  } catch (error: any) {
    logger.error('Login failed', { error: error.message, email: normalizedEmail });
    
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }
}

/**
 * Refresh tokens using Appwrite session
 */
export async function refreshTokens(refreshToken: string): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(refreshToken);
    const account = new Account(userClient);

    // Get current user
    const appwriteUser = await account.get();

    // Get user from database
    const publicUser = await userRepository.getUserById(appwriteUser.$id);

    if (!publicUser) {
      return {
        code: 'INVALID_TOKEN',
        message: 'User not found',
      };
    }

    // Appwrite sessions are long-lived, return the same token
    const result = await createAuthResult(publicUser, refreshToken, refreshToken);
    return result;
  } catch (error: any) {
    logger.error('Token refresh failed', { error: error.message });
    
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired refresh token',
    };
  }
}

/**
 * Validate Appwrite JWT token
 */
export async function validateToken(accessToken: string): Promise<{ id: string; userId: string; email: string; role: UserRole } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Get user from Appwrite
    const appwriteUser = await account.get();

    // Get user from database
    const publicUser = await userRepository.getUserById(appwriteUser.$id);

    if (!publicUser) {
      return {
        code: 'INVALID_TOKEN',
        message: 'User not found',
      };
    }

    // Check if user is suspended
    if (publicUser.is_suspended) {
      return {
        code: 'USER_SUSPENDED',
        message: publicUser.suspension_reason || 'Your account has been suspended',
      };
    }

    return {
      id: publicUser.id,
      userId: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
    };
  } catch (error: any) {
    logger.error('Token validation failed', { error: error.message });
    
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    };
  }
}

/**
 * Validate token and get full user with AuthResult
 */
export async function validateTokenAndGetUser(accessToken: string): Promise<AuthResult | AuthError> {
  const tokenResult = await validateToken(accessToken);
  
  if ('code' in tokenResult) {
    return tokenResult; // Return AuthError
  }

  const userEntity = await userRepository.getUserById(tokenResult.userId);
  
  if (!userEntity) {
    return {
      code: 'INVALID_TOKEN',
      message: 'User not found',
    };
  }

  return createAuthResult(userEntity, accessToken, accessToken);
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);

    const frontendBaseUrl = process.env.PUBLIC_URL
      ?? process.env.FRONTEND_URL
      ?? 'http://localhost:5173';
    const normalizedFrontendBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
    const redirectUrl = `${normalizedFrontendBaseUrl}/reset-password`;

    await account.createRecovery({
      email: email.toLowerCase().trim(), 
      url: redirectUrl
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Password reset request failed', { error: error.message, email });
    
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Failed to send password reset email',
    };
  }
}

/**
 * Update password (after reset)
 */
export async function updatePassword(accessToken: string, newPassword: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Update password using Appwrite
    await account.updatePassword({
      password: newPassword
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Password update failed', { error: error.message });
    
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to update password',
    };
  }
}

export function isAuthError(result: any): result is AuthError {
  return result && typeof result === 'object' && 'code' in result && 'message' in result && !('user' in result) && !('success' in result);
}

/**
 * Logout user and invalidate session
 */
export async function logout(accessToken?: string): Promise<{ success: boolean } | AuthError> {
  if (!accessToken) {
    return { success: true };
  }

  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Delete current session
    await account.deleteSession({
      sessionId: 'current'
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Logout failed', { error: error.message });
    
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Failed to logout',
    };
  }
}

/**
 * Get current user with KYC status
 */
export async function getCurrentUserWithKyc(userId: string): Promise<AuthResult['user'] | AuthError> {
  const user = await userRepository.getUserById(userId);
  
  if (!user) {
    return {
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    };
  }

  // Default to 'email' since Appwrite manages passwords externally.
  // password_hash is always empty for Appwrite-managed users.
  // OAuth-only users would need a separate flag to distinguish.
  const authProvider: 'email' | 'oauth' = 'email';

  // Admins are automatically considered KYC approved
  if (user.role === 'admin') {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      kycStatus: 'approved',
      createdAt: user.created_at,
      authProvider,
    };
  }

  // Get KYC status for non-admin users
  const { getKycVerificationByUserId } = await import('../repositories/didit-kyc-repository.js');
  const kycVerification = await getKycVerificationByUserId(userId);
  
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    walletAddress: user.wallet_address,
    ...(kycVerification?.status ? { kycStatus: kycVerification.status } : {}),
    createdAt: user.created_at,
    authProvider,
  };
}

/**
 * Get OAuth login URL for Appwrite
 */
export async function getOAuthUrl(provider: string): Promise<string> {
  const userClient = createUserClient('');
  const account = new Account(userClient);

  const frontendBaseUrl = process.env.PUBLIC_URL
    ?? process.env.FRONTEND_URL
    ?? 'http://localhost:5173';
  const normalizedFrontendBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const successUrl = `${normalizedFrontendBaseUrl}/auth/callback`;
  const failureUrl = `${normalizedFrontendBaseUrl}/login?error=oauth_failed`;

  // Appwrite OAuth providers mapping if names differ
  const appwriteProvider = (provider === 'linkedin_oidc' ? 'linkedin' : provider) as OAuthProvider;

  return account.createOAuth2Token(
    appwriteProvider,
    successUrl,
    failureUrl
  );
}

/**
 * Exchange OAuth session for local tokens
 */
export async function exchangeCodeForSession(accessToken: string): Promise<{ accessToken: string; refreshToken: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    // In Appwrite, the "accessToken" passed here from callback is already the session secret
    const appwriteUser = await account.get();
    
    // Check if user exists in our DB, if not they need to register (handled by callback route)
    const publicUser = await userRepository.getUserById(appwriteUser.$id);
    
    if (!publicUser) {
      // User authenticated with OAuth but no DB profile yet
      return {
        code: 'AUTH_REQUIRE_REGISTRATION',
        message: 'OAuth authentication successful, but user profile not found. Please complete registration with a role.',
      };
    }

    return {
      accessToken,
      refreshToken: accessToken, // Appwrite sessions are persistent
    };
  } catch (error: any) {
    logger.error('OAuth session exchange failed', { error: error.message });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to verify OAuth session',
    };
  }
}

/**
 * Enroll user in MFA (Email OTP)
 */
export async function enrollMFA(accessToken: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Enroll in Email OTP
    await account.createMFAAuthenticator({ type: 'email' as any });
    
    return { success: true };
  } catch (error: any) {
    logger.error('MFA enrollment failed', { error: error.message });
    return {
      code: 'MFA_ENROLLMENT_FAILED',
      message: error.message || 'Failed to enroll in MFA',
    };
  }
}

/**
 * Verify MFA enrollment (Email OTP)
 */
export async function verifyMFAEnrollment(accessToken: string, factorId: string, code: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Verify and enable MFA
    await account.updateMFAAuthenticator({
      type: 'email' as any,
      otp: code
    });
    
    // Update DB status
    const appwriteUser = await account.get();
    await userRepository.update(appwriteUser.$id, { mfa_enabled: true });

    return { success: true };
  } catch (error: any) {
    logger.error('MFA verification failed', { error: error.message });
    return {
      code: 'MFA_VERIFY_FAILED',
      message: error.message || 'Invalid MFA code',
    };
  }
}

/**
 * Challenge MFA (for login/sensitive operations)
 */
export async function challengeMFA(accessToken: string, factorId: string): Promise<{ challengeId: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const challenge = await account.createMFAChallenge({
      factor: factorId as any // e.g. 'totp'
    });
    
    return { challengeId: challenge.$id };
  } catch (error: any) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message
    };
  }
}

/**
 * Verify MFA Challenge
 */
export async function verifyMFAChallenge(accessToken: string, factorId: string, challengeId: string, code: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // In Appwrite, we update the session with the MFA challenge
    await account.updateMFAChallenge({
      challengeId,
      otp: code
    });

    return { success: true };
  } catch (error: any) {
    logger.error('MFA challenge verification failed', { error: error.message });
    return {
      code: 'MFA_CHALLENGE_FAILED',
      message: error.message || 'Invalid MFA code',
    };
  }
}

/**
 * Get enrolled MFA factors
 */
export async function getMFAFactors(accessToken: string): Promise<{ factors: any[] } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const factors = await account.listMFAFactors();
    return { factors: factors.totp ? [{ id: 'totp', type: 'totp' }] : [] };
  } catch (error: any) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }
}

/**
 * Disable MFA
 */
export async function disableMFA(accessToken: string, factorId: string, _otpCode?: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    await account.deleteMFAAuthenticator({
      type: AuthenticatorType.Totp
    });
    
    const appwriteUser = await account.get();
    await userRepository.update(appwriteUser.$id, { mfa_enabled: false });

    return { success: true };
  } catch (error: any) {
    return {
      code: 'MFA_DISABLE_FAILED',
      message: error.message,
    };
  }
}

/**
 * Resend confirmation email
 */
export async function resendConfirmationEmail(email: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    const frontendBaseUrl = process.env.PUBLIC_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const redirectUrl = `${frontendBaseUrl.replace(/\/+$/, '')}/verify-email`;
    
    // await account.createVerification(redirectUrl);
    
    logger.warn('resendConfirmationEmail called but Appwrite email verification is not implemented', { email });
    return { success: true };
  } catch (error: any) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }
}

/**
 * OAuth/JWT Login: Validates token and returns local auth session
 */
export async function loginWithAppwrite(accessToken: string): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    // Validate session/token with Appwrite
    const appwriteUser = await account.get();
    
    // Check if user exists in local PostgreSQL database
    const publicUser = await userRepository.getUserById(appwriteUser.$id);
    
    if (!publicUser) {
      return {
        code: 'AUTH_REQUIRE_REGISTRATION',
        message: 'User authenticated but profile not found. Please register.',
      };
    }
    
    return createAuthResult(publicUser, accessToken, accessToken);
  } catch (error: any) {
    logger.error('Login with Appwrite token failed', { error: error.message });
    return {
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid or expired authentication token.',
    };
  }
}

/**
 * OAuth/Token Registration: Create DB user after OAuth or Magic URL
 */
export async function registerWithAppwrite(accessToken: string, role: UserRole): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    // Validate token and get user details from Appwrite
    const appwriteUser = await account.get();
    
    // Check if user already exists
    const existingUser = await userRepository.getUserById(appwriteUser.$id);
    if (existingUser) {
      return {
        code: 'DUPLICATE_EMAIL',
        message: 'User already exists.',
      };
    }
    
    // Create the user in local database
    const publicUser = await userRepository.createUser({
      id: appwriteUser.$id,
      email: appwriteUser.email,
      password_hash: '', // Handled by Appwrite
      role,
      wallet_address: '',
      name: appwriteUser.name || appwriteUser.email.split('@')[0] || 'User',
      is_suspended: false,
      suspension_reason: null,
      mfa_enabled: appwriteUser.mfa || false,
    });
    
    return createAuthResult(publicUser, accessToken, accessToken);
  } catch (error: any) {
    logger.error('Appwrite registration failed', { error: error.message });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to complete registration.',
    };
  }
}

/**
 * Request Phone OTP
 */
export async function requestPhoneOtp(phone: string): Promise<{ userId: string } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    // Appwrite creates or uses existing user with this phone
    const token = await account.createPhoneToken(ID.unique(), phone);
    return { userId: token.userId };
  } catch (error: any) {
    logger.error('Phone OTP request failed', { error: error.message, phone });
    return { code: 'INTERNAL_ERROR', message: error.message || 'Failed to send OTP to phone' };
  }
}

/**
 * Request Email OTP
 */
export async function requestEmailOtp(email: string): Promise<{ userId: string } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    const token = await account.createEmailToken(ID.unique(), email.toLowerCase().trim());
    return { userId: token.userId };
  } catch (error: any) {
    logger.error('Email OTP request failed', { error: error.message, email });
    return { code: 'INTERNAL_ERROR', message: error.message || 'Failed to send OTP to email' };
  }
}

/**
 * Request Magic URL
 */
export async function requestMagicUrl(email: string): Promise<{ userId: string } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    const frontendBaseUrl = process.env.PUBLIC_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const redirectUrl = `${frontendBaseUrl.replace(/\/+$/, '')}/auth/magic-url-callback`;
    
    const token = await account.createMagicURLToken(ID.unique(), email.toLowerCase().trim(), redirectUrl);
    return { userId: token.userId };
  } catch (error: any) {
    logger.error('Magic URL request failed', { error: error.message, email });
    return { code: 'INTERNAL_ERROR', message: error.message || 'Failed to send Magic URL' };
  }
}

/**
 * Verify Token (Phone OTP, Email OTP, or Magic URL)
 */
export async function verifyAuthToken(userId: string, secret: string): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    // Verify the secret and create a session
    const session = await account.createSession(userId, secret);
    
    // Now that session is created, log in using the session secret
    return await loginWithAppwrite(session.secret);
  } catch (error: any) {
    logger.error('Token verification failed', { error: error.message });
    return { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired code/token' };
  }
}
