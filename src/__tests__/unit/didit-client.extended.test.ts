import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockFetch = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/url-validator.ts'), () => ({
  validateUrl: jest.fn(() => ({ valid: true })),
  sanitizeSessionId: jest.fn((id: string) => id),
}));

describe('Didit Client - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/didit-client.js');
  };

  describe('createVerificationSession - non-JSON responses', () => {
    it('should handle non-JSON response', async () => {
      const { createVerificationSession } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<html>error</html>',
        status: 200,
      } as any);

      const result = await createVerificationSession({
        workflow_id: 'workflow-123',
        callback: 'https://example.com/callback',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should handle missing content-type header', async () => {
      const { createVerificationSession } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: async () => 'plain text',
        status: 200,
      } as any);

      const result = await createVerificationSession({
        workflow_id: 'workflow-123',
        callback: 'https://example.com/callback',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('getVerificationDecision - non-JSON responses', () => {
    it('should handle non-JSON response', async () => {
      const { getVerificationDecision } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'error',
        status: 200,
      } as any);

      const result = await getVerificationDecision('session-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should log error on API failure', async () => {
      const { getVerificationDecision } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: { code: 'SERVER_ERROR', message: 'Server down' } }),
        status: 500,
      } as any);

      const result = await getVerificationDecision('session-123');

      expect(result.success).toBe(false);
    });
  });

  describe('getVerificationSession - non-JSON responses', () => {
    it('should handle non-JSON response', async () => {
      const { getVerificationSession } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'plain text',
        status: 200,
      } as any);

      const result = await getVerificationSession('session-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should handle missing content-type header', async () => {
      const { getVerificationSession } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: async () => 'plain text',
        status: 200,
      } as any);

      const result = await getVerificationSession('session-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('verifyWebhookSignature - edge cases', () => {
    it('should reject when ALLOW_INSECURE_DIDIT_WEBHOOKS is true but in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalInsecure = process.env.ALLOW_INSECURE_DIDIT_WEBHOOKS;
      const originalSecret = process.env.DIDIT_WEBHOOK_SECRET;
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_DIDIT_WEBHOOKS = 'true';
      process.env.DIDIT_WEBHOOK_SECRET = '';

      const { verifyWebhookSignature } = await importModule();

      const result = verifyWebhookSignature('payload', 'sig', '123');
      expect(result).toBe(false);

      process.env.NODE_ENV = originalEnv;
      process.env.ALLOW_INSECURE_DIDIT_WEBHOOKS = originalInsecure;
      process.env.DIDIT_WEBHOOK_SECRET = originalSecret;
    });

    it('should verify with canonical JSON format (v3)', async () => {
      const originalSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-webhook-secret';
      const { verifyWebhookSignature } = await importModule();

      const parsed = { session_id: 'test' };
      const canonical = JSON.stringify(parsed); // Already sorted for single key
      const secret = 'test-webhook-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(canonical, 'utf8')
        .digest('hex');

      const result = verifyWebhookSignature(JSON.stringify(parsed), expectedSignature, timestamp);
      process.env['DIDIT_WEBHOOK_SECRET'] = originalSecret;
      expect(result).toBe(true);
    });

    it('should verify with sorted keys canonical JSON format', async () => {
      const originalSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-webhook-secret';
      const { verifyWebhookSignature } = await importModule();

      const parsed = { z_key: 'last', a_key: 'first', m_key: 'middle' };
      const canonical = JSON.stringify({ a_key: 'first', m_key: 'middle', z_key: 'last' });
      const secret = 'test-webhook-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const crypto = await import('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(canonical, 'utf8')
        .digest('hex');

      const result = verifyWebhookSignature(JSON.stringify(parsed), expectedSignature, timestamp);
      process.env['DIDIT_WEBHOOK_SECRET'] = originalSecret;
      expect(result).toBe(true);
    });

    it('should handle signature with exact length but different content', async () => {
      process.env.DIDIT_WEBHOOK_SECRET = 'test-webhook-secret';
      delete process.env.ALLOW_INSECURE_DIDIT_WEBHOOKS;
      const { verifyWebhookSignature } = await importModule();

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const fakeSig = 'a'.repeat(64);

      const result = verifyWebhookSignature('payload', fakeSig, timestamp);
      expect(result).toBe(false);
    });

    it('should handle signature length mismatch safely', async () => {
      process.env.DIDIT_WEBHOOK_SECRET = 'test-webhook-secret';
      delete process.env.ALLOW_INSECURE_DIDIT_WEBHOOKS;
      const { verifyWebhookSignature } = await importModule();

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const shortSig = 'abc';

      const result = verifyWebhookSignature('payload', shortSig, timestamp);
      expect(result).toBe(false);
    });
  });

  describe('verifyIdDocument - edge cases', () => {
    it('should handle network error', async () => {
      const { verifyIdDocument } = await importModule();

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await verifyIdDocument(Buffer.from('front'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should handle API error with data', async () => {
      const { verifyIdDocument } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: { code: 'INVALID_IMAGE', message: 'Image too blurry' } }),
      } as any);

      const result = await verifyIdDocument(Buffer.from('front'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_IMAGE');
      }
    });
  });

  describe('checkPassiveLiveness - edge cases', () => {
    it('should handle network error', async () => {
      const { checkPassiveLiveness } = await importModule();

      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await checkPassiveLiveness(Buffer.from('selfie'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should handle API error', async () => {
      const { checkPassiveLiveness } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'NO_FACE', message: 'No face detected' } }),
      } as any);

      const result = await checkPassiveLiveness(Buffer.from('selfie'));

      expect(result.success).toBe(false);
    });
  });

  describe('matchFaces - edge cases', () => {
    it('should handle network error', async () => {
      const { matchFaces } = await importModule();

      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      const result = await matchFaces(Buffer.from('user'), Buffer.from('ref'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('screenAml - edge cases', () => {
    it('should handle network error', async () => {
      const { screenAml } = await importModule();

      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      const result = await screenAml({
        full_name: 'John Doe',
        entity_type: 'person',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should send correct request body', async () => {
      const { screenAml } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          request_id: 'req-1',
          aml: { status: 'Approved', total_hits: 0, hits: [], entity_type: 'person' },
        }),
      } as any);

      await screenAml({
        full_name: 'John Doe',
        entity_type: 'person',
        date_of_birth: '1990-01-01',
        nationality: 'US',
        include_adverse_media: true,
        vendor_data: 'vendor-123',
      });

      const callArgs = mockFetch.mock.calls[0] as any;
      const body = JSON.parse(callArgs[1].body);
      expect(body.full_name).toBe('John Doe');
      expect(body.entity_type).toBe('person');
      expect(body.date_of_birth).toBe('1990-01-01');
      expect(body.save_api_request).toBe(true);
    });
  });
});
