/**
 * URL Validator Tests
 * Tests for OWASP A10:2021 - Server-Side Request Forgery (SSRF)
 */

import {
  validateUrl,
  validateSessionId,
  sanitizeSessionId,
  addAllowedDomain,
  isAllowedDomain,
} from '../url-validator.js';

describe('URL Validator - OWASP A10 SSRF Protection', () => {
  describe('validateUrl', () => {
    describe('Valid URLs', () => {
      it('should allow HTTPS URLs to whitelisted domains', () => {
        const result = validateUrl('https://api.didit.me/v2/session/');
        expect(result.valid).toBe(true);
        expect(result.sanitizedUrl).toBeDefined();
      });

      it('should allow HTTP URLs to whitelisted domains', () => {
        const result = validateUrl('http://api.didit.me/v2/session/');
        expect(result.valid).toBe(true);
      });

      it('should allow subdomains of whitelisted domains', () => {
        const result = validateUrl('https://xyz.supabase.co/rest/v1/');
        expect(result.valid).toBe(true);
      });

      it('should allow Google Gemini API', () => {
        const result = validateUrl('https://generativelanguage.googleapis.com/v1/models');
        expect(result.valid).toBe(true);
      });
    });

    describe('Invalid URLs - Protocol', () => {
      it('should reject non-HTTP/HTTPS protocols', () => {
        const result = validateUrl('ftp://example.com/file');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('HTTP or HTTPS protocol');
      });

      it('should reject file:// protocol', () => {
        const result = validateUrl('file:///etc/passwd');
        expect(result.valid).toBe(false);
      });

      it('should reject URLs without protocol', () => {
        const result = validateUrl('example.com/path');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('HTTP or HTTPS');
      });
    });

    describe('Invalid URLs - Internal IPs (SSRF)', () => {
      it('should block localhost', () => {
        const result = validateUrl('http://localhost:8080/admin');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should block 127.0.0.1 (loopback)', () => {
        const result = validateUrl('http://127.0.0.1:8080/admin');
        expect(result.valid).toBe(false);
      });

      it('should block 127.x.x.x range', () => {
        const result = validateUrl('http://127.0.0.2:8080/');
        expect(result.valid).toBe(false);
      });

      it('should block 10.0.0.0/8 (private Class A)', () => {
        const result = validateUrl('http://10.0.0.1/internal');
        expect(result.valid).toBe(false);
      });

      it('should block 172.16.0.0/12 (private Class B)', () => {
        const result = validateUrl('http://172.16.0.1/internal');
        expect(result.valid).toBe(false);
        const result2 = validateUrl('http://172.31.255.255/internal');
        expect(result2.valid).toBe(false);
      });

      it('should block 192.168.0.0/16 (private Class C)', () => {
        const result = validateUrl('http://192.168.1.1/router');
        expect(result.valid).toBe(false);
      });

      it('should block 169.254.0.0/16 (link-local)', () => {
        const result = validateUrl('http://169.254.169.254/metadata');
        expect(result.valid).toBe(false);
      });

      it('should block AWS/GCP metadata endpoint', () => {
        const result = validateUrl('http://169.254.169.254/latest/meta-data/');
        expect(result.valid).toBe(false);
      });

      it('should block metadata.google.internal', () => {
        const result = validateUrl('http://metadata.google.internal/computeMetadata/v1/');
        expect(result.valid).toBe(false);
      });
    });

    describe('Invalid URLs - Suspicious Patterns', () => {
      it('should reject URLs with @ symbol (credential injection)', () => {
        const result = validateUrl('http://attacker.com@internal.server/');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should reject URLs with path traversal', () => {
        const result = validateUrl('http://api.didit.me/../../../etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('suspicious patterns');
      });
    });

    describe('Invalid URLs - Not Whitelisted', () => {
      it('should reject non-whitelisted domains', () => {
        const result = validateUrl('https://evil.com/api');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should reject similar but different domains', () => {
        const result = validateUrl('https://api.didit.me.evil.com/');
        expect(result.valid).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        const result = validateUrl('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should handle null', () => {
        const result = validateUrl(null as any);
        expect(result.valid).toBe(false);
      });

      it('should handle malformed URLs', () => {
        const result = validateUrl('http://[invalid');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL');
      });
    });
  });

  describe('validateSessionId', () => {
    it('should accept valid alphanumeric session IDs', () => {
      expect(validateSessionId('abc123xyz')).toBe(true);
      expect(validateSessionId('SESSION-123-456')).toBe(true);
      expect(validateSessionId('session_id_123')).toBe(true);
    });

    it('should reject session IDs with special characters', () => {
      expect(validateSessionId('session/../admin')).toBe(false);
      expect(validateSessionId('session@evil.com')).toBe(false);
      expect(validateSessionId('session;DROP TABLE')).toBe(false);
      expect(validateSessionId('session<script>')).toBe(false);
    });

    it('should reject too short session IDs', () => {
      expect(validateSessionId('abc')).toBe(false);
      expect(validateSessionId('1234567')).toBe(false);
    });

    it('should reject too long session IDs', () => {
      const longId = 'a'.repeat(129);
      expect(validateSessionId(longId)).toBe(false);
    });

    it('should reject empty or null session IDs', () => {
      expect(validateSessionId('')).toBe(false);
      expect(validateSessionId(null as any)).toBe(false);
      expect(validateSessionId(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeSessionId', () => {
    it('should remove special characters', () => {
      const result = sanitizeSessionId('session-123_abc');
      expect(result).toBe('session-123_abc');
    });

    it('should remove path traversal attempts', () => {
      const result = sanitizeSessionId('session/../admin');
      expect(result).toBe('sessionadmin');
    });

    it('should remove SQL injection attempts', () => {
      const result = sanitizeSessionId("session';DROP TABLE users--");
      expect(result).toBe('sessionDROPTABLEusers--');
    });

    it('should throw on empty result', () => {
      expect(() => sanitizeSessionId('!@#$%^&*()')).toThrow('no valid characters');
    });

    it('should throw on invalid input', () => {
      expect(() => sanitizeSessionId('')).toThrow('non-empty string');
      expect(() => sanitizeSessionId(null as any)).toThrow('non-empty string');
    });

    it('should throw on invalid sanitized result', () => {
      expect(() => sanitizeSessionId('abc')).toThrow('format is invalid');
    });
  });

  describe('Domain Management', () => {
    it('should check if domain is allowed', () => {
      expect(isAllowedDomain('didit.me')).toBe(true);
      expect(isAllowedDomain('supabase.co')).toBe(true);
      expect(isAllowedDomain('evil.com')).toBe(false);
    });

    it('should add new allowed domain', () => {
      addAllowedDomain('trusted-api.com');
      expect(isAllowedDomain('trusted-api.com')).toBe(true);
    });

    it('should handle case-insensitive domains', () => {
      addAllowedDomain('EXAMPLE.COM');
      expect(isAllowedDomain('example.com')).toBe(true);
      expect(isAllowedDomain('EXAMPLE.COM')).toBe(true);
    });
  });

  describe('Real-world SSRF Attack Scenarios', () => {
    it('should prevent AWS metadata access', () => {
      const attacks = [
        'http://169.254.169.254/latest/meta-data/',
        'http://169.254.169.254/latest/user-data/',
        'http://169.254.169.254/latest/dynamic/instance-identity/',
      ];
      attacks.forEach(url => {
        const result = validateUrl(url);
        expect(result.valid).toBe(false);
      });
    });

    it('should prevent internal network scanning', () => {
      const attacks = [
        'http://192.168.1.1/admin',
        'http://10.0.0.1:8080/internal',
        'http://172.16.0.1/api',
      ];
      attacks.forEach(url => {
        const result = validateUrl(url);
        expect(result.valid).toBe(false);
      });
    });

    it('should prevent localhost bypass attempts', () => {
      const attacks = [
        'http://localhost/admin',
        'http://127.0.0.1/admin',
        'http://127.0.0.2/admin',
        'http://0.0.0.0/admin',
      ];
      attacks.forEach(url => {
        const result = validateUrl(url);
        expect(result.valid).toBe(false);
      });
    });

    it('should prevent URL manipulation with session IDs', () => {
      // Simulate Didit API call with malicious session ID
      const maliciousIds = [
        '../../../etc/passwd',
        '; DROP TABLE sessions--',
      ];
      
      // These should be rejected by validateSessionId before sanitization
      maliciousIds.forEach(id => {
        expect(validateSessionId(id)).toBe(false);
      });
    });
  });
});
