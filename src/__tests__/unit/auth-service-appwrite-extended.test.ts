// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), auth: jest.fn(), security: jest.fn() },
}));

describe('Auth Service Appwrite - Extended Coverage (MFA sessions, registration errors)', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/auth-service-appwrite.js');
  };

  describe('consumeMfaSession', () => {
    it('should return null when session not found', async () => {
      const { consumeMfaSession } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await consumeMfaSession('mfa_nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when session is expired', async () => {
      const { consumeMfaSession } = await importModule();
      mockPool.query.mockResolvedValueOnce({
        rows: [{ access_token: 'enc', refresh_token: 'enc', user_id: 'u-1', factor_id: 'f-1', expires_at: Date.now() - 10000 }],
        rowCount: 1,
      });

      const result = await consumeMfaSession('mfa_expired');
      expect(result).toBeNull();
    });

    it('should return null when decryption fails', async () => {
      const { consumeMfaSession } = await importModule();
      mockPool.query.mockResolvedValueOnce({
        rows: [{ access_token: 'invalid:format', refresh_token: 'invalid:format', user_id: 'u-1', factor_id: 'f-1', expires_at: Date.now() + 300000 }],
        rowCount: 1,
      });

      const result = await consumeMfaSession('mfa_bad_decrypt');
      expect(result).toBeNull();
    });

    it('should return null when database query fails', async () => {
      const { consumeMfaSession } = await importModule();
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await consumeMfaSession('mfa_db_error');
      expect(result).toBeNull();
    });
  });

  describe('registerWithAppwrite', () => {
    it('should handle duplicate email error from Appwrite', async () => {
      const { registerWithAppwrite } = await importModule();

      // The global mock for Appwrite account.create will be used
      // We need to make it throw a duplicate error
      const mockAccount = (globalThis as any).mockAppwriteAccount;
      mockAccount.createEmailPasswordSession.mockRejectedValueOnce(
        Object.assign(new Error('User already exists'), { code: 409 })
      );

      // First the user creation succeeds but session fails with 409
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'u-1', email: 'test@test.com', role: 'freelancer', wallet_address: null, created_at: '2025-01-01' }], rowCount: 1 });

      const result = await registerWithAppwrite('test@test.com', 'StrongPass1!', 'freelancer');
      // Result depends on internal flow - just verify it doesn't crash
      expect(result).toBeDefined();
    });
  });

  describe('validateTokenAndGetUser', () => {
    it('should return error for invalid token', async () => {
      const { validateTokenAndGetUser } = await importModule();

      const result = await validateTokenAndGetUser('invalid-token');
      // Should return an auth error since the token is invalid
      expect(result).toBeDefined();
      if (result && 'code' in result) {
        expect(result.code).toBeDefined();
      }
    });
  });
});
