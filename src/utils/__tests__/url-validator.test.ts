/**
 * URL Validator Tests
 * Tests for OWASP A10:2021 - Server-Side Request Forgery (SSRF)
 */

import {
  validateUrl,
  validateSessionId,
  sanitizeSessionId,
  isHostnameSsrfAllowed,
  compareIpv6,
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
        const result = validateUrl('https://xyz.appwrite.co/rest/v1/');
        expect(result.valid).toBe(true);
      });

      it('should allow Google Gemini API', () => {
        const result = validateUrl('https://generativelanguage.googleapis.com/v1/models');
        expect(result.valid).toBe(true);
      });

      it('should allow public IPs not in blocked ranges', () => {
        const result = validateUrl('http://1.1.1.1/api');
        expect(result.valid).toBe(true);
        expect(result.sanitizedUrl).toBe('http://1.1.1.1/api');
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

    describe('Invalid URLs - IPv6 (SSRF)', () => {
      it('should block IPv6 loopback (::1)', () => {
        const result = validateUrl('http://[::1]:8080/admin');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should block IPv6 link-local range (fe80::)', () => {
        const result = validateUrl('http://[fe80::1]/admin');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      });

      it('should block the upper bound of IPv6 link-local (febf:ffff:...)', () => {
        const result = validateUrl('http://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/admin');
        expect(result.valid).toBe(false);
      });

      it('should allow public IPv6 addresses not in blocked ranges', () => {
        const result = validateUrl('http://[2606:4700:4700::1111]/dns');
        expect(result.valid).toBe(true);
        expect(result.sanitizedUrl).toBe('http://[2606:4700:4700::1111]/dns');
      });

      it('should block malformed IPv6 literals (fail-closed)', () => {
        expect(validateUrl('http://[1:2:3:4:5:6:7:8::9]/admin').valid).toBe(false);
        expect(validateUrl('http://[gggg::1]/admin').valid).toBe(false);
      });

      it('should block IPv4 addresses with out-of-range octets (fail-closed)', () => {
        expect(validateUrl('http://999.1.1.1/admin').valid).toBe(false);
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

  describe('isHostnameSsrfAllowed', () => {
    it('should reject blocked hostnames', () => {
      expect(isHostnameSsrfAllowed('localhost')).toBe(false);
      expect(isHostnameSsrfAllowed('127.0.0.1')).toBe(false);
      expect(isHostnameSsrfAllowed('[::1]')).toBe(false);
    });

    it('should allow whitelisted hostnames', () => {
      expect(isHostnameSsrfAllowed('api.didit.me')).toBe(true);
      expect(isHostnameSsrfAllowed('evil.com')).toBe(false);
    });

    it('should fail-closed on malformed IP literals (SSRF hardening)', () => {
      // IPv6 with `::` but more than 8 groups (hits the `missing < 0` guard).
      expect(isHostnameSsrfAllowed('1:2:3:4:5:6:7:8::9')).toBe(false);
      // IPv6 with non-hex groups (hits the NaN/range guard).
      expect(isHostnameSsrfAllowed('gggg::1')).toBe(false);
      expect(isHostnameSsrfAllowed('gggg:1:1:1:1:1:1:1:1')).toBe(false);
      // IPv4 with an out-of-range octet (hits the octet range guard).
      expect(isHostnameSsrfAllowed('999.1.1.1')).toBe(false);
      // IPv4 with the wrong number of octets.
      expect(isHostnameSsrfAllowed('1.2.3')).toBe(false);
    });
  });

  describe('compareIpv6', () => {
    it('should compare IPv6 groups correctly', () => {
      expect(compareIpv6([0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 2])).toBe(-1);
      expect(compareIpv6([0, 0, 0, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 0, 1])).toBe(1);
      expect(compareIpv6([0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 1])).toBe(0);
    });

    it('should handle sparse arrays with nullish coalescing', () => {
      const sparseA = [0, 0, 0, 0, 0, 0, 0] as any;
      sparseA[7] = undefined;
      const sparseB = [0, 0, 0, 0, 0, 0, 0] as any;
      sparseB[7] = undefined;
      expect(compareIpv6(sparseA, sparseB)).toBe(0);

      const sparseC = [0, 0, 0, 0, 0, 0, 0] as any;
      sparseC[7] = 1;
      expect(compareIpv6(sparseA, sparseC)).toBe(-1);
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
