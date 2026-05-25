import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RegisterInput, LoginInput } from '../../services/auth-types.js';

// Mocks are handled by jest.setup.ts
const { register, login, validateToken, logout } = await import('../../services/auth-service-appwrite.js');
const { pool } = await import('../../config/database.js');

describe('AuthService (Appwrite)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const input: RegisterInput = {
        email: 'new@test.com',
        password: 'Password123!',
        role: 'freelancer',
      };

      // Mock email check
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // emailExists
      // Mock user creation in DB
      (pool.query as any).mockResolvedValueOnce({ 
        rows: [{ 
          id: 'test-user-id', 
          email: 'new@test.com', 
          role: 'freelancer',
          wallet_address: '',
          created_at: new Date().toISOString()
        }] 
      });

      const result = await register(input);
      
      expect(result).not.toHaveProperty('code');
      expect((result as any).user.email).toBe('new@test.com');
      expect((result as any).accessToken).toBeDefined();
    });

    it('should fail if email exists', async () => {
      const input: RegisterInput = {
        email: 'exists@test.com',
        password: 'Password123!',
        role: 'freelancer',
      };

      (pool.query as any).mockResolvedValueOnce({ rows: [{ id: '1' }] });

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

      (pool.query as any).mockResolvedValueOnce({ 
        rows: [{ id: 'test-user-id', email: 'test@test.com', role: 'freelancer' }] 
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
      (pool.query as any).mockResolvedValueOnce({ 
        rows: [{ id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: false }] 
      });

      const result = await validateToken('test-session-secret');
      expect(result).not.toHaveProperty('code');
      expect((result as any).userId).toBe('test-user-id');
    });

    it('should fail for suspended user', async () => {
      (pool.query as any).mockResolvedValueOnce({ 
        rows: [{ id: 'test-user-id', is_suspended: true, suspension_reason: 'reason' }] 
      });

      const result = await validateToken('test-session-secret');
      expect(result).toHaveProperty('code', 'USER_SUSPENDED');
    });
  });
});
