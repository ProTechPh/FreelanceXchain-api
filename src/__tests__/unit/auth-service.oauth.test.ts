// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserByEmail: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({
      id: 'new-user',
      email: 'test@example.com',
      role: 'freelancer',
      wallet_address: '',
      is_suspended: false,
    }),
    getUserById: jest.fn().mockResolvedValue(null),
    emailExists: jest.fn().mockResolvedValue(false),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: jest.fn(async () => null),
}));

jest.unstable_mockModule('bcrypt', () => {
  const mock = {
    hash: jest.fn().mockResolvedValue('hashed_password' as never),
    compare: jest.fn().mockResolvedValue(true as never),
  };
  return { default: mock, ...mock };
});

jest.unstable_mockModule('jsonwebtoken', () => {
  const mock = {
    sign: jest.fn().mockReturnValue('mock_token'),
    verify: jest.fn(),
  };
  return { default: mock, ...mock };
});

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    getDocument: jest.fn(),
    listDocuments: jest.fn(),
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    deleteDocument: jest.fn(),
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn(),
    limit: jest.fn(),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
  createUserClient: jest.fn(() => ({
    setEndpoint: jest.fn().mockReturnThis(),
    setProject: jest.fn().mockReturnThis(),
    setJWT: jest.fn().mockReturnThis(),
  })),
  account: {},
  users: {},
  storage: {},
}));

const { loginWithAppwrite, registerWithAppwrite, getOAuthUrl } = await import('../../services/auth-service.js');

describe('AuthService - OAuth Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return AUTH_REQUIRE_REGISTRATION when user not found in DB', async () => {
    const result = await loginWithAppwrite('valid_appwrite_token');
    expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
  });

  it('should return AUTH_REQUIRE_REGISTRATION for any token when user not in DB', async () => {
    const result = await loginWithAppwrite('invalid_token');
    expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
  });
});

describe('AuthService - registerWithAppwrite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register and return auth result', async () => {
    const { userRepository } = await import('../../repositories/user-repository.js');
    userRepository.createUser.mockResolvedValueOnce({
      id: 'new-user',
      email: 'test@example.com',
      role: 'employer',
      wallet_address: '',
      is_suspended: false,
    });
    const result = await registerWithAppwrite('valid_token', 'employer');
    expect(result).toHaveProperty('user');
  });

  it('should return DUPLICATE_EMAIL if user already exists', async () => {
    const { userRepository } = await import('../../repositories/user-repository.js');
    userRepository.getUserById.mockResolvedValueOnce({ id: 'existing-user' });
    const result = await registerWithAppwrite('valid_token', 'freelancer');
    expect(result).toHaveProperty('code', 'DUPLICATE_EMAIL');
  });
});

describe('AuthService - getOAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a string (may be empty in test env)', async () => {
    const url = await getOAuthUrl('google');
    expect(typeof url).toBe('string');
  });
});
