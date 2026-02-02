import { Provider } from '@supabase/supabase-js';
import { userRepository, UserEntity } from '../repositories/user-repository.js';
import { config } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { UserRole } from '../models/user.js';
import {
  RegisterInput,
  LoginInput,
  AuthResult,
  AuthError,
} from './auth-types.js';

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

async function createAuthResult(user: UserEntity, accessToken: string, refreshToken: string): Promise<AuthResult> {
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
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();

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
export async function validateToken(accessToken: string): Promise<{ userId: string; email: string; role: UserRole } | AuthError> {
  const supabase = getSupabaseClient();

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
    userId: publicUser.id,
    email: publicUser.email,
    role: publicUser.role,
  };
}

/**
 * Login with existing Supabase session (for OAuth users)
 */
export async function loginWithSupabase(accessToken: string): Promise<AuthResult | AuthError> {
  const supabase = getSupabaseClient();

  console.log('[OAuth] loginWithSupabase - Starting with access token');

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user || !user.email) {
    console.log('[OAuth] loginWithSupabase - Invalid token or no user:', error?.message);
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  console.log('[OAuth] loginWithSupabase - Got user from auth.users:', {
    id: user.id,
    email: user.email,
    provider: user.app_metadata?.provider
  });

  const publicUser = await userRepository.getUserByEmail(user.email.toLowerCase());

  if (!publicUser) {
    console.log('[OAuth] loginWithSupabase - User NOT found in public.users - returning AUTH_REQUIRE_REGISTRATION');
    return {
      code: 'AUTH_REQUIRE_REGISTRATION',
      message: 'User registration required. Please select a role.',
    };
  }

  console.log('[OAuth] loginWithSupabase - User found in public.users:', {
    id: publicUser.id,
    email: publicUser.email,
    role: publicUser.role
  });

  // Get current session for tokens
  const { data: sessionData } = await supabase.auth.getSession();

  return await createAuthResult(
    publicUser,
    accessToken,
    sessionData?.session?.refresh_token ?? ''
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
  const supabase = getSupabaseClient();

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
  const supabase = getSupabaseClient();

  console.log('[OAuth] registerWithSupabase - Starting registration with role:', role);

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user || !user.email) {
    console.log('[OAuth] registerWithSupabase - Invalid token or no user:', error?.message);
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  console.log('[OAuth] registerWithSupabase - Got user from auth.users:', {
    id: user.id,
    email: user.email
  });

  const normalizedEmail = user.email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await userRepository.getUserByEmail(normalizedEmail);
  if (existingUser) {
    console.log('[OAuth] registerWithSupabase - User already exists in public.users, returning existing user');
    const { data: sessionData } = await supabase.auth.getSession();
    return await createAuthResult(existingUser, accessToken, sessionData?.session?.refresh_token ?? '');
  }

  console.log('[OAuth] registerWithSupabase - Creating new user in public.users');

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
    email: newUser.email,
    role: newUser.role
  });

  const { data: sessionData } = await supabase.auth.getSession();

  return await createAuthResult(newUser, accessToken, sessionData?.session?.refresh_token ?? '');
}

/**
 * Resend confirmation email
 */
export async function resendConfirmationEmail(email: string): Promise<{ success: boolean } | AuthError> {
  const supabase = getSupabaseClient();

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
  const supabase = getSupabaseClient();

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
 */
export async function updatePassword(accessToken: string, newPassword: string): Promise<{ success: boolean } | AuthError> {
  const supabase = getSupabaseClient();

  // Set the session first
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: '' });

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return { success: true };
}

export function isAuthError(result: AuthResult | AuthError | AuthResult['user'] | { success: boolean }): result is AuthError {
  return 'code' in result;
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
