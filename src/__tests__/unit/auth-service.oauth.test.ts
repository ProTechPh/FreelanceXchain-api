import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import path from 'node:path';
import { createTestUser } from '../helpers/test-data-factory.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Define mocks BEFORE imports using unstable_mockModule
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUserById: jest.fn(),
    emailExists: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/config/supabase.ts'), () => ({
  __esModule: true,
  getSupabaseClient: jest.fn(),
  getSupabaseServiceClient: jest.fn(() => ({
    auth: {
      admin: {
        generateLink: jest.fn(async () => ({ data: {}, error: null })),
      },
    },
  })),
}));

jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: jest.fn(async () => null),
}));

jest.unstable_mockModule('bcrypt', () => {
  const mock = {
    hash: jest.fn().mockResolvedValue('hashed_password' as never),
    compare: jest.fn().mockResolvedValue(true as never),
  };
  return {
    default: mock,
    ...mock,
  };
});

jest.unstable_mockModule('jsonwebtoken', () => {
  const mock = {
    sign: jest.fn().mockReturnValue('mock_token'),
    verify: jest.fn(),
  };
  return {
    default: mock,
    ...mock,
  };
});

// Dynamic imports
const { loginWithSupabase, registerWithSupabase, getOAuthUrl } = await import('../../services/auth-service.js');
const { userRepository } = await import('../../repositories/user-repository.js');
const { getSupabaseClient } = await import('../../config/supabase.js');

describe('AuthService - OAuth Login', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
      signInWithOAuth: jest.fn(),
      mfa: {
        listFactors: jest.fn().mockResolvedValue({
          data: { all: [] },
          error: null,
        } as never),
      },
      getSession: jest.fn().mockResolvedValue({
        data: { session: { refresh_token: 'mock_refresh_token' } },
        error: null,
      } as never),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it('should return REQUIRE_REGISTRATION for new user', async () => {
    const newUser = createTestUser({ email: 'new_user@example.com' });

    // Mock Supabase response
    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: {
        user: {
          email: newUser.email,
        },
      },
      error: null,
    } as never);

    // Mock User Repository response for "not found"
    (userRepository.getUserByEmail as jest.Mock).mockResolvedValue(null as never);

    const result = await loginWithSupabase('valid_supabase_token');

    expect(userRepository.createUser).not.toHaveBeenCalled();
    expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
  });

  it('should successfully login existing user', async () => {
    const existingUser = createTestUser({ 
      email: 'existing@example.com',
      role: 'employer'
    });

    // Mock Supabase response
    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: {
        user: {
          email: existingUser.email,
        },
      },
      error: null,
    } as never);

    // Mock User Repository response for "found"
    (userRepository.getUserByEmail as jest.Mock).mockResolvedValue({
      id: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
      created_at: new Date(),
    } as never);

    const result = await loginWithSupabase('valid_supabase_token');

    expect(userRepository.createUser).not.toHaveBeenCalled();
    expect(result).toHaveProperty('accessToken', 'valid_supabase_token');
    if ('user' in result) {
      expect(result.user.id).toBe(existingUser.id);
    }
  });

  it('should return error for invalid supabase token', async () => {
    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    } as never);

    const result = await loginWithSupabase('invalid_token');

    expect(result).toHaveProperty('code', 'INVALID_TOKEN');
  });
});

describe('AuthService - registerWithSupabase', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { refresh_token: 'mock_refresh_token' } },
        error: null,
      } as never),
      updateUser: jest.fn().mockResolvedValue({
        data: { user: {} },
        error: null,
      } as never),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it('should create new user with role (name and wallet optional)', async () => {
    const newEmployer = createTestUser({ 
      email: 'new_employer@example.com',
      role: 'employer'
    });

    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: {
        user: {
          email: newEmployer.email,
        },
      },
      error: null,
    } as never);

    (userRepository.getUserByEmail as jest.Mock).mockResolvedValue(null as never);
    (userRepository.createUser as jest.Mock).mockResolvedValue({
      id: newEmployer.id,
      email: newEmployer.email,
      role: newEmployer.role,
      wallet_address: '',
      name: '',
      created_at: new Date(),
    } as never);

    const result = await registerWithSupabase('valid_token', 'employer', '');

    expect(userRepository.createUser).toHaveBeenCalledWith(expect.objectContaining({
      role: 'employer',
      email: newEmployer.email,
      wallet_address: '',
      name: '',
    }));
    expect(result).toHaveProperty('user');
    if ('user' in result) {
      expect(result.user.role).toBe('employer');
    }
  });

  it('should login if user already exists (idempotency)', async () => {
    const existingUser = createTestUser({ 
      email: 'existing@example.com',
      role: 'freelancer'
    });

    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: {
        user: {
          email: existingUser.email,
        },
      },
      error: null,
    } as never);

    (userRepository.getUserByEmail as jest.Mock).mockResolvedValue({
      id: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    } as never);

    const result = await registerWithSupabase('valid_token', 'employer', '');

    expect(userRepository.createUser).not.toHaveBeenCalled();
    expect(result).toHaveProperty('user');
    if ('user' in result) {
      expect(result.user.role).toBe('freelancer'); // Role remains unchanged
    }
  });
});

describe('AuthService - getOAuthUrl', () => {
  const mockSupabase = {
    auth: {
      signInWithOAuth: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it('should return valid OAuth URL', async () => {
    (mockSupabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: { url: 'https://example.com/auth' },
      error: null,
    } as never);

    await getOAuthUrl('google' as any);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const expectedRedirect = `${frontendUrl}/oauth/callback`;

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        redirectTo: expectedRedirect,
      }),
    }));
  });
});
