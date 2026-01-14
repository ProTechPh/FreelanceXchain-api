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
        name: input.name ?? '',
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
      name: input.name ?? '',
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

  return createAuthResult(publicUser, data.session.access_token, data.session.refresh_token);
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

  return createAuthResult(publicUser, data.session.access_token, data.session.refresh_token);
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

  // Get current session for tokens
  const { data: sessionData } = await supabase.auth.getSession();

  return createAuthResult(
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

  const redirectUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL}/api/auth/callback`
    : `http://localhost:${config.server.port}/api/auth/callback`;

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
  walletAddress: string,
  name: string
): Promise<AuthResult | AuthError> {
  const supabase = getSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user || !user.email) {
    return {
      code: 'INVALID_TOKEN',
      message: 'Invalid Supabase token',
    };
  }

  const normalizedEmail = user.email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await userRepository.getUserByEmail(normalizedEmail);
  if (existingUser) {
    const { data: sessionData } = await supabase.auth.getSession();
    return createAuthResult(existingUser, accessToken, sessionData?.session?.refresh_token ?? '');
  }

  // Update user metadata in Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      role,
      wallet_address: walletAddress,
      name,
    },
  });

  if (updateError) {
    console.error('Failed to update user metadata:', updateError);
  }

  // Create user in public.users
  const newUser = await userRepository.createUser({
    id: user.id,
    email: normalizedEmail,
    password_hash: '',
    role,
    wallet_address: walletAddress,
    name,
  });

  const { data: sessionData } = await supabase.auth.getSession();

  return createAuthResult(newUser, accessToken, sessionData?.session?.refresh_token ?? '');
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

export function isAuthError(result: AuthResult | AuthError | { success: boolean }): result is AuthError {
  return 'code' in result;
}
