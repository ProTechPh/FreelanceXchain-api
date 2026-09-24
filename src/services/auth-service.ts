import { randomInt } from 'crypto';
import { ID, Account, OAuthProvider, AuthenticatorType, AuthenticationFactor } from 'node-appwrite';
import type { Models } from 'node-appwrite';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { employerProfileRepository } from '../repositories/employer-profile-repository.js';
import { emailPreferenceRepository } from '../repositories/email-preference-repository.js';
import { favoriteRepository } from '../repositories/favorites-repository.js';
import { account as adminAccount, createUserClient, users } from '../config/appwrite.js';
import { UserRole } from '../models/user.js';
import { getErrorMessage } from '../utils/index.js';
import { getFrontendBaseUrl } from '../utils/url-helpers.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import {
  sendAccountDeletionCodeEmail,
  sendAccountDeletedEmail,
} from './email-delivery-service.js';
import {
  RegisterInput,
  LoginInput,
  AuthResult,
  AuthError,
  AuthResponse,
  isAuthError,
} from './auth-types.js';

export { isAuthError };

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

function getErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    const code = (error as Record<string, unknown>).code;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

function getErrorType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const type = (error as Record<string, unknown>).type;
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

function requireSessionSecret(session: { secret?: string }): string {
  if (!session.secret) {
    throw new Error('Appwrite session response did not include a secret');
  }
  return session.secret;
}

function extractSessionSecretFromCookies(cookieHeaders: string[] | string | null | undefined): string | undefined {
  if (!cookieHeaders) return undefined;
  const cookieStr = Array.isArray(cookieHeaders) ? cookieHeaders.join('; ') : cookieHeaders;
  
  const projectId = config.appwrite.projectId.toLowerCase();
  const projectRegex = new RegExp('a_session_' + projectId + '(?:_legacy)?=([^;]+)', 'i');
  const projectMatch = cookieStr.match(projectRegex);
  if (projectMatch && projectMatch[1]) {
    return decodeURIComponent(projectMatch[1]);
  }

  const genericMatch = cookieStr.match(/a_session_[^=]+=([^;]+)/i);
  if (genericMatch && genericMatch[1]) {
    return decodeURIComponent(genericMatch[1]);
  }

  return undefined;
}

function extractAppwriteTokenSecret(secret: string): string {
  if (!secret || typeof secret !== 'string') return secret;
  if (secret.startsWith('ey') && secret.includes('.')) {
    try {
      const parts = secret.split('.');
      if (parts.length >= 2 && parts[1]) {
        const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(payloadStr);
        if (payload && typeof payload.secret === 'string') {
          return payload.secret;
        }
      }
    } catch {
      // ignore
    }
  }
  return secret;
}

async function tryGuestSdkSession(userId: string, secret: string): Promise<string | null> {
  try {
    const guestClient = createUserClient('');
    const guestAccount = new Account(guestClient);
    const session = await guestAccount.createSession({ userId, secret });
    if (session?.secret) return session.secret;
  } catch (sdkError: unknown) {
    logger.warn('createTokenSession: SDK guest client failed', {
      userId,
      error: getErrorMessage(sdkError),
    });
  }
  return null;
}

async function exchangeTokenViaHttp(userId: string, secret: string): Promise<string> {
  const url = config.appwrite.endpoint + '/account/sessions/token';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': config.appwrite.projectId,
    },
    body: JSON.stringify({ userId, secret }),
  });

  logger.info('createTokenSession: HTTP fallback response', {
    userId,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.warn('createTokenSession: HTTP fallback error body', { userId, errText });

    try {
      const adminSession = await adminAccount.createSession({ userId, secret });
      if (adminSession?.secret) return adminSession.secret;
    } catch {
      // ignore
    }
    throw new Error('Token session exchange failed: ' + response.status + ' ' + errText);
  }

  const data = (await response.json().catch(() => ({}))) as { secret?: string };
  if (data.secret) return data.secret;

  const getSetCookie = (response.headers as any).getSetCookie;
  const rawCookies: string[] = getSetCookie ? getSetCookie.call(response.headers) : [];
  const secretFromCookie = extractSessionSecretFromCookies([response.headers.get('set-cookie') || '', ...rawCookies]);
  if (secretFromCookie) return secretFromCookie;

  throw new Error('Appwrite session response did not include a secret or session cookie');
}

async function createTokenSession(userId: string, rawSecret: string): Promise<string> {
  const secret = extractAppwriteTokenSecret(rawSecret);
  const wasJwt = secret !== rawSecret;

  logger.info('createTokenSession: starting', {
    userId,
    wasJwt,
    secretLen: secret.length,
    hasSecret: Boolean(rawSecret),
  });

  if (config.server.nodeEnv === 'test') {
    const adminSession = await adminAccount.createSession({ userId, secret });
    if (adminSession?.secret) return adminSession.secret;
  }

  try {
    const userSession = await users.createSession(userId);
    if (userSession?.secret) {
      logger.info('createTokenSession: users.createSession succeeded', {
        userId,
        hasSecret: true,
      });
      return userSession.secret;
    }
  } catch (usersErr: unknown) {
    logger.warn('createTokenSession: users.createSession failed, trying guest token exchange', {
      userId,
      error: getErrorMessage(usersErr),
    });
  }

  const sdkSecret = await tryGuestSdkSession(userId, secret);
  if (sdkSecret) return sdkSecret;

  if (wasJwt) {
    const rawSdkSecret = await tryGuestSdkSession(userId, rawSecret);
    if (rawSdkSecret) return rawSdkSecret;
  }

  return exchangeTokenViaHttp(userId, secret);
}

async function createEmailPasswordSessionHelper(email: string, password: string): Promise<string> {
  if (config.server.nodeEnv === 'test') {
    const adminSession = await adminAccount.createEmailPasswordSession({ email, password });
    if (!adminSession?.secret) {
      throw new Error('Appwrite session response did not include an authentication secret');
    }
    return adminSession.secret;
  }

  try {
    const adminSession = await adminAccount.createEmailPasswordSession({ email, password });
    if (adminSession?.secret) return adminSession.secret;
  } catch (adminErr: unknown) {
    logger.debug('adminAccount.createEmailPasswordSession failed, attempting guest fallback', { error: getErrorMessage(adminErr) });
  }

  const url = config.appwrite.endpoint + '/account/sessions/email';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': config.appwrite.projectId,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Email password login failed: ' + response.status + ' ' + errText);
  }

  const data = (await response.json().catch(() => ({}))) as { secret?: string };
  if (data.secret) return data.secret;

  const getSetCookie = (response.headers as any).getSetCookie;
  const rawCookies: string[] = getSetCookie ? getSetCookie.call(response.headers) : [];
  const secretFromCookie = extractSessionSecretFromCookies([response.headers.get('set-cookie') || '', ...rawCookies]);
  if (secretFromCookie) return secretFromCookie;

  throw new Error('Appwrite email session response did not include a secret or session cookie');
}

type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push('Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push('Password must be at most ' + PASSWORD_MAX_LENGTH + ' characters');
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
  if (user.is_suspended) {
    return {
      code: 'USER_SUSPENDED',
      message: user.suspension_reason || 'Your account has been suspended',
    };
  }

  const { getKycVerificationByUserId } = await import('../repositories/didit-kyc-repository.js');
  const kycVerification = await getKycVerificationByUserId(user.id);

  let emailVerification = false;
  let authProvider: 'email' | 'oauth' = 'email';
  try {
    if (typeof users?.get === 'function') {
      const appwriteUser = await users.get(user.id);
      emailVerification = appwriteUser.emailVerification ?? false;
      if (appwriteUser.passwordUpdate === '') {
        authProvider = 'oauth';
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch Appwrite user details during token generation', { userId: user.id, error });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      ...(kycVerification?.status ? { kycStatus: kycVerification.status } : {}),
      createdAt: user.created_at,
      emailVerification,
      authProvider,
    },
    accessToken,
    refreshToken,
  };
}

async function sendVerificationEmail(sessionSecret: string, userId: string, email: string): Promise<void> {
  try {
    const userClient = createUserClient(sessionSecret);
    const account = new Account(userClient);
    const frontendBaseUrl = getFrontendBaseUrl();
    const redirectUrl = frontendBaseUrl + '/verify-email';
    await account.createVerification(redirectUrl);
    logger.info('Email verification link dispatched upon registration', { userId, email });
  } catch (verificationError) {
    logger.warn('Failed to send verification email upon registration', {
      error: getErrorMessage(verificationError),
      email,
    });
  }
}

function toAuthError(error: unknown): AuthError {
  if (getErrorMessage(error)?.includes('already exists') || getErrorCode(error) === 409) {
    return {
      code: 'DUPLICATE_EMAIL',
      message: 'An account with this email already exists',
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'Failed to create user',
  };
}


async function createAppwriteUser(
  email: string,
  password: string
): Promise<Models.User<Models.Preferences>> {
  return users.create(
    ID.unique(),
    email,
    undefined,
    password,
    email.split('@')[0]
  );
}

async function createPublicUserRecord(
  appwriteUserId: string,
  email: string,
  role: UserRole
): Promise<UserEntity> {
  const publicUser = await userRepository.createUser({
    id: appwriteUserId,
    email: email,
    password_hash: '',
    role: role,
    wallet_address: '',
    name: email.split('@')[0] || 'User',
    is_suspended: false,
    suspension_reason: null,
    mfa_enabled: false,
  });
  return publicUser;
}

async function ensureEmailIsUnique(email: string): Promise<void> {
  const emailExists = await userRepository.emailExists(email);
  if (emailExists) {
    throw Object.assign(new Error('An account with this email already exists'), {
      code: 'DUPLICATE_EMAIL',
    });
  }
}

function buildAuthResult(publicUser: UserEntity, sessionSecret: string): AuthResult {
  return {
    user: {
      id: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
      walletAddress: publicUser.wallet_address,
      createdAt: publicUser.created_at,
      emailVerification: false,
    },
    accessToken: sessionSecret,
    refreshToken: sessionSecret,
  };
}

export async function register(input: RegisterInput): Promise<AuthResult | AuthError> {
  const normalizedEmail = input.email.toLowerCase().trim();

  try {
    await ensureEmailIsUnique(normalizedEmail);
  } catch (error) {
    if ((error as any).code === 'DUPLICATE_EMAIL') {
      return {
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      };
    }
    throw error;
  }

  logger.info('Registration attempt', { email: normalizedEmail, role: input.role });

  let appwriteUserId: string | undefined;
  try {
    const appwriteUser = await createAppwriteUser(normalizedEmail, input.password);
    appwriteUserId = appwriteUser.$id;
    logger.info('Appwrite user created', { userId: appwriteUserId });
    const publicUser = await createPublicUserRecord(appwriteUserId, normalizedEmail, input.role);
    logger.info('Public user record created', { userId: publicUser.id });
    const sessionSecret = await createEmailPasswordSessionHelper(normalizedEmail, input.password);
    await sendVerificationEmail(sessionSecret, publicUser.id, normalizedEmail);
    return buildAuthResult(publicUser, sessionSecret);
  } catch (error: unknown) {
    if (appwriteUserId) {
      try {
        await users.delete(appwriteUserId);
        logger.warn(
          'Compensated: deleted orphaned Appwrite user after registration failure',
          { appwriteUserId }
        );
      } catch (deleteError: unknown) {
        logger.error(
          'CRITICAL: Failed to delete orphaned Appwrite user',
          {
            appwriteUserId: appwriteUserId,
            deleteError: deleteError instanceof Error ? deleteError.message : String(deleteError),
          }
        );
      }
    }
    return toAuthError(error);
  }
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const normalizedEmail = input.email.toLowerCase().trim();

  try {
    const sessionSecret = await createEmailPasswordSessionHelper(normalizedEmail, input.password);
    const authenticatedAccount = new Account(createUserClient(sessionSecret));

    let accountUser: any;
    try {
      accountUser = await authenticatedAccount.get();
    } catch (mfaError: unknown) {
      if (getErrorType(mfaError) === 'user_more_factors_required') {
        return {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required',
          mfaRequired: true,
          mfaSessionToken: sessionSecret,
        };
      }
      throw mfaError;
    }

    const publicUser = await userRepository.getUserByEmail(normalizedEmail);

    if (!publicUser) {
      return {
        code: 'INVALID_CREDENTIALS',
        message: 'User profile not found',
      };
    }

    const isEmailVerified = accountUser?.emailVerification ?? false;
    if (!isEmailVerified && publicUser.role !== 'admin') {
      try {
        await authenticatedAccount.deleteSession({ sessionId: 'current' });
      } catch (sessionError) {
        logger.warn('Failed to delete unverified email session', { error: sessionError });
      }
      return {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
      };
    }

    return await createAuthResult(publicUser, sessionSecret, sessionSecret);
  } catch (error: unknown) {
    logger.error('Login failed', { error: getErrorMessage(error), email: normalizedEmail });
    
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }
}

async function resolvePublicUser(appwriteUser: Models.User<Models.Preferences>): Promise<UserEntity | null> {
  let publicUser = await userRepository.getUserById(appwriteUser.$id);

  if (!publicUser && appwriteUser.email) {
    publicUser = await userRepository.getUserByEmail(appwriteUser.email.toLowerCase().trim());
  }

  return publicUser;
}

export async function refreshTokens(refreshToken: string): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(refreshToken);
    const account = new Account(userClient);

    const appwriteUser = await account.get();
    const publicUser = await resolvePublicUser(appwriteUser);

    if (!publicUser) {
      return {
        code: 'INVALID_TOKEN',
        message: 'User not found',
      };
    }

    const result = await createAuthResult(publicUser, refreshToken, refreshToken);
    return result;
  } catch (error: unknown) {
    logger.error('Token refresh failed', { error: getErrorMessage(error) });
    
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired refresh token',
    };
  }
}

export async function validateToken(accessToken: string): Promise<{ id: string; userId: string; email: string; role: UserRole } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    const appwriteUser = await account.get();
    const publicUser = await resolvePublicUser(appwriteUser);

    if (!publicUser) {
      return {
        code: 'INVALID_TOKEN',
        message: 'User not found',
      };
    }

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
  } catch (error: unknown) {
    logger.error('Token validation failed', { error: getErrorMessage(error) });
    
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    };
  }
}

export async function validateTokenAndGetUser(accessToken: string): Promise<AuthResult | AuthError> {
  const tokenResult = await validateToken(accessToken);
  
  if ('code' in tokenResult) {
    return tokenResult;
  }

  let userEntity = await userRepository.getUserById(tokenResult.userId);
  if (!userEntity && tokenResult.email) {
    userEntity = await userRepository.getUserByEmail(tokenResult.email);
  }
  
  if (!userEntity) {
    return {
      code: 'INVALID_TOKEN',
      message: 'User not found',
    };
  }

  return createAuthResult(userEntity, accessToken, accessToken);
}

export async function requestPasswordReset(email: string, customFrontendUrl?: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);

    const frontendBaseUrl = getFrontendBaseUrl(customFrontendUrl);
    const redirectUrl = frontendBaseUrl + '/reset-password';

    await account.createRecovery({
      email: email.toLowerCase().trim(), 
      url: redirectUrl
    });

    logger.info('Password reset recovery email dispatched', { email, redirectUrl });
    return { success: true };
  } catch (error: unknown) {
    logger.error('Password reset request failed', { error: getErrorMessage(error), email });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to send password reset email',
    };
  }
}

export async function resetPasswordWithRecovery(
  userId: string,
  secret: string,
  newPassword: string
): Promise<{ success: boolean } | AuthError> {
  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: validation.errors.join(', '),
    };
  }

  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);

    await account.updateRecovery({
      userId,
      secret,
      password: newPassword,
    });

    logger.info('Password reset completed via Appwrite updateRecovery', { userId });
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error) || '';
    const errorType = (error && typeof error === 'object' && 'type' in error) ? String((error as any).type).toLowerCase() : '';
    const lowerMsg = errorMessage.toLowerCase();

    logger.error('Password reset with recovery failed', { error: errorMessage, type: errorType, userId });

    if (
      lowerMsg.includes('recent') ||
      lowerMsg.includes('history') ||
      lowerMsg.includes('previous') ||
      lowerMsg.includes('same') ||
      lowerMsg.includes('current') ||
      errorType.includes('history') ||
      errorType.includes('recent')
    ) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'New password cannot be the same as your current or recently used password. Please choose a different password.',
      };
    }

    if (
      lowerMsg.includes('token') ||
      lowerMsg.includes('expired') ||
      lowerMsg.includes('invalid') ||
      lowerMsg.includes('secret') ||
      errorType.includes('token')
    ) {
      return {
        code: 'INVALID_TOKEN',
        message: 'This password reset link is invalid or has expired.',
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to reset password. Please request a new link.',
    };
  }
}

export async function updatePassword(accessToken: string, newPassword: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    await account.updatePassword({
      password: newPassword
    });

    try {
      await account.deleteSessions();
    } catch (sessionError) {
      logger.warn('Failed to invalidate sessions after password change', {
        error: sessionError instanceof Error ? sessionError.message : String(sessionError),
      });
    }

    return { success: true };
  } catch (error: unknown) {
    logger.error('Password update failed', { error: getErrorMessage(error) });

    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to update password',
    };
  }
}

export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean } | AuthError> {
  const validation = validatePasswordStrength(newPassword);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: validation.errors.join(', '),
    };
  }

  if (currentPassword === newPassword) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'New password must be different from current password',
    };
  }

  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    await account.updatePassword({
      password: newPassword,
      oldPassword: currentPassword,
    });

    try {
      await account.deleteSessions();
    } catch (sessionErr) {
      logger.debug('deleteSessions failed during password reset, trying single session deletion', { error: sessionErr });
      try {
        await account.deleteSession({ sessionId: 'current' });
      } catch (currentErr) {
        logger.debug('Current session deletion failed during password reset', { error: currentErr });
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const errorType = getErrorType(error);
    const errorMessage = getErrorMessage(error) || '';

    if (
      errorType === 'user_invalid_credentials' ||
      errorMessage.toLowerCase().includes('credential') ||
      errorMessage.toLowerCase().includes('password')
    ) {
      return {
        code: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect',
      };
    }

    logger.error('Password change failed', { error: errorMessage });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to change password',
    };
  }
}

export async function logout(accessToken?: string): Promise<{ success: boolean } | AuthError> {
  if (!accessToken) {
    return { success: true };
  }

  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    await account.deleteSession({
      sessionId: 'current'
    });

    return { success: true };
  } catch (error: unknown) {
    logger.error('Logout failed', { error: getErrorMessage(error) });
    
    return {
      code: 'INTERNAL_ERROR',
      message: getErrorMessage(error) || 'Failed to logout',
    };
  }
}

export async function getCurrentUserWithKyc(userId: string): Promise<AuthResult['user'] | AuthError> {
  const user = await userRepository.getUserById(userId);
  
  if (!user) {
    return {
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    };
  }

  let authProvider: 'email' | 'oauth' = 'email';

  let emailVerification = false;
  try {
    if (typeof users?.get === 'function') {
      const appwriteUser = await users.get(userId);
      emailVerification = appwriteUser.emailVerification ?? false;
      if (appwriteUser.passwordUpdate === '') {
        authProvider = 'oauth';
      }
    }
  } catch (error) {
    logger.warn('Failed to retrieve Appwrite user metadata for current user', { userId, error });
  }

  if (user.role === 'admin') {
    return {
      id: user.id,
      name: user.name || user.email.split('@')[0] || 'Admin',
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      kycStatus: 'approved',
      createdAt: user.created_at,
      authProvider,
      emailVerification,
      plan: 'pro',
      planStatus: 'active',
    };
  }

  const { getKycVerificationByUserId } = await import('../repositories/didit-kyc-repository.js');
  const kycVerification = await getKycVerificationByUserId(userId);
  const kycFullName = [kycVerification?.first_name, kycVerification?.last_name].filter(Boolean).join(' ').trim();
  const displayName: string = (kycVerification?.status === 'approved' || kycVerification?.status === 'completed') && kycFullName
    ? kycFullName
    : (user.name || user.email.split('@')[0] || 'User');

  const { getEntitlement } = await import('./subscription-service.js');
  const entitlement = await getEntitlement(userId);
  const plan = entitlement.success ? entitlement.data.plan : 'free';
  const planStatus = entitlement.success ? entitlement.data.status : 'none';

  return {
    id: user.id,
    name: displayName,
    email: user.email,
    role: user.role,
    walletAddress: user.wallet_address,
    ...(kycVerification?.status ? { kycStatus: kycVerification.status } : {}),
    createdAt: user.created_at,
    authProvider,
    emailVerification,
    plan,
    planStatus,
  };
}

export async function updateUserWallet(
  userId: string,
  walletAddress: string
): Promise<{ walletAddress: string } | AuthError> {
  try {
    const existing = await userRepository.getUserById(userId);
    if (!existing) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      };
    }

    const normalizedExisting = existing.wallet_address?.toLowerCase();
    const normalizedRequested = walletAddress.toLowerCase();
    if (normalizedExisting && normalizedExisting !== normalizedRequested) {
      return {
        code: 'WALLET_LOCKED',
        message: 'Wallet address is already set and cannot be changed',
      };
    }

    if (normalizedExisting === normalizedRequested) {
      return { walletAddress: existing.wallet_address ?? walletAddress };
    }

    const updated = await userRepository.updateUser(userId, { wallet_address: walletAddress });
    if (!updated) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      };
    }

    return { walletAddress: updated.wallet_address ?? walletAddress };
  } catch (error: unknown) {
    logger.error('Failed to update wallet address', { error: getErrorMessage(error), userId });
    return {
      code: 'UPDATE_FAILED',
      message: 'Failed to update wallet address',
    };
  }
}

export async function getOAuthUrl(provider: string, customFrontendUrl?: string): Promise<string> {
  const userClient = createUserClient('');
  const account = new Account(userClient);

  const frontendBaseUrl = getFrontendBaseUrl(customFrontendUrl);
  const successUrl = frontendBaseUrl + '/auth/callback';
  const failureUrl = frontendBaseUrl + '/login?error=oauth_failed';

  const appwriteProvider = (provider === 'linkedin_oidc' ? 'linkedin' : provider) as OAuthProvider;

  logger.info('Generating OAuth URL', {
    provider: appwriteProvider,
    successUrl,
    failureUrl,
    endpoint: config.appwrite.endpoint,
    projectId: config.appwrite.projectId,
  });

  try {
    return await account.createOAuth2Token(
      appwriteProvider,
      successUrl,
      failureUrl
    );
  } catch (error: unknown) {
    logger.error('Failed to create OAuth2 token in Appwrite', {
      error: getErrorMessage(error),
      provider: appwriteProvider,
      successUrl,
      failureUrl,
    });
    throw error;
  }
}

export async function exchangeCodeForSession(accessToken: string): Promise<{ accessToken: string; refreshToken: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const appwriteUser = await account.get();
    
    const publicUser = await userRepository.getUserById(appwriteUser.$id);
    
    if (!publicUser) {
      return {
        code: 'AUTH_REQUIRE_REGISTRATION',
        message: 'OAuth authentication successful, but user profile not found. Please complete registration with a role.',
      };
    }

    return {
      accessToken,
      refreshToken: accessToken,
    };
  } catch (error: unknown) {
    logger.error('OAuth session exchange failed', { error: getErrorMessage(error) });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to verify OAuth session',
    };
  }
}

export async function enrollMFA(accessToken: string, factorType: 'totp' | 'email' = 'totp'): Promise<{ success: boolean; recoveryCodes?: string[]; secret?: string; uri?: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    if (factorType === 'totp') {
      const result = await account.createMFAAuthenticator({ type: AuthenticatorType.Totp });
      
      let recoveryCodes: string[] = [];
      try {
        const codes = await account.createMfaRecoveryCodes();
        recoveryCodes = codes.recoveryCodes;
      } catch (recoveryErr) {
        logger.info('MFA recovery codes could not be created (may already exist)', { error: recoveryErr });
      }

      return { 
        success: true, 
        recoveryCodes,
        secret: result.secret,
        uri: result.uri,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    logger.error('MFA enrollment failed', { error: getErrorMessage(error) });
    return {
      code: 'MFA_ENROLLMENT_FAILED',
      message: getErrorMessage(error) || 'Failed to enroll in MFA',
    };
  }
}

export async function verifyMFAEnrollment(accessToken: string, factorType: 'totp' | 'email', code: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    if (factorType === 'totp') {
      await account.updateMFAAuthenticator({
        type: AuthenticatorType.Totp,
        otp: code
      });
    }
    
    await account.updateMFA(true);
    
    const appwriteUser = await account.get();
    await userRepository.update(appwriteUser.$id, { mfa_enabled: true });

    return { success: true };
  } catch (error: unknown) {
    logger.error('MFA verification failed', { error: getErrorMessage(error) });
    return {
      code: 'MFA_VERIFY_FAILED',
      message: getErrorMessage(error) || 'Invalid MFA code',
    };
  }
}

export async function challengeMFA(accessToken: string, factorId: string): Promise<{ challengeId: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const challenge = await account.createMFAChallenge({
      factor: factorId as AuthenticationFactor
    });
    
    return { challengeId: challenge.$id };
  } catch (error: unknown) {
    return {
      code: 'INTERNAL_ERROR',
      message: getErrorMessage(error) || ''
    };
  }
}

export async function verifyMFAChallenge(accessToken: string, factorId: string, challengeId: string, code: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    await account.updateMFAChallenge({
      challengeId,
      otp: code
    });

    return { success: true };
  } catch (error: unknown) {
    logger.error('MFA challenge verification failed', { error: getErrorMessage(error) });
    return {
      code: 'MFA_CHALLENGE_FAILED',
      message: getErrorMessage(error) || 'Invalid MFA code',
    };
  }
}

export async function getMFAFactors(accessToken: string): Promise<{ factors: { id: string; type: string }[] } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const factors = await account.listMFAFactors();
    const result: { id: string; type: string }[] = [];
    
    if (factors.totp) result.push({ id: 'totp', type: 'totp' });
    if (factors.email) result.push({ id: 'email', type: 'email' });
    
    return { factors: result };
  } catch (error: unknown) {
    return {
      code: 'MFA_LIST_FAILED',
      message: getErrorMessage(error) || '',
    };
  }
}

export async function disableMFA(accessToken: string, factorType: 'totp' | 'email', otpCode?: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    if (!otpCode) {
      return {
        code: 'MFA_CODE_REQUIRED',
        message: 'OTP code is required to disable MFA',
      };
    }

    const challenge = await account.createMFAChallenge({
      factor: factorType as AuthenticationFactor,
    });

    await account.updateMFAChallenge({
      challengeId: challenge.$id,
      otp: otpCode,
    });

    if (factorType === 'totp') {
      await account.deleteMFAAuthenticator({
        type: AuthenticatorType.Totp
      });
    }

    await account.updateMFA(false);

    const appwriteUser = await account.get();
    await userRepository.update(appwriteUser.$id, { mfa_enabled: false });

    return { success: true };
  } catch (error: unknown) {
    return {
      code: 'MFA_DISABLE_FAILED',
      message: getErrorMessage(error) || '',
    };
  }
}

export async function resendConfirmationEmail(email: string): Promise<{ success: boolean } | AuthError> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.getUserByEmail(normalizedEmail);
    if (!user) {
      return { success: true };
    }

    const session = await users.createSession(user.id);
    const sessionSecret = requireSessionSecret(session);

    try {
      const userClient = createUserClient(sessionSecret);
      const account = new Account(userClient);

      const frontendBaseUrl = getFrontendBaseUrl();
      const redirectUrl = frontendBaseUrl + '/verify-email';

      await account.createVerification(redirectUrl);
    } finally {
      try {
        await users.deleteSession(user.id, session.$id);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temporary session used for email verification', {
          error: getErrorMessage(cleanupError),
          email: normalizedEmail,
        });
      }
    }

    logger.info('Confirmation email sent', { email: normalizedEmail });
    return { success: true };
  } catch (error: unknown) {
    logger.error('Failed to resend confirmation email', { error: getErrorMessage(error), email });
    return { success: true };
  }
}

export async function verifyEmail(userId: string, secret: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);

    await account.updateVerification(userId, secret);
    logger.info('Email verified successfully via token', { userId });
    return { success: true };
  } catch (error: unknown) {
    logger.error('Failed to verify email token', { error: getErrorMessage(error), userId });
    return {
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid or expired verification link',
    };
  }
}

export async function loginWithAppwrite(accessToken: string): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const appwriteUser = await account.get();
    
    const publicUser = await userRepository.getUserById(appwriteUser.$id);
    
    if (!publicUser) {
      return {
        code: 'AUTH_REQUIRE_REGISTRATION',
        message: 'User authenticated but profile not found. Please register.',
      };
    }
    
    return createAuthResult(publicUser, accessToken, accessToken);
  } catch (error: unknown) {
    logger.error('Login with Appwrite token failed', { error: getErrorMessage(error) });
    return {
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid or expired authentication token.',
    };
  }
}

export async function registerWithAppwrite(accessToken: string, role: UserRole): Promise<AuthResult | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const appwriteUser = await account.get();
    
    const existingUser = await userRepository.getUserById(appwriteUser.$id);
    if (existingUser) {
      return {
        code: 'DUPLICATE_EMAIL',
        message: 'User already exists.',
      };
    }
    
    const publicUser = await userRepository.createUser({
      id: appwriteUser.$id,
      email: appwriteUser.email,
      password_hash: '',
      role,
      wallet_address: '',
      name: appwriteUser.name || appwriteUser.email.split('@')[0] || 'User',
      is_suspended: false,
      suspension_reason: null,
      mfa_enabled: appwriteUser.mfa || false,
    });
    
    return createAuthResult(publicUser, accessToken, accessToken);
  } catch (error: unknown) {
    logger.error('Appwrite registration failed', { error: getErrorMessage(error) });
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to complete registration.',
    };
  }
}

export async function requestEmailOtp(email: string): Promise<{ userId: string } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    const token = await account.createEmailToken(ID.unique(), email.toLowerCase().trim());
    return { userId: token.userId };
  } catch (error: unknown) {
    logger.error('Email OTP request failed', { error: getErrorMessage(error), email });
    return { code: 'INTERNAL_ERROR', message: 'Failed to send OTP to email' };
  }
}

export async function requestMagicUrl(email: string): Promise<{ userId: string } | AuthError> {
  try {
    const userClient = createUserClient('');
    const account = new Account(userClient);
    
    const frontendBaseUrl = getFrontendBaseUrl();
    const redirectUrl = frontendBaseUrl + '/auth/magic-url-callback';
    
    const token = await account.createMagicURLToken(ID.unique(), email.toLowerCase().trim(), redirectUrl);
    return { userId: token.userId };
  } catch (error: unknown) {
    logger.error('Magic URL request failed', { error: getErrorMessage(error), email });
    return { code: 'INTERNAL_ERROR', message: 'Failed to send Magic URL' };
  }
}

export async function verifyAuthToken(userId: string, secret: string): Promise<AuthResult | (AuthError & { accessToken?: string })> {
  try {
    const sessionSecret = await createTokenSession(userId, secret);

    const loginResult = await loginWithAppwrite(sessionSecret);
    if (isAuthError(loginResult)) {
      if (loginResult.code === 'AUTH_REQUIRE_REGISTRATION') {
        return {
          ...loginResult,
          accessToken: sessionSecret,
        };
      }
      return loginResult;
    }
    return loginResult;
  } catch (error: unknown) {
    logger.error('Token verification failed', { error: getErrorMessage(error) });
    return { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired code/token' };
  }
}

class ActiveContractsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActiveContractsError';
  }
}

async function ensureNoActiveContracts(userId: string): Promise<void> {
  const freelancerContracts = await contractRepository.getContractsByFreelancer(userId, { limit: 50 }).catch(() => null);
  const employerContracts = await contractRepository.getContractsByEmployer(userId, { limit: 50 }).catch(() => null);
  const hasActiveContract =
    freelancerContracts?.items.some((c) => c.status === 'active' || c.status === 'disputed') ||
    employerContracts?.items.some((c) => c.status === 'active' || c.status === 'disputed');

  if (hasActiveContract) {
    throw new ActiveContractsError('Cannot delete account while you have active or disputed contracts with pending escrow funds. Please complete or resolve active contracts first.');
  }
}

async function cleanupUserData(userId: string, role: string): Promise<void> {
  if (role === 'freelancer') {
    const profile = await freelancerProfileRepository.getProfileByUserId(userId).catch(() => null);
    if (profile) {
      await freelancerProfileRepository.delete(profile.id).catch(() => {});
    }
  } else if (role === 'employer') {
    const profile = await employerProfileRepository.getProfileByUserId(userId).catch(() => null);
    if (profile) {
      await employerProfileRepository.delete(profile.id).catch(() => {});
    }
  }

  const emailPref = await emailPreferenceRepository.findByUserId(userId).catch(() => null);
  if (emailPref) {
    await emailPreferenceRepository.delete(emailPref.id).catch(() => {});
  }

  const favs = await favoriteRepository.findByUser(userId).catch(() => []);
  for (const f of favs) {
    await favoriteRepository.delete(f.id).catch(() => {});
  }
}

interface DeletionCodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const accountDeletionCodes = new Map<string, DeletionCodeEntry>();

function cleanExpiredDeletionCodes(): void {
  const now = Date.now();
  for (const [userId, entry] of accountDeletionCodes.entries()) {
    if (now > entry.expiresAt) {
      accountDeletionCodes.delete(userId);
    }
  }
}

function maskEmail(email: string): string {
  const parts = email.split('@');
  const local = parts[0] ?? '';
  const domain = parts[1];
  if (!domain || !local) return email;
  if (local.length <= 2) {
    const first = local[0] ?? '*';
    return `${first}***@${domain}`;
  }
  const first = local[0] ?? '*';
  const last = local[local.length - 1] ?? '*';
  return `${first}***${last}@${domain}`;
}

export async function requestAccountDeletion(userId: string): Promise<{ success: boolean; message: string; email?: string; testCode?: string } | AuthError> {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      };
    }

    try {
      await ensureNoActiveContracts(userId);
    } catch (error) {
      if (error instanceof ActiveContractsError) {
        return {
          code: 'ACTIVE_CONTRACTS_EXIST',
          message: error.message,
        };
      }
      throw error;
    }

    cleanExpiredDeletionCodes();

    // Generate cryptographically secure 6-digit confirmation code
    const code = randomInt(100000, 1000000).toString();
    accountDeletionCodes.set(userId, {
      code,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      attempts: 0,
    });

    if (user.email) {
      sendAccountDeletionCodeEmail(user.email, {
        recipientName: user.name || user.email.split('@')[0] || 'User',
        confirmationCode: code,
        expiresMinutes: 15,
      }).catch((emailErr) => {
        logger.warn('Failed to send account deletion confirmation code email', {
          userId,
          email: user.email,
          error: getErrorMessage(emailErr),
        });
      });
      logger.info('Account deletion confirmation code dispatched to email', { userId, email: user.email });
    }

    const masked = user.email ? maskEmail(user.email) : undefined;
    return {
      success: true,
      message: `A 6-digit confirmation code has been sent to ${masked || 'your registered email'}.`,
      ...(masked ? { email: masked } : {}),
      ...(config.server.nodeEnv === 'test' ? { testCode: code } : {}),
    };
  } catch (error: unknown) {
    logger.error('Account deletion request failed', { error: getErrorMessage(error), userId });
    return {
      code: 'REQUEST_FAILED',
      message: 'Failed to request account deletion code. Please try again.',
    };
  }
}

export function verifyAccountDeletionCode(userId: string, code: string): true | AuthError {
  cleanExpiredDeletionCodes();
  const entry = accountDeletionCodes.get(userId);

  if (!entry || Date.now() > entry.expiresAt) {
    accountDeletionCodes.delete(userId);
    return {
      code: 'INVALID_CONFIRMATION_CODE',
      message: 'Confirmation code has expired or was not requested. Please request a new code.',
    };
  }

  if (entry.attempts >= 5) {
    accountDeletionCodes.delete(userId);
    return {
      code: 'MAX_ATTEMPTS_EXCEEDED',
      message: 'Too many invalid attempts. Please request a new confirmation code.',
    };
  }

  if (entry.code !== code.trim()) {
    entry.attempts += 1;
    return {
      code: 'INVALID_CONFIRMATION_CODE',
      message: 'Invalid confirmation code. Please check your email and try again.',
    };
  }

  // Code verified successfully - remove from store so it cannot be re-used
  accountDeletionCodes.delete(userId);
  return true;
}

export async function deleteUserAccount(userId: string): Promise<{ success: boolean; message: string } | AuthError> {
  try {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      };
    }

    try {
      await ensureNoActiveContracts(userId);
    } catch (error) {
      if (error instanceof ActiveContractsError) {
        return {
          code: 'ACTIVE_CONTRACTS_EXIST',
          message: error.message,
        };
      }
      throw error;
    }

    const userEmail = user.email;
    const userName = user.name || user.email.split('@')[0] || 'User';

    await cleanupUserData(userId, user.role);

    try {
      await users.delete(userId);
    } catch (appwriteErr) {
      logger.warn('Failed to delete user from Appwrite auth service', { userId, error: getErrorMessage(appwriteErr) });
    }

    await userRepository.deleteUser(userId);

    // Send post-deletion notification email
    if (userEmail) {
      sendAccountDeletedEmail(userEmail, {
        recipientName: userName,
        deletionDate: new Date().toUTCString(),
      }).catch((emailErr) => {
        logger.warn('Failed to send account deletion notification email', {
          userId,
          email: userEmail,
          error: getErrorMessage(emailErr),
        });
      });
      logger.info('Account deletion notification email dispatched', { userId, email: userEmail });
    }

    logger.info('User account permanently deleted under data erasure compliance', { userId });
    return {
      success: true,
      message: 'Account and associated data have been permanently deleted.',
    };
  } catch (error: unknown) {
    logger.error('Account deletion failed', { error: getErrorMessage(error), userId });
    return {
      code: 'DELETE_FAILED',
      message: 'Failed to delete account. Please try again or contact support.',
    };
  }
}

export async function disconnectUserWallet(userId: string): Promise<{ success: boolean; message: string } | AuthError> {
  try {
    const existing = await userRepository.getUserById(userId);
    if (!existing) {
      return {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      };
    }

    const freelancerContracts = await contractRepository.getContractsByFreelancer(userId, { limit: 50 }).catch(() => null);
    const employerContracts = await contractRepository.getContractsByEmployer(userId, { limit: 50 }).catch(() => null);
    const hasActiveContract =
      freelancerContracts?.items.some((c) => c.status === 'active' || c.status === 'disputed') ||
      employerContracts?.items.some((c) => c.status === 'active' || c.status === 'disputed');

    if (hasActiveContract) {
      return {
        code: 'ACTIVE_CONTRACTS_EXIST',
        message: 'Cannot disconnect wallet while you have active contracts with locked escrow funds.',
      };
    }

    await userRepository.updateUser(userId, { wallet_address: '' });
    return {
      success: true,
      message: 'Wallet disconnected successfully.',
    };
  } catch (error: unknown) {
    logger.error('Failed to disconnect wallet', { error: getErrorMessage(error), userId });
    return {
      code: 'UPDATE_FAILED',
      message: 'Failed to disconnect wallet.',
    };
  }
}






