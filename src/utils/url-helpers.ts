/**
 * URL Helper Utilities
 * Centralizes URL construction for frontend redirects and links
 */

/**
 * Gets the frontend base URL from environment variables with fallbacks.
 * Eliminates duplicated URL resolution logic across auth flows.
 *
 * Priority: custom URL > PUBLIC_URL > FRONTEND_URL > localhost default
 *
 * @param customUrl - Optional override URL
 * @returns Normalized frontend base URL (trailing slash removed)
 */
export function getFrontendBaseUrl(customUrl?: string): string {
  const baseUrl =
    customUrl ??
    process.env.PUBLIC_URL ??
    process.env.FRONTEND_URL ??
    'http://localhost:5173';

  return baseUrl.replace(/\/+$/, '');
}

/**
 * Constructs a full frontend URL path.
 * Handles path concatenation safely without double slashes.
 *
 * @param path - The path to append (should start with /)
 * @returns Full URL with path
 */
export function getFrontendUrl(path: string = ''): string {
  const base = getFrontendBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return base + normalizedPath;
}

/**
 * Email verification URL builder.
 *
 * @param token - Verification token
 * @returns Full verification URL
 */
export function getEmailVerificationUrl(token: string): string {
  return getFrontendUrl('/verify-email?token=' + token);
}

/**
 * Password reset URL builder.
 *
 * @param token - Reset token
 * @returns Full password reset URL
 */
export function getPasswordResetUrl(token: string): string {
  return getFrontendUrl('/reset-password?token=' + token);
}

/**
 * Login URL with optional redirect.
 *
 * @param redirectTo - Optional redirect path after login
 * @returns Full login URL
 */
export function getLoginUrl(redirectTo?: string): string {
  if (redirectTo) {
    return getFrontendUrl('/login?redirect=' + redirectTo);
  }
  return getFrontendUrl('/login');
}

/**
 * Dashboard URL builder.
 *
 * @param role - User role to determine dashboard path
 * @returns Full dashboard URL
 */
export function getDashboardUrl(role: 'freelancer' | 'employer' | 'admin'): string {
  return getFrontendUrl('/dashboard/' + role);
}
