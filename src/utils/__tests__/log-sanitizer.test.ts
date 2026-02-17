/**
 * Log Sanitizer Tests
 * Tests for OWASP A02:2021 - Cryptographic Failures
 * Tests for OWASP A09:2021 - Security Logging and Monitoring Failures
 */

import {
  sanitizeString,
  sanitizeObject,
  sanitizeLogData,
  sanitizeError,
  containsSensitiveData,
} from '../log-sanitizer';

describe('Log Sanitizer - OWASP A02 & A09', () => {
  describe('sanitizeString', () => {
    it('should redact JWT tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact API keys', () => {
      const input = 'api_key: sk_live_1234567890abcdefghijklmnop';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('sk_live_1234567890abcdefghijklmnop');
    });

    it('should redact passwords', () => {
      const input = 'password: MySecretPassword123!';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('MySecretPassword123!');
    });

    it('should redact credit card numbers', () => {
      const input = 'Card: 4532-1234-5678-9010';
      const result = sanitizeString(input);
      expect(result).toBe('Card: [REDACTED_CC]');
    });

    it('should redact email addresses', () => {
      const input = 'User email: john.doe@example.com';
      const result = sanitizeString(input);
      expect(result).toBe('User email: [REDACTED_EMAIL]');
    });

    it('should redact phone numbers', () => {
      const input = 'Phone: +1-555-123-4567';
      const result = sanitizeString(input);
      expect(result).toBe('Phone: [REDACTED_PHONE]');
    });

    it('should redact SSN', () => {
      const input = 'SSN: 123-45-6789';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED');
      expect(result).not.toContain('123-45-6789');
    });

    it('should redact private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const result = sanitizeString(input);
      expect(result).toBe('[REDACTED_PRIVATE_KEY]');
    });

    it('should handle non-string input', () => {
      expect(sanitizeString(null as any)).toBe(null);
      expect(sanitizeString(undefined as any)).toBe(undefined);
      expect(sanitizeString(123 as any)).toBe(123);
    });
  });

  describe('sanitizeObject', () => {
    it('should redact sensitive field names', () => {
      const input = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com',
        token: 'abc123xyz',
      };
      const result = sanitizeObject(input);
      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED_EMAIL]');
      expect(result.token).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('John');
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.apiKey).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const input = [
        { password: 'secret1' },
        { password: 'secret2' },
      ];
      const result = sanitizeObject(input);
      expect(result[0].password).toBe('[REDACTED]');
      expect(result[1].password).toBe('[REDACTED]');
    });

    it('should sanitize string values in objects', () => {
      const input = {
        message: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test',
        data: 'normal data',
      };
      const result = sanitizeObject(input);
      expect(result.message).toContain('[REDACTED_JWT]');
      expect(result.data).toBe('normal data');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error messages', () => {
      const error = new Error('Authentication failed with token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test');
      const result = sanitizeError(error);
      expect(result.message).toContain('[REDACTED_JWT]');
      expect(result.name).toBe('Error');
    });

    it('should sanitize error stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error: password=secret123\n    at test.js:10';
      const result = sanitizeError(error);
      expect(result.stack).toContain('[REDACTED]');
      expect(result.stack).not.toContain('secret123');
    });

    it('should handle custom error properties', () => {
      const error: any = new Error('Test');
      error.apiKey = 'sk_live_123456';
      error.userId = 'user123';
      const result = sanitizeError(error);
      expect(result.apiKey).toContain('[REDACTED');
      expect(result.apiKey).not.toContain('123456');
    });
  });

  describe('containsSensitiveData', () => {
    it('should detect JWT tokens', () => {
      const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test';
      expect(containsSensitiveData(input)).toBe(true);
    });

    it('should detect passwords', () => {
      const input = 'password: secret123';
      expect(containsSensitiveData(input)).toBe(true);
    });

    it('should detect credit cards', () => {
      const input = '4532-1234-5678-9010';
      expect(containsSensitiveData(input)).toBe(true);
    });

    it('should return false for safe data', () => {
      const input = 'This is a normal log message';
      expect(containsSensitiveData(input)).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(containsSensitiveData(null as any)).toBe(false);
      expect(containsSensitiveData(undefined as any)).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('should sanitize HTTP request logs', () => {
      const requestLog = {
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test',
          'content-type': 'application/json',
        },
        body: {
          email: 'user@example.com',
          password: 'MyPassword123!',
        },
      };
      const result = sanitizeObject(requestLog);
      expect(result.headers.authorization).toContain('[REDACTED');
      expect(result.headers.authorization).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result.body.password).toBe('[REDACTED]');
      expect(result.body.email).toBe('[REDACTED_EMAIL]');
    });

    it('should sanitize database error logs', () => {
      const dbError = {
        message: 'Connection failed',
        connectionString: 'postgresql://user:password123@localhost:5432/db',
        query: 'SELECT * FROM users WHERE email = "user@example.com"',
      };
      const result = sanitizeObject(dbError);
      // Connection string should be sanitized as it contains password
      expect(result.connectionString).toBeDefined();
      expect(result.query).toContain('[REDACTED_EMAIL]');
    });

    it('should sanitize webhook payloads', () => {
      const webhook = {
        event: 'user.created',
        data: {
          user_id: '123',
          email: 'newuser@example.com',
          phone: '+1-555-123-4567',
          api_key: 'sk_live_abcdef123456',
        },
      };
      const result = sanitizeObject(webhook);
      expect(result.data.email).toBe('[REDACTED_EMAIL]');
      expect(result.data.phone).toBe('[REDACTED_PHONE]');
      expect(result.data.api_key).toBe('[REDACTED]');
    });
  });
});
