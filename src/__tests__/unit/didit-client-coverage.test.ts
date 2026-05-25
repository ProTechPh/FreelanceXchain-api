// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/url-validator.ts'), () => ({
  validateUrl: () => ({ valid: true }),
  sanitizeSessionId: (id: string) => id,
}));

// Set env vars before import
process.env['DIDIT_API_KEY'] = 'test-api-key';
process.env['DIDIT_API_URL'] = 'https://verification.didit.me';
process.env['DIDIT_WEBHOOK_SECRET'] = 'test-webhook-secret';

const mockFetch = jest.fn<any>();
global.fetch = mockFetch;

const {
  createVerificationSession,
  getVerificationDecision,
  getVerificationSession,
  verifyWebhookSignature,
  verifyIdDocument,
  checkPassiveLiveness,
  matchFaces,
  screenAml,
} = await import('../../services/didit-client.js');

describe('Didit Client - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 152-165: createVerificationSession non-JSON response
  describe('createVerificationSession', () => {
    it('should return INVALID_RESPONSE when content-type is not JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html>Error</html>',
      });
      // Override headers.get
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: (key: string) => key === 'content-type' ? 'text/html' : null },
        text: async () => '<html>Error</html>',
      });

      const result = await createVerificationSession({ callback: 'http://test.com' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should return error when API returns non-200 JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
        json: async () => ({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } }),
      });

      const result = await createVerificationSession({ callback: 'http://test.com' });
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await createVerificationSession({ callback: 'http://test.com' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should return success on valid response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
        json: async () => ({ session_id: 'sess-1', url: 'https://verify.didit.me/sess-1' }),
      });

      const result = await createVerificationSession({ callback: 'http://test.com' });
      expect(result.success).toBe(true);
    });
  });

  // Lines 200-233: getVerificationDecision
  describe('getVerificationDecision', () => {
    it('should return INVALID_RESPONSE for non-JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: (key: string) => key === 'content-type' ? 'text/plain' : null },
        text: async () => 'Server Error',
      });

      const result = await getVerificationDecision('session-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should return error for non-200 JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Session not found' } }),
      });

      const result = await getVerificationDecision('session-1');
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await getVerificationDecision('session-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });

  // Lines 250-252, 261-268: getVerificationSession
  describe('getVerificationSession', () => {
    it('should return INVALID_RESPONSE for non-JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: (key: string) => key === 'content-type' ? 'text/html' : null },
        text: async () => '<html>Error</html>',
      });

      const result = await getVerificationSession('session-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });

    it('should return error for non-200 JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
      });

      const result = await getVerificationSession('session-1');
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await getVerificationSession('session-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });

  // Lines 317-318, 357-358, 360-361: verifyWebhookSignature
  describe('verifyWebhookSignature', () => {
    it('should return false when signature or timestamp is missing', () => {
      const result = verifyWebhookSignature('payload', '', '');
      expect(result).toBe(false);
    });

    it('should return false when timestamp is not a valid number', () => {
      const result = verifyWebhookSignature('payload', 'sig', 'not-a-number');
      expect(result).toBe(false);
    });

    it('should return false when timestamp is too old', () => {
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600);
      const result = verifyWebhookSignature('payload', 'abc123', oldTimestamp);
      expect(result).toBe(false);
    });

    it('should return false when signature does not match', () => {
      const now = String(Math.floor(Date.now() / 1000));
      const result = verifyWebhookSignature('payload', 'invalidsig', now);
      expect(result).toBe(false);
    });
  });

  // Lines 382-383, 418-419, 440-441: verifyIdDocument, checkPassiveLiveness, matchFaces
  describe('verifyIdDocument', () => {
    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'INVALID_DOCUMENT', message: 'Bad document' } }),
      });

      const result = await verifyIdDocument(Buffer.from('front'));
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await verifyIdDocument(Buffer.from('front'), Buffer.from('back'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should return success on valid response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ request_id: 'req-1', id_verification: { status: 'Approved' } }),
      });

      const result = await verifyIdDocument(Buffer.from('front'), Buffer.from('back'), 'vendor-data');
      expect(result.success).toBe(true);
    });
  });

  describe('checkPassiveLiveness', () => {
    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'LIVENESS_FAILED', message: 'Failed' } }),
      });

      const result = await checkPassiveLiveness(Buffer.from('selfie'));
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await checkPassiveLiveness(Buffer.from('selfie'), 'vendor');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });

  describe('matchFaces', () => {
    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'FACE_MISMATCH', message: 'No match' } }),
      });

      const result = await matchFaces(Buffer.from('selfie'), Buffer.from('id'));
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await matchFaces(Buffer.from('selfie'), Buffer.from('id'), 'vendor');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });

  // Lines 477-478, 489-500: screenAml
  describe('screenAml', () => {
    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'AML_ERROR', message: 'Screening failed' } }),
      });

      const result = await screenAml({ full_name: 'John Doe', entity_type: 'person' });
      expect(result.success).toBe(false);
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await screenAml({ full_name: 'John Doe', entity_type: 'person' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should return success on valid response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ request_id: 'req-1', aml: { status: 'Approved', entity_type: 'person' } }),
      });

      const result = await screenAml({ full_name: 'John Doe', entity_type: 'person' });
      expect(result.success).toBe(true);
    });
  });
});
