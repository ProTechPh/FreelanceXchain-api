import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getFrontendBaseUrl,
  getFrontendUrl,
  getEmailVerificationUrl,
  getPasswordResetUrl,
  getLoginUrl,
  getDashboardUrl,
} from '../../utils/url-helpers.js';

describe('url-helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PUBLIC_URL;
    delete process.env.FRONTEND_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getFrontendBaseUrl', () => {
    it('returns customUrl when provided and strips trailing slashes', () => {
      expect(getFrontendBaseUrl('https://example.com/')).toBe('https://example.com');
      expect(getFrontendBaseUrl('https://example.com///')).toBe('https://example.com');
      expect(getFrontendBaseUrl('https://example.com')).toBe('https://example.com');
    });

    it('falls back to PUBLIC_URL when customUrl is omitted', () => {
      process.env.PUBLIC_URL = 'https://public.example.com/';
      expect(getFrontendBaseUrl()).toBe('https://public.example.com');
    });

    it('falls back to FRONTEND_URL when PUBLIC_URL is missing', () => {
      process.env.FRONTEND_URL = 'https://frontend.example.com/';
      expect(getFrontendBaseUrl()).toBe('https://frontend.example.com');
    });

    it('defaults to http://localhost:5173 when no env vars are set', () => {
      expect(getFrontendBaseUrl()).toBe('http://localhost:5173');
    });
  });

  describe('getFrontendUrl', () => {
    it('appends path starting with slash', () => {
      expect(getFrontendUrl('/test')).toBe('http://localhost:5173/test');
    });

    it('appends path without leading slash safely', () => {
      expect(getFrontendUrl('test')).toBe('http://localhost:5173/test');
    });

    it('handles default empty path', () => {
      expect(getFrontendUrl()).toBe('http://localhost:5173/');
    });
  });

  describe('getEmailVerificationUrl', () => {
    it('constructs correct email verification url with token', () => {
      expect(getEmailVerificationUrl('abc-123')).toBe(
        'http://localhost:5173/verify-email?token=abc-123'
      );
    });
  });

  describe('getPasswordResetUrl', () => {
    it('constructs correct password reset url with token', () => {
      expect(getPasswordResetUrl('reset-456')).toBe(
        'http://localhost:5173/reset-password?token=reset-456'
      );
    });
  });

  describe('getLoginUrl', () => {
    it('constructs login url without redirect', () => {
      expect(getLoginUrl()).toBe('http://localhost:5173/login');
    });

    it('constructs login url with redirect parameter', () => {
      expect(getLoginUrl('/dashboard/projects')).toBe(
        'http://localhost:5173/login?redirect=/dashboard/projects'
      );
    });
  });

  describe('getDashboardUrl', () => {
    it('constructs dashboard url for freelancer', () => {
      expect(getDashboardUrl('freelancer')).toBe('http://localhost:5173/dashboard/freelancer');
    });

    it('constructs dashboard url for employer', () => {
      expect(getDashboardUrl('employer')).toBe('http://localhost:5173/dashboard/employer');
    });

    it('constructs dashboard url for admin', () => {
      expect(getDashboardUrl('admin')).toBe('http://localhost:5173/dashboard/admin');
    });
  });
});
