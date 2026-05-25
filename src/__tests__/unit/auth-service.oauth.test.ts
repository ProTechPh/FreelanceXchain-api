import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUserById: jest.fn(),
    emailExists: jest.fn(),
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

const { loginWithAppwrite, registerWithAppwrite, getOAuthUrl } = await import('../../services/auth-service.js');

describe('AuthService - OAuth Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return INTERNAL_ERROR (Appwrite no longer supported)', async () => {
    const result = await loginWithAppwrite('valid_appwrite_token');
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
  });

  it('should return INTERNAL_ERROR for invalid appwrite token', async () => {
    const result = await loginWithAppwrite('invalid_token');
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
  });
});

describe('AuthService - registerWithAppwrite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return INTERNAL_ERROR (Appwrite registration no longer supported)', async () => {
    const result = await registerWithAppwrite('valid_token', 'employer', '');
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
  });

  it('should return INTERNAL_ERROR regardless of input', async () => {
    const result = await registerWithAppwrite('valid_token', 'freelancer', '0xabc');
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
  });
});

describe('AuthService - getOAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a URL string', async () => {
    const url = await getOAuthUrl('google');
    expect(typeof url).toBe('string');
  });
});
