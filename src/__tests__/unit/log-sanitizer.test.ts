import { describe, it, expect } from '@jest/globals';
import {
  sanitizeString,
  sanitizeObject,
  sanitizeLogData,
  sanitizeError,
  containsSensitiveData,
} from '../../utils/log-sanitizer.js';

describe('log-sanitizer', () => {
  describe('sanitizeString', () => {
    it('should redact JWT bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123';
      const result = sanitizeString(input);
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(result).toContain('[REDACTED');
    });

    it('should redact email addresses', () => {
      const result = sanitizeString('User: john.doe@example.com logged in');
      expect(result).toContain('[REDACTED_EMAIL]');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact credit card numbers', () => {
      const result = sanitizeString('Card: 4532-1234-5678-9010');
      expect(result).toContain('[REDACTED_CC]');
    });

    it('should return non-sensitive strings unchanged', () => {
      const input = 'Normal log message with no sensitive data';
      expect(sanitizeString(input)).toBe(input);
    });

    it('should return empty string unchanged', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should redact API keys', () => {
      const result = sanitizeString('api_key: abcdefghijklmnopqrstuvwxyz1234');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz1234');
    });

    it('should redact passwords', () => {
      const result = sanitizeString('password: secret123');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secret123');
    });

    it('should redact authorization headers', () => {
      const result = sanitizeString('authorization: Basic dXNlcjpwYXNzd29yZA==');
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('dXNlcjpwYXNzd29yZA==');
    });

    it('should redact phone numbers', () => {
      const result = sanitizeString('Contact: +1-234-567-8901');
      expect(result).toContain('[REDACTED_PHONE]');
      expect(result).not.toContain('+1-234-567-8901');
    });

    it('should redact private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED_PRIVATE_KEY]');
      expect(result).not.toContain('MIIEpAIBAAKCAQEA');
    });
  });

  describe('sanitizeObject', () => {
    it('should redact sensitive field names', () => {
      const obj = { password: 'secret', username: 'john' };
      const result = sanitizeObject(obj);
      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('john');
    });

    it('should return null when passed null', () => {
      const result = sanitizeObject(null);
      expect(result).toBeNull();
    });

    it('should sanitize arrays by mapping elements', () => {
      const arr = [{ token: 'abc123' }, { name: 'test' }];
      const result = sanitizeObject(arr);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].token).toBe('[REDACTED]');
      expect(result[1].name).toBe('test');
    });

    it('should recursively sanitize nested objects', () => {
      const obj = { user: { password: 'secret', email: 'a@b.com' } };
      const result = sanitizeObject(obj);
      expect(result.user.password).toBe('[REDACTED]');
    });

    it('should pass through non-string, non-object values unchanged', () => {
      const obj = { count: 42, flag: true };
      const result = sanitizeObject(obj);
      expect(result.count).toBe(42);
      expect(result.flag).toBe(true);
    });

    it('should sanitize string values within objects', () => {
      const obj = { message: 'Token: Bearer abc.def.ghi' };
      const result = sanitizeObject(obj);
      expect(result.message).toContain('[REDACTED');
    });
  });

  describe('sanitizeLogData', () => {
    it('should sanitize when data is a string', () => {
      const result = sanitizeLogData('password: secret');
      expect(result).toContain('[REDACTED]');
    });

    it('should sanitize when data is an object', () => {
      const result = sanitizeLogData({ token: 'abc', name: 'test' });
      expect(result.token).toBe('[REDACTED]');
      expect(result.name).toBe('test');
    });

    it('should pass through null (object branch)', () => {
      const result = sanitizeLogData(null);
      expect(result).toBeNull();
    });

    it('should return numbers unchanged (neither string nor object)', () => {
      const result = sanitizeLogData(42);
      expect(result).toBe(42);
    });

    it('should return booleans unchanged', () => {
      expect(sanitizeLogData(true)).toBe(true);
      expect(sanitizeLogData(false)).toBe(false);
    });

    it('should return undefined unchanged', () => {
      expect(sanitizeLogData(undefined)).toBeUndefined();
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error message', () => {
      const err = new Error('Login failed for user@example.com');
      const result = sanitizeError(err);
      expect(result.name).toBe('Error');
      expect(result.message).toContain('[REDACTED_EMAIL]');
    });

    it('should include sanitized stack trace when present', () => {
      const err = new Error('test');
      const result = sanitizeError(err);
      expect(result.stack).toBeDefined();
    });

    it('should redact sensitive extra properties on error', () => {
      const err = Object.assign(new Error('oops'), { token: 'secret-token', code: 'ERR_001' });
      const result = sanitizeError(err);
      expect(result.token).toBe('[REDACTED]');
      expect(result.code).toBe('ERR_001');
    });
  });

  describe('containsSensitiveData', () => {
    it('should return true for strings with bearer tokens', () => {
      expect(containsSensitiveData('Bearer eyJhbGc.eyJzdWIi.sig')).toBe(true);
    });

    it('should return true for strings with emails', () => {
      expect(containsSensitiveData('user@example.com')).toBe(true);
    });

    it('should return true for credit card numbers', () => {
      expect(containsSensitiveData('4532 1234 5678 9010')).toBe(true);
    });

    it('should return false for non-sensitive strings', () => {
      expect(containsSensitiveData('hello world')).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(containsSensitiveData('')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(containsSensitiveData(null as any)).toBe(false);
    });
  });
});
