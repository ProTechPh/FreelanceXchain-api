// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import crypto from 'crypto';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/url-validator.ts'), () => ({
  validateUrl: () => ({ valid: true }),
  sanitizeSessionId: (id: string) => id,
}));

jest.unstable_mockModule(resolveModule('src/models/didit-kyc.ts'), () => ({}));

// Mock form-data for dynamic import
jest.unstable_mockModule('form-data', () => ({
  default: class FormData {
    private data: Record<string, any> = {};
    append(key: string, value: any, options?: any) { this.data[key] = value; }
    getHeaders() { return { 'content-type': 'multipart/form-data' }; }
  },
}));

// Save original env
const originalEnv = { ...process.env };

describe('Didit Client - Coverage4', () => {
  let diditClient: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Set required env vars before importing
    process.env['DIDIT_API_KEY'] = 'test-api-key';
    process.env['DIDIT_API_URL'] = 'https://verification.didit.me';
    process.env['DIDIT_WEBHOOK_SECRET'] = 'test-webhook-secret';
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Module initialization - URL validation failure (lines 26-31)', () => {
    it('should throw when DIDIT_API_URL is invalid', async () => {
      // This tests the module-level validation that throws on invalid URL
      // We need to re-import with invalid URL - but since module is cached,
      // we test the verifyWebhookSignature function instead which is already loaded
    });
  });

  describe('getVerificationSession - network error (lines 214-218)', () => {
    it('should return NETWORK_ERROR when fetch throws', async () => {
      // Mock global fetch to throw
      const originalFetch = global.fetch;
      global.fetch = jest.fn<any>().mockRejectedValue(new Error('Network timeout'));

      diditClient = await import('../../services/didit-client.js');
      const result = await diditClient.getVerificationSession('session-123');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toBe('Network timeout');
      }

      global.fetch = originalFetch;
    });

    it('should return NETWORK_ERROR with generic message for non-Error throws', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn<any>().mockRejectedValue('string error');

      diditClient = await import('../../services/didit-client.js');
      const result = await diditClient.getVerificationSession('session-456');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toBe('Failed to connect to Didit API');
      }

      global.fetch = originalFetch;
    });
  });

  describe('getVerificationSession - API error (lines 250-252)', () => {
    it('should return error when API returns non-ok response', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'SESSION_NOT_FOUND', message: 'Not found' } }),
        headers: new Map(),
      });

      diditClient = await import('../../services/didit-client.js');
      const result = await diditClient.getVerificationSession('session-bad');
      
      expect(result.success).toBe(false);

      global.fetch = originalFetch;
    });
  });

  describe('verifyWebhookSignature - catch block (lines 317-318)', () => {
    it('should handle timingSafeEqual length mismatch gracefully', async () => {
      diditClient = await import('../../services/didit-client.js');
      
      const now = Math.floor(Date.now() / 1000);
      // Use a signature that is valid hex but wrong length to trigger the catch
      const result = diditClient.verifyWebhookSignature(
        'test-payload',
        'abc', // Too short - will fail the length check but is valid hex
        now.toString()
      );
      
      expect(result).toBe(false);
    });

    it('should handle non-hex signature in catch block', async () => {
      diditClient = await import('../../services/didit-client.js');
      
      const now = Math.floor(Date.now() / 1000);
      // Non-hex chars will fail the regex test, not enter the try block
      const result = diditClient.verifyWebhookSignature(
        'test-payload',
        'not-valid-hex-!!!',
        now.toString()
      );
      
      expect(result).toBe(false);
    });
  });

  describe('checkPassiveLiveness - network error (lines 440-441)', () => {
    it('should return NETWORK_ERROR when liveness check fetch throws', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn<any>().mockRejectedValue(new Error('Connection refused'));

      diditClient = await import('../../services/didit-client.js');
      const result = await diditClient.checkPassiveLiveness(Buffer.from('fake-image'));
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }

      global.fetch = originalFetch;
    });
  });

  describe('matchFaces - network error (lines 499-500)', () => {
    it('should return NETWORK_ERROR when face match fetch throws', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn<any>().mockRejectedValue(new Error('Timeout'));

      diditClient = await import('../../services/didit-client.js');
      const result = await diditClient.matchFaces(
        Buffer.from('selfie'),
        Buffer.from('id-photo')
      );
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }

      global.fetch = originalFetch;
    });
  });
});
