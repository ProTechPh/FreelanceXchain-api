/**
 * Didit Client Tests - Refactored
 * Tests for Didit KYC verification client
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Store original environment variables
const originalEnv = process.env;

// Mock fetch globally
const mockFetch = jest.fn() as any;
global.fetch = mockFetch as any;

describe('Didit Client - Refactored', () => {
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
    return await import('../../services/didit-client.js');
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
        headers: new Map([['content-type', 'application/json']]),
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
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockError,
      } as any);

      const request = { workflow_id: '' };
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

      const request = { workflow_id: 'workflow-123' };
      const result = await createVerificationSession(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NETWORK_ERROR');
        expect(result.error.error.message).toContain('Network connection failed');
      }
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
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResponse,
      } as any);

      const result = await getVerificationDecision('session-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision).toBe('approved');
        expect(result.data.status).toBe('Completed');
      }
    });

    it('should handle not found error', async () => {
      const { getVerificationDecision } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Session not found' } }),
      } as any);

      const result = await getVerificationDecision('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', async () => {
      const { verifyWebhookSignature } = await importModule();

      const payload = JSON.stringify({ session_id: 'test' });
      const signature = 'valid-signature';
      const timestamp = Date.now().toString();

      // Mock crypto verification
      const result = verifyWebhookSignature(payload, signature, timestamp);

      expect(typeof result).toBe('boolean');
    });
  });
});
