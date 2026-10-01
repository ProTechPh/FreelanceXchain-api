import { config } from '../config/env.js';

function checkLockoutDisabled(): boolean {
  if (process.env['NODE_ENV'] === 'test') {
    return false;
  }
  const allowInProduction =
    process.env['DISABLE_RATE_LIMIT_IN_PRODUCTION'] === 'true' ||
    process.env['ALLOW_INSECURE_DISABLE_RATE_LIMITER'] === 'true' ||
    process.env['DISABLE_RATE_LIMITER']?.toLowerCase() === 'force';
  const isProduction = process.env['NODE_ENV'] === 'production' || config?.server?.nodeEnv === 'production';
  if (isProduction && !allowInProduction) {
    return false;
  }
  if (config?.server?.disableRateLimiter) {
    return true;
  }
  const raw = process.env['DISABLE_RATE_LIMITER'] ?? process.env['DISABLE_RATE_LIMIT'];
  if (raw !== undefined) {
    return raw.toLowerCase() === 'true' || raw === '1' || raw.toLowerCase() === 'force';
  }
  return false;
}

/**
 * Login Security & Account Lockout Utilities
 *
 * Implements brute-force defense (temporary account lockout after repeated
 * failed login attempts) and client device/browser parsing for new sign-in security alerts.
 */

export interface ClientDeviceInfo {
  browser: string;
  os: string;
  device: string;
  summary: string;
}

export interface FailedLoginRecord {
  count: number;
  firstFailedAt: number;
  lockedUntil?: number;
}

const failedAttemptsMap = new Map<string, FailedLoginRecord>();

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

/**
 * Parse browser, operating system, and device summary from User-Agent string.
 */
export function parseUserAgent(userAgent?: string | null): ClientDeviceInfo {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      browser: 'Web Browser',
      os: 'Unknown OS',
      device: 'Unknown Device',
      summary: 'Web Browser on Unknown Device',
    };
  }

  const ua = userAgent;

  // Detect OS
  let os = 'Unknown OS';
  let device = 'Desktop';

  if (/iPhone/i.test(ua)) {
    os = 'iOS';
    device = 'iPhone';
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    device = 'iPad';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    device = 'Mobile Device';
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10/11';
    device = 'Windows PC';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    device = 'Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    device = 'Mac';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    device = 'Chromebook';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    device = 'Linux PC';
  }

  // Detect Browser
  let browser = 'Web Browser';
  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = 'Google Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Mozilla Firefox';
  }

  return {
    browser,
    os,
    device,
    summary: `${browser} on ${device}`,
  };
}

/**
 * Check if an email account is currently locked due to repeated failed logins.
 */
export function checkAccountLockout(email: string): { isLocked: boolean; remainingMinutes?: number } {
  if (checkLockoutDisabled()) return { isLocked: false };
  if (!email) return { isLocked: false };
  const normalized = email.toLowerCase().trim();
  const record = failedAttemptsMap.get(normalized);

  if (!record || !record.lockedUntil) {
    return { isLocked: false };
  }

  const now = Date.now();
  if (now < record.lockedUntil) {
    const remainingMinutes = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
    return { isLocked: true, remainingMinutes };
  }

  // Lockout expired: remove the lockout status
  failedAttemptsMap.delete(normalized);
  return { isLocked: false };
}

/**
 * Record a failed login attempt for an email address.
 * Locks the account for LOCKOUT_DURATION_MS if attempts reach MAX_FAILED_ATTEMPTS.
 */
export function recordFailedLogin(email: string): {
  isLocked: boolean;
  remainingAttempts: number;
  lockedUntil?: number;
} {
  if (checkLockoutDisabled()) return { isLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS };
  if (!email) return { isLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS };
  const normalized = email.toLowerCase().trim();
  const now = Date.now();
  let record = failedAttemptsMap.get(normalized);

  // Expire previous attempt window
  if (!record || now - record.firstFailedAt > ATTEMPT_WINDOW_MS) {
    record = { count: 1, firstFailedAt: now };
    failedAttemptsMap.set(normalized, record);
    return { isLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - 1 };
  }

  record.count += 1;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { isLocked: true, remainingAttempts: 0, lockedUntil: record.lockedUntil };
  }

  return { isLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - record.count };
}

/**
 * Reset failed login attempts on successful authentication.
 */
export function resetFailedLogins(email: string): void {
  if (!email) return;
  const normalized = email.toLowerCase().trim();
  failedAttemptsMap.delete(normalized);
}

/**
 * Clear all login security records (used for test teardown).
 */
export function clearAllLoginSecurityRecords(): void {
  failedAttemptsMap.clear();
}
