import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  parseUserAgent,
  recordFailedLogin,
  checkAccountLockout,
  resetFailedLogins,
  clearAllLoginSecurityRecords,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  ATTEMPT_WINDOW_MS,
} from '../../utils/login-security.js';

describe('Login Security & Account Lockout Utilities', () => {
  beforeEach(() => {
    clearAllLoginSecurityRecords();
  });

  describe('parseUserAgent', () => {
    it('should return fallback values for null or undefined User-Agent', () => {
      const resultNull = parseUserAgent(null);
      expect(resultNull.browser).toBe('Web Browser');
      expect(resultNull.os).toBe('Unknown OS');
      expect(resultNull.device).toBe('Unknown Device');

      const resultUndefined = parseUserAgent(undefined);
      expect(resultUndefined.browser).toBe('Web Browser');
      expect(resultUndefined.os).toBe('Unknown OS');
    });

    it('should accurately detect Windows and Chrome', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
      const result = parseUserAgent(ua);
      expect(result.os).toBe('Windows 10/11');
      expect(result.device).toBe('Windows PC');
      expect(result.browser).toBe('Google Chrome');
      expect(result.summary).toBe('Google Chrome on Windows PC');
    });

    it('should accurately detect macOS and Safari', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15';
      const result = parseUserAgent(ua);
      expect(result.os).toBe('macOS');
      expect(result.device).toBe('Mac');
      expect(result.browser).toBe('Safari');
    });

    it('should accurately detect iPhone and iOS', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1';
      const result = parseUserAgent(ua);
      expect(result.os).toBe('iOS');
      expect(result.device).toBe('iPhone');
    });

    it('should accurately detect Android and Firefox', () => {
      const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:122.0) Gecko/122.0 Firefox/122.0';
      const result = parseUserAgent(ua);
      expect(result.os).toBe('Android');
      expect(result.device).toBe('Mobile Device');
      expect(result.browser).toBe('Mozilla Firefox');
    });

    it('should accurately detect Microsoft Edge', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.92';
      const result = parseUserAgent(ua);
      expect(result.browser).toBe('Microsoft Edge');
    });

    it.each([
      ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1', 'iPadOS', 'iPad', 'Safari'],
      ['Mozilla/5.0 (Windows NT 6.1; Win64; x64) Firefox/120.0', 'Windows', 'Windows PC', 'Mozilla Firefox'],
      ['Mozilla/5.0 (X11; CrOS x86_64 15699.66.0) Chrome/120.0 Safari/537.36', 'ChromeOS', 'Chromebook', 'Google Chrome'],
      ['Mozilla/5.0 (X11; Linux x86_64) OPR/106.0 Chrome/121.0', 'Linux', 'Linux PC', 'Opera'],
    ])('detects platform and browser variants for %s', (ua, os, device, browser) => {
      expect(parseUserAgent(ua)).toMatchObject({ os, device, browser });
    });

    it('keeps generic labels for an unknown or Chromium-only agent', () => {
      expect(parseUserAgent('CustomAgent/1.0')).toMatchObject({
        os: 'Unknown OS', device: 'Desktop', browser: 'Web Browser',
      });
      expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chromium/120.0 Chrome/120.0'))
        .toMatchObject({ os: 'Linux', browser: 'Web Browser' });
    });
  });

  describe('Account Lockout Enforcement', () => {
    const testEmail = 'hacker-target@example.com';

    it('should not lock an account on initial failed logins', () => {
      const r1 = recordFailedLogin(testEmail);
      expect(r1.isLocked).toBe(false);
      expect(r1.remainingAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);

      const check = checkAccountLockout(testEmail);
      expect(check.isLocked).toBe(false);
    });

    it('should track remaining attempts correctly up to 5 attempts', () => {
      for (let i = 1; i <= 4; i++) {
        const res = recordFailedLogin(testEmail);
        expect(res.isLocked).toBe(false);
        expect(res.remainingAttempts).toBe(MAX_FAILED_ATTEMPTS - i);
      }
    });

    it('should lock the account on the 5th failed attempt', () => {
      for (let i = 1; i <= 4; i++) {
        recordFailedLogin(testEmail);
      }

      const fifthAttempt = recordFailedLogin(testEmail);
      expect(fifthAttempt.isLocked).toBe(true);
      expect(fifthAttempt.remainingAttempts).toBe(0);
      expect(fifthAttempt.lockedUntil).toBeDefined();

      const lockout = checkAccountLockout(testEmail);
      expect(lockout.isLocked).toBe(true);
      expect(lockout.remainingMinutes).toBeGreaterThanOrEqual(14);
      expect(lockout.remainingMinutes).toBeLessThanOrEqual(15);
    });

    it('should reset failed login tracking when resetFailedLogins is called', () => {
      for (let i = 1; i <= 4; i++) {
        recordFailedLogin(testEmail);
      }

      resetFailedLogins(testEmail);

      const check = checkAccountLockout(testEmail);
      expect(check.isLocked).toBe(false);

      // Next failure should be treated as attempt #1
      const nextFail = recordFailedLogin(testEmail);
      expect(nextFail.remainingAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
    });

    it('should treat emails as case-insensitive and trimmed', () => {
      recordFailedLogin('  User@Example.COM ');
      recordFailedLogin('user@example.com');
      recordFailedLogin('USER@EXAMPLE.COM');
      recordFailedLogin('user@example.com');

      const lockedRes = recordFailedLogin('User@example.com');
      expect(lockedRes.isLocked).toBe(true);

      const check = checkAccountLockout('USER@EXAMPLE.COM');
      expect(check.isLocked).toBe(true);
    });

    it('expires a lockout after its duration and starts a fresh attempt record', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) recordFailedLogin(testEmail);

      jest.advanceTimersByTime(LOCKOUT_DURATION_MS + 1);

      expect(checkAccountLockout(testEmail)).toEqual({ isLocked: false });
      expect(recordFailedLogin(testEmail)).toEqual({
        isLocked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
      });
      jest.useRealTimers();
    });

    it('starts a fresh count when the failed-attempt window expires', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      recordFailedLogin(testEmail);
      recordFailedLogin(testEmail);
      jest.advanceTimersByTime(ATTEMPT_WINDOW_MS + 1);

      expect(recordFailedLogin(testEmail)).toEqual({
        isLocked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
      });
      jest.useRealTimers();
    });

    it('treats empty account identifiers as a no-op', () => {
      expect(checkAccountLockout('')).toEqual({ isLocked: false });
      expect(recordFailedLogin('')).toEqual({
        isLocked: false,
        remainingAttempts: MAX_FAILED_ATTEMPTS,
      });
      expect(() => resetFailedLogins('')).not.toThrow();
    });
  });
});
