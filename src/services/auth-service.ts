import { Provider, createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { getSupabaseClient, getSupabaseServiceClient } from '../config/supabase.js';
import { UserRole } from '../models/user.js';
import {
  RegisterInput,
  LoginInput,
  AuthResult,
  AuthError,
} from './auth-types.js';

// Password strength requirements
const PASSWORD_MIN_LENGTH = 8;

// ============================================================
// MFA Session Management
// Stores pending MFA sessions so we don't leak real access tokens
// before MFA verification is complete.
// ============================================================
const MFA_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

type PendingMfaSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  factorId: string;
  expiresAt: number;
};

const pendingMfaSessions = new Map<string, PendingMfaSession>();

function generateMfaSessionId(): string {
  return `mfa_${randomUUID()}`;
}

/** Clean up expired MFA sessions periodically */
function cleanupExpiredMfaSessions(): void {
  const now = Date.now();
  for (const [key, session] of pendingMfaSessions) {
    if (session.expiresAt < now) {
      pendingMfaSessions.delete(key);
    }
  }
}

// Clean up expired sessions every 60 seconds
setInterval(cleanupExpiredMfaSessions, 60_000);

/**
 * Retrieve and consume a pending MFA session after successful MFA verification.
 * Returns null if the session doesn't exist or has expired.
 */
export function consumeMfaSession(mfaSessionId: string): PendingMfaSession | null {
  const session = getPendingMfaSession(mfaSessionId);
  if (!session) return null;
  pendingMfaSessions.delete(mfaSessionId);
  return session;
}

export function getPendingMfaSession(mfaSessionId: string): PendingMfaSession | null {
  const session = pendingMfaSessions.get(mfaSessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    pendingMfaSessions.delete(mfaSessionId);
    return null;
  }
  return session;
}

export function deletePendingMfaSession(mfaSessionId: string): void {
  pendingMfaSessions.delete(mfaSessionId);
}

/**
 * Creates a per-request Supabase client for auth-mutating operations.
 * Avoids the shared singleton which causes session cross-contamination.
 */
function createPerRequestClient() {
  if (process.env['NODE_ENV'] === 'test') {
    return getSupabaseClient();
  }

  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

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

export async function createAuthResult(user: UserEntity, accessToken: string, refreshToken: string): Promise<AuthResult> {
  // Get KYC status
  const { getKycVerificationByUserId } = await import('../repositories/didit-kyc-repository.js');
  const kycVerification = await getKycVerificationByUserId(user.id);
  
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      kycStatus: kycVerification?.status as any,
      createdAt: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Register a new user with Supabase Auth (email/password)
 * Sends confirmation email automatically
 */
export async function register(input: RegisterInput): Promise<AuthResult | AuthError> {
  const supabase = createPerRequestClient();
  const normalizedEmail = input.email.toLowerCase().trim();

  // Check for duplicate email in public.users first
  const emailExists = await userRepository.emailExists(normalizedEmail);
  if (emailExists) {
    return {
      code: 'DUPLICATE_EMAIL',
      message: 'An account with this email already exists',
    };
  }

  // Register with Supabase Auth - this sends confirmation email
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        role: input.role,
        wallet_address: input.walletAddress ?? '',
      },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      return {
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  if (!data.user) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Failed to create user',
    };
  }

  // Wait briefly for trigger to create public.users record
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get the user from public.users (created by trigger)
  const publicUser = await userRepository.getUserById(data.user.id);

  if (!publicUser) {
    // Trigger might not have fired yet, create manually
    const createdUser = await userRepository.createUser({
      id: data.user.id,
      email: normalizedEmail,
      password_hash: '',
      role: input.role,
      wallet_address: input.walletAddress ?? '',
      name: '',
    });

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
        walletAddress: createdUser.wallet_address,
        createdAt: createdUser.created_at,
      },
      accessToken: data.session?.access_token ?? '',
      refreshToken: data.session?.refresh_token ?? '',
    };
  }

  return {
    user: {
      id: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
      walletAddress: publicUser.wallet_address,
      createdAt: publicUser.created_at,
    },
    accessToken: data.session?.access_token ?? '',
    refreshToken: data.session?.refresh_token ?? '',
  };
}

/**
 * Login with Supabase Auth (email/password)
 * Only works if email is verified
 */
export async function login(input: LoginInput): Promise<AuthResult | AuthError> {
  const supabase = createPerRequestClient();
  const normalizedEmail = input.email.toLowerCase().trim();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: input.password,
  });

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      return {
        code: 'INVALID_CREDENTIALS',
        message: 'Please verify your email before logging in',
      };
    }
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }

  if (!data.user || !data.session) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    };
  }

  // Check if user has MFA enabled
  const mfaClient = process.env['NODE_ENV'] === 'test'
    ? supabase
    : createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    });
  
  const { data: factorsData } = await mfaClient.auth.mfa.listFactors();
  const hasVerifiedMFA = factorsData?.all?.some(f => f.status === 'verified') || false;

  if (hasVerifiedMFA) {
    // User has MFA enabled - store session temporarily and return opaque MFA session ID
    // Do NOT return the real access token - it would allow bypassing MFA
    const mfaSessionId = generateMfaSessionId();
    pendingMfaSessions.set(mfaSessionId, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId: data.user.id,
      factorId: factorsData?.all?.find(f => f.status === 'verified')?.id ?? '',
      expiresAt: Date.now() + MFA_SESSION_TTL_MS,
    });

    return {
      code: 'MFA_REQUIRED',
      message: 'MFA verification required',
      mfaRequired: true,
      mfaSessionId,  // Opaque identifier, NOT the real access token
      factorId: factorsData?.all?.find(f => f.status === 'verified')?.id,
    } as any;
  }

  // Get user from public.users
  const publicUser = await userRepository.getUserById(data.user.id);

  if (!publicUser) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'User profile not found',
    };
  }

  return await createAuthResult(publicUser, data.session.access_token, data.session.refresh_token);
}

/**
 * Refresh tokens using Supabase Auth
 */
export async function refreshTokens(refreshToken: string): Promise<AuthResult | AuthError> {
  const supabase = createPerRequestClient();

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session || !data.user) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired refresh token',
    };
  }

  const publicUser = await userRepository.getUserById(data.user.id);

  if (!publicUser) {
    return {
      code: 'INVALID_TOKEN',
      message: 'User not found',
    };
  }

  return await createAuthResult(publicUser, data.session.access_token, data.session.refresh_token);
}

/**
 * Validate Supabase access token
 */
export async function validateToken(accessToken: string): Promise<{ id: string; userId: string; email: string; role: UserRole } | AuthError> {
  // Create a fresh Supabase client for token validation
  const supabase = createClient(config.supabase.url, config.supabase.anonKey);

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    };
  }

  const publicUser = await userRepository.getUserById(user.id);

  if (!publicUser) {
    return {
      code: 'INVALID_TOKEN',
      message: 'User not found',
    };
  }

  return {
    id: publicUser.id,
    userId: publicUser.id,
    email: publicUser.email,
    role: publicUser.role,
  };
}

/**
 * Login with existing Supabase session (for OAuth users)
 */
export async function loginWithSupabase(accessToken: string): Promise<AuthResult | AuthError> {
  // Use a per-request client to avoid session cross-contamination
  const supabase = createPerRequestClient();

  // OAuth login flow - validate token and look up user

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user || !user.email) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  const publicUser = await userRepository.getUserByEmail(user.email.toLowerCase());

  if (!publicUser) {
    return {
      code: 'AUTH_REQUIRE_REGISTRATION',
      message: 'User registration required. Please select a role.',
    };
  }

  // Check if user has MFA enabled
  const mfaClient = process.env['NODE_ENV'] === 'test'
    ? supabase
    : createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  
  const { data: factorsData } = await mfaClient.auth.mfa.listFactors();
  const hasVerifiedMFA = factorsData?.all?.some(f => f.status === 'verified') || false;

  console.log('[OAuth] MFA check:', { hasVerifiedMFA });

  if (hasVerifiedMFA) {
    // User has MFA enabled - store session and return opaque MFA session ID
    // Do NOT return the real access token - it would allow bypassing MFA
    const mfaSessionId = generateMfaSessionId();
    pendingMfaSessions.set(mfaSessionId, {
      accessToken,
      refreshToken: '', // OAuth flow doesn't have refresh token at this point
      userId: publicUser.id,
      factorId: factorsData?.all?.find(f => f.status === 'verified')?.id ?? '',
      expiresAt: Date.now() + MFA_SESSION_TTL_MS,
    });

    return {
      code: 'MFA_REQUIRED',
      message: 'MFA verification required',
      mfaRequired: true,
      mfaSessionId,  // Opaque identifier, NOT the real access token
      factorId: factorsData?.all?.find(f => f.status === 'verified')?.id,
    } as any;
  }

  // For OAuth flow, the accessToken IS the token we have - use it directly
  // Don't call getSession() on a per-request client that has no session state
  return await createAuthResult(
    publicUser,
    accessToken,
    '' // OAuth implicit flow - refresh token obtained via exchangeCodeForSession separately
  );
}

/**
 * Get OAuth URL for provider
 */
export async function getOAuthUrl(provider: Provider): Promise<string> {
  const supabase = getSupabaseClient();

  const supabaseProvider = provider === 'linkedin' ? 'linkedin_oidc' : provider;

  // Redirect to frontend callback page instead of backend
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const redirectUrl = `${frontendUrl}/oauth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: supabaseProvider as Provider,
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw new Error(`Failed to get OAuth URL: ${error.message}`);
  }

  return data.url;
}

/**
 * Exchange OAuth code for session
 */
export async function exchangeCodeForSession(code: string): Promise<{ accessToken: string; refreshToken: string } | AuthError> {
  const supabase = createPerRequestClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return {
      code: 'AUTH_EXCHANGE_FAILED',
      message: error?.message || 'Failed to exchange code for session',
    };
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/**
 * Register OAuth user with role selection
 */
export async function registerWithSupabase(
  accessToken: string,
  role: UserRole,
  walletAddress: string
): Promise<AuthResult | AuthError> {
  const supabase = createPerRequestClient();

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user || !user.email) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  console.log('[OAuth] registerWithSupabase - Got user from auth.users:', {
    id: user.id,
  });

  const normalizedEmail = user.email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await userRepository.getUserByEmail(normalizedEmail);
  if (existingUser) {
    return await createAuthResult(existingUser, accessToken, '');
  }

  console.log('[OAuth] registerWithSupabase - Creating new user in public.users for role:', role);

  // Update user metadata in Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      role,
      wallet_address: walletAddress,
    },
  });

  if (updateError) {
    console.error('[OAuth] registerWithSupabase - Failed to update user metadata:', updateError);
  }

  // Create user in public.users
  const newUser = await userRepository.createUser({
    id: user.id,
    email: normalizedEmail,
    password_hash: '',
    role,
    wallet_address: walletAddress,
    name: '',
  });

  console.log('[OAuth] registerWithSupabase - Successfully created user:', {
    id: newUser.id,
    role: newUser.role
  });

  return await createAuthResult(newUser, accessToken, '');
}

/**
 * Resend confirmation email
 */
export async function resendConfirmationEmail(email: string): Promise<{ success: boolean } | AuthError> {
  const supabase = createPerRequestClient();

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.toLowerCase().trim(),
  });

  if (error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return { success: true };
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean } | AuthError> {
  const supabase = createPerRequestClient();

  const redirectUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL}/reset-password`
    : `http://localhost:${config.server.port}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
    redirectTo: redirectUrl,
  });

  if (error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return { success: true };
}

/**
 * Update password (after reset)
 * Uses a per-request client with the access token to avoid corrupting shared state.
 */
export async function updatePassword(accessToken: string, newPassword: string): Promise<{ success: boolean } | AuthError> {
  // Create a fresh client with the user's access token in Authorization header
  // This avoids the old pattern of setSession({refresh_token: ''}) on the shared singleton
  const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  // Invalidate all existing sessions after password change (security best practice)
  try {
    const serviceClient = getSupabaseServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await serviceClient.auth.admin.signOut(user.id, 'global');
    }
  } catch (revokeError) {
    // Log but don't fail - password was already changed successfully
    console.error('[Auth] Failed to revoke sessions after password change:', revokeError);
  }

  return { success: true };
}

export function isAuthError(result: any): result is AuthError {
  return result && typeof result === 'object' && 'code' in result && 'message' in result && !('user' in result) && !('success' in result);
}

/**
 * Logout user and invalidate session
 * Accepts the user's access token to properly revoke THEIR session,
 * not just the server's shared client session.
 */
export async function logout(accessToken?: string): Promise<{ success: boolean } | AuthError> {
  if (accessToken) {
    // Create a client with the user's token and sign them out properly
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { error } = await supabase.auth.signOut({ scope: 'global' });

    if (error) {
      return {
        code: 'INTERNAL_ERROR',
        message: error.message,
      };
    }
  } else {
    // Fallback: if no token provided, attempt sign out on service client
    // This is less effective but maintains backward compatibility
    const serviceClient = getSupabaseServiceClient();
    // Without knowing the user ID, we can only do a local sign out
    await serviceClient.auth.signOut({ scope: 'local' });
  }

  return { success: true };
}

/**
 * Enroll MFA for user
 */
export async function enrollMFA(accessToken: string): Promise<{ qrCode: string; secret: string; factorId: string } | AuthError> {
  try {
    // Create a fresh Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    // Get user email first
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      console.error('[MFA] Failed to get user:', userError);
      return {
        code: 'INVALID_TOKEN',
        message: 'Failed to get user information',
      };
    }

    // Check for existing factors and clean up unverified ones
    const { data: existingFactors, error: listError } = await supabase.auth.mfa.listFactors();
    
    if (listError) {
      console.error('[MFA] Failed to list existing factors:', listError);
    } else if (existingFactors?.all && existingFactors.all.length > 0) {
      console.log('[MFA] Found existing factors, count:', existingFactors.all.length);
      
      // Remove any unverified factors to allow re-enrollment
      // Check the 'all' array since unverified factors appear there, not in 'totp'
      for (const factor of existingFactors.all) {
        if (factor.status === 'unverified') {
          console.log('[MFA] Removing unverified factor:', factor.id);
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollError) {
            console.error('[MFA] Failed to remove unverified factor:', unenrollError);
          } else {
            console.log('[MFA] Successfully removed unverified factor');
          }
        }
      }
      
      // Wait a bit for Supabase to process the deletion
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
      issuer: 'FreelanceXchain',
    });

    if (error) {
      console.error('[MFA] Enrollment failed:', error);
      return {
        code: error.status === 401 ? 'INVALID_TOKEN' : 'MFA_ENROLLMENT_FAILED',
        message: error.message || 'Failed to enroll MFA',
      };
    }

    if (!data?.totp?.qr_code || !data?.totp?.secret || !data?.id) {
      return {
        code: 'MFA_ENROLLMENT_FAILED',
        message: 'Invalid enrollment response',
      };
    }

    // Supabase returns qr_code as an SVG, but we need the otpauth:// URL
    // Construct the otpauth URL manually from the secret
    const otpauthUrl = `otpauth://totp/FreelanceXchain:${encodeURIComponent(user.email)}?secret=${data.totp.secret}&issuer=FreelanceXchain&algorithm=SHA1&digits=6&period=30`;
    
    // FIXED: Never log TOTP secrets or OTPAuth URLs - they contain the MFA secret key
    console.log('[MFA] Enrollment successful for user');
    
    return {
      qrCode: otpauthUrl,
      secret: data.totp.secret,
      factorId: data.id,
    };
  } catch (err: any) {
    console.error('[MFA] Exception in enrollMFA:', err);
    return {
      code: 'MFA_ENROLLMENT_FAILED',
      message: err.message || 'Failed to enroll MFA',
    };
  }
}

/**
 * Verify MFA enrollment
 */
export async function verifyMFAEnrollment(
  accessToken: string,
  factorId: string,
  code: string
): Promise<{ success: boolean } | AuthError> {
  try {
    // Create a fresh Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    // First create a challenge
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError || !challengeData?.id) {
      console.error('[MFA] Challenge creation failed:', challengeError);
      return {
        code: challengeError?.status === 401 ? 'INVALID_TOKEN' : 'MFA_VERIFICATION_FAILED',
        message: challengeError?.message || 'Failed to create challenge',
      };
    }

    // Then verify the code
    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      console.error('[MFA] Verification failed:', verifyError);
      return {
        code: 'MFA_VERIFICATION_FAILED',
        message: verifyError.message || 'Invalid verification code',
      };
    }

    console.log('[MFA] Enrollment verification successful');
    return { success: true };
  } catch (err: any) {
    console.error('[MFA] Exception in verifyMFAEnrollment:', err);
    return {
      code: 'MFA_VERIFICATION_FAILED',
      message: err.message || 'Failed to verify MFA',
    };
  }
}

/**
 * Challenge MFA (during login)
 */
export async function challengeMFA(accessToken: string, factorId: string): Promise<{ challengeId: string } | AuthError> {
  try {
    // Create a fresh Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data, error } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (error || !data?.id) {
      console.error('[MFA] Challenge creation failed:', error);
      return {
        code: error?.status === 401 ? 'INVALID_TOKEN' : 'MFA_CHALLENGE_FAILED',
        message: error?.message || 'Failed to create MFA challenge',
      };
    }

    console.log('[MFA] Challenge created successfully');
    return { challengeId: data.id };
  } catch (err: any) {
    console.error('[MFA] Exception in challengeMFA:', err);
    return {
      code: 'MFA_CHALLENGE_FAILED',
      message: err.message || 'Failed to create MFA challenge',
    };
  }
}

/**
 * Verify MFA challenge (during login)
 */
export async function verifyMFAChallenge(
  accessToken: string,
  factorId: string,
  challengeId: string,
  code: string
): Promise<{ success: boolean } | AuthError> {
  try {
    // Create a fresh Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      console.error('[MFA] Challenge verification failed:', error);
      return {
        code: error.status === 401 ? 'INVALID_TOKEN' : 'MFA_VERIFICATION_FAILED',
        message: error.message || 'Invalid verification code',
      };
    }

    console.log('[MFA] Challenge verification successful');
    return { success: true };
  } catch (err: any) {
    console.error('[MFA] Exception in verifyMFAChallenge:', err);
    return {
      code: 'MFA_VERIFICATION_FAILED',
      message: err.message || 'Failed to verify MFA challenge',
    };
  }
}

/**
 * Get MFA factors for user
 */
export async function getMFAFactors(accessToken: string): Promise<{ factors: any[] } | AuthError> {
  try {
    // Create a fresh Supabase client with the access token in headers
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    // List the factors
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      console.error('[MFA] Failed to list factors:', error);
      return {
        code: error.status === 401 ? 'INVALID_TOKEN' : 'MFA_LIST_FAILED',
        message: error.message || 'Failed to list MFA factors',
      };
    }

    console.log('[MFA] Factors retrieved successfully:', data);
    
    // Return only verified TOTP factors from the 'all' array
    // Unverified factors appear in 'all' but not in 'totp'
    const verifiedFactors = data?.all?.filter(f => f.factor_type === 'totp' && f.status === 'verified') || [];
    return { factors: verifiedFactors };
  } catch (err: any) {
    console.error('[MFA] Exception in getMFAFactors:', err);
    return {
      code: 'MFA_LIST_FAILED',
      message: err.message || 'Failed to list MFA factors',
    };
  }
}

/**
 * Disable MFA factor — requires TOTP code verification before unenrolling
 */
export async function disableMFA(accessToken: string, factorId: string, totpCode?: string): Promise<{ success: boolean } | AuthError> {
  try {
    // Create a fresh Supabase client
    const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    // Require TOTP code re-authentication before disabling MFA
    if (!totpCode) {
      return {
        code: 'MFA_CODE_REQUIRED',
        message: 'A valid TOTP code is required to disable MFA',
      };
    }

    // Create a challenge and verify the TOTP code first
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      return {
        code: 'MFA_CHALLENGE_FAILED',
        message: challengeError.message || 'Failed to create MFA challenge',
      };
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode,
    });

    if (verifyError) {
      return {
        code: 'MFA_VERIFY_FAILED',
        message: 'Invalid TOTP code. Cannot disable MFA without valid re-authentication.',
      };
    }

    // TOTP verified — now safe to unenroll the factor
    const { data, error } = await supabase.auth.mfa.unenroll({
      factorId,
    });

    if (error) {
      return {
        code: error.status === 401 ? 'INVALID_TOKEN' : 'MFA_DISABLE_FAILED',
        message: error.message || 'Failed to disable MFA',
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      code: 'MFA_DISABLE_FAILED',
      message: err.message || 'Failed to disable MFA',
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

  // Admins are automatically considered KYC approved (exempt from KYC requirement)
  if (user.role === 'admin') {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
      kycStatus: 'approved', // Admins bypass KYC requirement
      createdAt: user.created_at,
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
    kycStatus: kycVerification?.status as any,
    createdAt: user.created_at,
  };
}
