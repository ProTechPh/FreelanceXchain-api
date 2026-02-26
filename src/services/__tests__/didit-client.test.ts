import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as crypto from 'crypto';
// Store original environment variables
const originalEnv = process.env;
// Mock fetch globally - cast to any to avoid type inference issues with jest.fn()
const mockFetch = jest.fn() as any;
global.fetch = mockFetch as any;
describe('Didit Client', () => {
  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    process.env['DIDIT_API_KEY'] = 'test-api-key';
    process.env['DIDIT_API_URL'] = 'https://test.didit.me';
    process.env['DIDIT_WEBHOOK_SECRET'] = 'test-webhook-secret';
    // Clear mock
    mockFetch.mockClear();
  });
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  // Import after environment setup
  const importModule = async () => {
    // Clear module cache to get fresh imports with new env vars
    return await import('../didit-client.js');
  };
  describe('createVerificationSession', () => {
    it('should create verification session successfully', async () => {
      const { createVerificationSession } = await importModule();
      const mockResponse = {
        session_id: 'session-123',
        session_number: 1,
        session_token: 'token-123',
        status: 'Not Started' as const,
        workflow_id: 'workflow-123',
        url: 'https://verify.didit.me/session-123',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);
      const request = {
        workflow_id: 'workflow-123',
        callback: 'https://example.com/callback',
      };
      const result = await createVerificationSession(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.session_id).toBe('session-123');
        expect(result.data.url).toBe('https://verify.didit.me/session-123');
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.didit.me/v2/session/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-api-key',
          }),
        })
      );
    });
    it('should handle API error response', async () => {
      const { createVerificationSession } = await importModule();
      const mockError = {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid workflow ID',
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      } as any);
      const request = {
        workflow_id: '',
      };
      const result = await createVerificationSession(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_REQUEST');
        expect(result.error.error.message).toContain('Invalid workflow ID');
      }
    });
    it('should handle network error', async () => {
      const { createVerificationSession } = await importModule();
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed') as any);
      const request = {
        workflow_id: 'workflow-123',
      };
      const result = await createVerificationSession(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toContain('Network connection failed');
      }
    });
    it('should handle non-Error exceptions', async () => {
      const { createVerificationSession } = await importModule();
      mockFetch.mockRejectedValueOnce('String error' as any);
      const request = {
        workflow_id: 'workflow-123',
      };
      const result = await createVerificationSession(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toContain('Failed to connect');
      }
    });
    it('should send correct request body', async () => {
      const { createVerificationSession } = await importModule();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session_id: 'test',
          session_number: 1,
          session_token: 'token',
          status: 'Not Started',
          workflow_id: 'workflow-123',
          url: 'https://test.com'
        }),
      } as any);
      const request = {
        workflow_id: 'workflow-123',
        callback: 'https://example.com/callback',
        metadata: { custom: 'data' },
      };
      await createVerificationSession(request);
      const callArgs = mockFetch.mock.calls[0] as any;
      const body = JSON.parse(callArgs[1].body);
      expect(body.workflow_id).toBe('workflow-123');
      expect(body.callback).toBe('https://example.com/callback');
      expect(body.metadata).toEqual({ custom: 'data' });
    });
  });
  describe('getVerificationDecision', () => {
    it('should retrieve verification decision successfully', async () => {
      const { getVerificationDecision } = await importModule();
      const mockResponse = {
        session_id: 'session-123',
        decision: 'approved' as const,
        status: 'Completed' as const,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);
      const result = await getVerificationDecision('session-123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.session_id).toBe('session-123');
        expect(result.data.decision).toBe('approved');
      }
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.didit.me/v2/session/session-123/decision/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }),
        })
      );
    });
    it('should handle decision not found error', async () => {
      const { getVerificationDecision } = await importModule();
      const mockError = {
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      } as any);
      const result = await getVerificationDecision('invalid-session');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NOT_FOUND');
      }
    });
    it('should handle network error', async () => {
      const { getVerificationDecision } = await importModule();
      mockFetch.mockRejectedValueOnce(new Error('Timeout') as any);
      const result = await getVerificationDecision('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
  });
  describe('getVerificationSession', () => {
    it('should retrieve session details successfully', async () => {
      const { getVerificationSession } = await importModule();
      const mockResponse = {
        session_id: 'session-123',
        session_number: 1,
        session_token: 'token',
        status: 'Completed' as const,
        workflow_id: 'workflow-123',
        url: 'https://verify.didit.me/session-123',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResponse,
      } as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.session_id).toBe('session-123');
        expect(result.data.status).toBe('Completed');
      }
    });
    it('should handle non-JSON response', async () => {
      const { getVerificationSession } = await importModule();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html>Error page</html>',
      } as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
        expect(result.error.error.message).toContain('invalid response');
      }
    });
    it('should handle missing content-type header', async () => {
      const { getVerificationSession } = await importModule();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map(),
        text: async () => 'Plain text response',
      } as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('INVALID_RESPONSE');
      }
    });
    it('should handle API error response', async () => {
      const { getVerificationSession } = await importModule();
      const mockError = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockError,
      } as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('UNAUTHORIZED');
      }
    });
    it('should handle network error', async () => {
      const { getVerificationSession } = await importModule();
      mockFetch.mockRejectedValueOnce(new Error('Connection refused') as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toContain('Connection refused');
      }
    });
  });
  describe('verifyWebhookSignature', () => {
    it('should verify valid signature with timestamp+payload format', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should verify valid signature with payload-only format', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should verify valid signature with timestamp.payload format', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should reject invalid signature', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = 'invalid-signature';
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(false);
    });
    it('should reject timestamp too old', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(false);
    });
    it('should reject timestamp in future', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = (Math.floor(Date.now() / 1000) + 600).toString(); // 10 minutes in future
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(false);
    });
    it('should allow missing secret in development', async () => {
      process.env['DIDIT_WEBHOOK_SECRET'] = '';
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = 'any-signature';
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should reject missing signature in non-production', async () => {
      process.env['NODE_ENV'] = 'development';
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const result = verifyWebhookSignature(payload, '', timestamp);
      expect(result).toBe(false);
    });
    it('should reject missing signature in production', async () => {
      process.env['NODE_ENV'] = 'production';
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const result = verifyWebhookSignature(payload, '', timestamp);
      expect(result).toBe(false);
    });
    it('should reject missing timestamp in non-production', async () => {
      process.env['NODE_ENV'] = 'development';
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const signature = 'any-signature';
      const result = verifyWebhookSignature(payload, signature, '');
      expect(result).toBe(false);
    });
    it('should handle timing-safe comparison with different lengths', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = 'short';
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(false);
    });
    it('should verify signature within 5 minute window', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"verification.completed"}';
      const timestamp = (Math.floor(Date.now() / 1000) - 290).toString(); // 4 minutes 50 seconds ago
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should handle complex JSON payloads', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = JSON.stringify({
        event: 'verification.completed',
        data: {
          session_id: 'session-123',
          user: { name: 'John Doe', age: 30 },
          nested: { deep: { value: true } },
        },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should handle unicode characters in payload', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"message":"Hello 世界 🌍"}';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${payload}`)
        .digest('hex');
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(true);
    });
  });
  describe('Edge Cases and Error Handling', () => {
    it('should handle empty session ID', async () => {
      const { getVerificationDecision } = await importModule();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { code: 'INVALID_REQUEST', message: 'Invalid session ID' } }),
      } as any);
      const result = await getVerificationDecision('');
      expect(result.success).toBe(false);
    });
    it('should handle malformed JSON response', async () => {
      const { getVerificationSession } = await importModule();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as any);
      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
    it('should handle fetch timeout', async () => {
      const { createVerificationSession } = await importModule();
      mockFetch.mockRejectedValueOnce(new Error('Request timeout') as any);
      const result = await createVerificationSession({ workflow_id: 'workflow-123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
      }
    });
    it('should handle very large payloads in webhook verification', async () => {
      const { verifyWebhookSignature } = await importModule();
      const largePayload = JSON.stringify({ data: 'x'.repeat(10000) });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = 'test-webhook-secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${largePayload}`)
        .digest('hex');
      const result = verifyWebhookSignature(largePayload, signature, timestamp);
      expect(result).toBe(true);
    });
    it('should handle invalid timestamp format', async () => {
      const { verifyWebhookSignature } = await importModule();
      const payload = '{"event":"test"}';
      const timestamp = 'not-a-number';
      const signature = 'any-signature';
      const result = verifyWebhookSignature(payload, signature, timestamp);
      expect(result).toBe(false);
    });
  });
});

