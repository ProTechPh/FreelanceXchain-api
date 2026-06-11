import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RegisterInput, LoginInput } from '../../services/auth-types.js';

// Mocks are handled by jest.setup.ts
const { register, login, validateToken, logout } = await import('../../services/auth-service-appwrite.js');

describe('AuthService (Appwrite)', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.createDocument.mockResolvedValue({ $id: 'test-user-id', email: 'new@test.com', role: 'freelancer', wallet_address: '', created_at: new Date().toISOString() });
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const input: RegisterInput = {
        email: 'new@test.com',
        password: 'Password123!',
        role: 'freelancer',
      };

      // Mock emailExists - returns empty (no duplicate)
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 }) // emailExists check
        .mockResolvedValueOnce({ documents: [], total: 0 }); // getUserByEmail (not needed but called)

      const result = await register(input);
      
      expect(result).not.toHaveProperty('code');
      expect((result as any).accessToken).toBeDefined();
    });

    it('should fail if email exists', async () => {
      const input: RegisterInput = {
        email: 'exists@test.com',
        password: 'Password123!',
        role: 'freelancer',
      };

      // Mock emailExists - returns existing user
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'existing-user', email: 'exists@test.com' }], total: 1 });

      const result = await register(input);
      expect(result).toHaveProperty('code', 'DUPLICATE_EMAIL');
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const input: LoginInput = {
        email: 'test@test.com',
        password: 'Password123!',
      };

      // Mock getUserByEmail - returns user
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: false }],
          total: 1,
        });

      const result = await login(input);
      expect(result).not.toHaveProperty('code');
      expect((result as any).accessToken).toBe('test-session-secret');
    });

    it('should fail with wrong credentials', async () => {
      const input: LoginInput = {
        email: 'test@test.com',
        password: 'wrong-password',
      };

      const result = await login(input);
      expect(result).toHaveProperty('code', 'INVALID_CREDENTIALS');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      // Mock getUserById - returns user
      mockDatabases.getDocument
        .mockResolvedValueOnce({
          $id: 'test-user-id',
          email: 'test@test.com',
          role: 'freelancer',
          is_suspended: false,
        });

      const result = await validateToken('test-session-secret');
      expect(result).not.toHaveProperty('code');
      expect((result as any).userId).toBe('test-user-id');
    });

    it('should fail for suspended user', async () => {
      // Mock getUserById - returns suspended user
      mockDatabases.getDocument
        .mockResolvedValueOnce({
          $id: 'test-user-id',
          email: 'test@test.com',
          role: 'freelancer',
          is_suspended: true,
          suspension_reason: 'reason',
        });

      const result = await validateToken('test-session-secret');
      expect(result).toHaveProperty('code', 'USER_SUSPENDED');
    });
  });
});
