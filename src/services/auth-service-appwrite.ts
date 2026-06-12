/**
 * Appwrite Authentication Service
 * Handles user authentication using Appwrite Auth API
 * Migrated from Appwrite Auth
 */

import { ID, Account, Models, OAuthProvider, AuthenticatorType } from 'node-appwrite';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { createUserClient, users } from '../config/appwrite.js';
import { UserRole } from '../models/user.js';
import { logger } from '../config/logger.js';
import {
  RegisterInput,
  LoginInput,
  AuthResult,
  AuthError,
  AuthResponse,
} from './auth-types.js';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

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
    // Compensate: if Appwrite user was created but session failed, delete the Appwrite user
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

    // Check if MFA is required by calling account.get()
    // Appwrite throws user_more_factors_required if MFA is enabled
    try {
      await account.get();
    } catch (mfaError: any) {
      if (mfaError.type === 'user_more_factors_required') {
        // MFA is required — return the session token so frontend can complete MFA
        return {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required',
          mfaRequired: true,
          accessToken: session.secret,
        };
      }
      // Other error — rethrow
      throw mfaError;
    }

    // Get user from database
    const publicUser = await userRepository.getUserByEmail(normalizedEmail);

    if (!publicUser) {
      return {
        code: 'INVALID_CREDENTIALS',
        message: 'User profile not found',
      };
    }

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
 * Enroll user in MFA
 * Appwrite supports TOTP as an authenticator type
 * Email and phone are challenge-based factors
 * Returns recovery codes and TOTP secret/URI on enrollment
 */
export async function enrollMFA(accessToken: string, factorType: 'totp' | 'email' = 'totp'): Promise<{ success: boolean; recoveryCodes?: string[]; secret?: string; uri?: string } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    if (factorType === 'totp') {
      // TOTP enrollment returns secret and URI for QR code
      const result = await account.createMFAAuthenticator({ type: 'totp' as any });
      
      // Generate recovery codes (only once per account)
      let recoveryCodes: string[] = [];
      try {
        const codes = await account.createMfaRecoveryCodes();
        recoveryCodes = codes.recoveryCodes;
      } catch {
        // Recovery codes may already exist — that's okay
      }

      return { 
        success: true, 
        recoveryCodes,
        secret: (result as any).secret,
        uri: (result as any).uri,
      };
    }

    // Email is challenge-based, no enrollment needed
    // They're verified through challenges during login
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
 * Verify MFA enrollment and enable MFA on the account
 */
export async function verifyMFAEnrollment(accessToken: string, factorType: 'totp' | 'email', code: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Only TOTP needs authenticator verification
    if (factorType === 'totp') {
      await account.updateMFAAuthenticator({
        type: 'totp' as any,
        otp: code
      });
    }
    
    // Enable MFA on the account (Appwrite official step)
    await account.updateMFA(true);
    
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
export async function getMFAFactors(accessToken: string): Promise<{ factors: { id: string; type: string }[] } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);
    
    const factors = await account.listMFAFactors();
    const result: { id: string; type: string }[] = [];
    
    if (factors.totp) result.push({ id: 'totp', type: 'totp' });
    if (factors.email) result.push({ id: 'email', type: 'email' });
    
    return { factors: result };
  } catch (error: any) {
    return {
      code: 'MFA_LIST_FAILED',
      message: error.message,
    };
  }
}

/**
 * Disable MFA
 */
export async function disableMFA(accessToken: string, factorType: 'totp' | 'email', _otpCode?: string): Promise<{ success: boolean } | AuthError> {
  try {
    const userClient = createUserClient(accessToken);
    const account = new Account(userClient);

    // Appwrite only supports TOTP as an authenticator type
    // Email is challenge-based, not authenticator-based
    if (factorType === 'totp') {
      await account.deleteMFAAuthenticator({
        type: AuthenticatorType.Totp
      });
    }
    
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
    
    // Check if user exists in database
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
