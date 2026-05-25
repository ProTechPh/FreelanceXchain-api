import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  validateToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  isUserVerified: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    appwrite: {
      url: 'https://test.appwrite.co',
      anonKey: 'test-anon-key',
    },
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    auth: jest.fn(),
    authzFailure: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockPoolQuery = jest.fn<() => Promise<any>>();

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery },
}));

const { validateToken } = await import(resolveModule('src/services/auth-service.ts'));
const { isUserVerified } = await import(resolveModule('src/services/didit-kyc-service.ts'));
const { authMiddleware, requireMFA, requireRole, requireVerifiedKyc } = await import('../auth-middleware.js');

const mockedValidateToken = validateToken as jest.MockedFunction<typeof validateToken>;
const mockedIsUserVerified = isUserVerified as jest.MockedFunction<typeof isUserVerified>;

function createMockReq(overrides: any = {}): any {
  return {
    headers: {},
    path: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    status: jest.fn((code: number) => { res.statusCode = code; return res; }),
    json: jest.fn((body: any) => { res.body = body; return res; }),
  };
  return res;
}

describe('authMiddleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq();
    res = createMockRes();
    next = jest.fn();
  });

  it('should return 401 AUTH_MISSING_TOKEN when authorization header is missing', async () => {
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header is required' },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_MISSING_TOKEN when authorization header is empty string', async () => {
    req.headers.authorization = '';
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_FORMAT when header has no Bearer prefix', async () => {
    req.headers.authorization = 'token123';
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'AUTH_INVALID_FORMAT', message: 'Authorization header must be in format: Bearer <token>' },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_FORMAT when header has wrong scheme', async () => {
    req.headers.authorization = 'Basic token123';
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_FORMAT');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_FORMAT when header has too many parts', async () => {
    req.headers.authorization = 'Bearer token extra';
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_FORMAT');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_FORMAT when header is just "Bearer"', async () => {
    req.headers.authorization = 'Bearer';
    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_FORMAT');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_TOKEN_EXPIRED when validateToken returns TOKEN_EXPIRED error', async () => {
    req.headers.authorization = 'Bearer expired-token';
    mockedValidateToken.mockResolvedValue({
      code: 'TOKEN_EXPIRED',
      message: 'Token has expired',
    } as any);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    expect(res.body.error.message).toBe('Token has expired');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_TOKEN when validateToken returns other AuthError', async () => {
    req.headers.authorization = 'Bearer bad-token';
    mockedValidateToken.mockResolvedValue({
      code: 'INVALID_TOKEN',
      message: 'Invalid token',
    } as any);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    expect(res.body.error.message).toBe('Invalid token');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 AUTH_INVALID_TOKEN for USER_NOT_FOUND error code', async () => {
    req.headers.authorization = 'Bearer some-token';
    mockedValidateToken.mockResolvedValue({
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    } as any);

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should set req.user and call next() on successful validation', async () => {
    req.headers.authorization = 'Bearer valid-token';
    mockedValidateToken.mockResolvedValue({
      id: 'user-123',
      userId: 'user-123',
      email: 'test@example.com',
      role: 'freelancer',
    } as any);

    await authMiddleware(req, res, next);

    expect(req.user).toEqual({
      id: 'user-123',
      userId: 'user-123',
      email: 'test@example.com',
      role: 'freelancer',
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should pass requestId from x-request-id header to error response', async () => {
    req.headers['x-request-id'] = 'req-abc-123';

    await authMiddleware(req, res, next);

    expect(res.body.requestId).toBe('req-abc-123');
  });

  it('should use "unknown" as requestId when x-request-id is missing', async () => {
    await authMiddleware(req, res, next);

    expect(res.body.requestId).toBe('unknown');
  });

  it('should include timestamp in error response', async () => {
    const before = new Date().toISOString();
    await authMiddleware(req, res, next);
    const after = new Date().toISOString();

    expect(res.body.timestamp >= before).toBe(true);
    expect(res.body.timestamp <= after).toBe(true);
  });

  it('should set req.user with id and userId both populated from result.userId', async () => {
    req.headers.authorization = 'Bearer valid-token';
    mockedValidateToken.mockResolvedValue({
      id: 'id-456',
      userId: 'id-456',
      email: 'user@test.com',
      role: 'employer',
    } as any);

    await authMiddleware(req, res, next);

    expect(req.user.id).toBe('id-456');
    expect(req.user.userId).toBe('id-456');
  });

  it('should map AUTH_INVALID_CREDENTIALS to AUTH_INVALID_TOKEN', async () => {
    req.headers.authorization = 'Bearer some-token';
    mockedValidateToken.mockResolvedValue({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    } as any);

    await authMiddleware(req, res, next);

    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call validateToken with the extracted token string', async () => {
    req.headers.authorization = 'Bearer my-extracted-token';
    mockedValidateToken.mockResolvedValue({
      id: '1',
      userId: '1',
      email: 't@t.com',
      role: 'freelancer',
    } as any);

    await authMiddleware(req, res, next);

    expect(mockedValidateToken).toHaveBeenCalledWith('my-extracted-token');
  });
});

describe('requireMFA', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    req = createMockReq();
    res = createMockRes();
    next = jest.fn();
  });

  it('should return 401 AUTH_UNAUTHORIZED when no req.user', async () => {
    await requireMFA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user exists and mfa_enabled is false', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockPoolQuery.mockResolvedValue({ rows: [{ mfa_enabled: false }] });

    await requireMFA(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() when user exists and mfa_enabled is true (MFA not yet enforced)', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockPoolQuery.mockResolvedValue({ rows: [{ mfa_enabled: true }] });

    await requireMFA(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 401 AUTH_UNAUTHORIZED when user not found in DB', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockPoolQuery.mockResolvedValue({ rows: [] });

    await requireMFA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 MFA_CHECK_FAILED when pool.query throws', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockPoolQuery.mockRejectedValue(new Error('DB error'));

    await requireMFA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('MFA_CHECK_FAILED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 MFA_CHECK_FAILED when pool.query throws non-Error', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockPoolQuery.mockRejectedValue('string error');

    await requireMFA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('MFA_CHECK_FAILED');
  });

  it('should include requestId in error responses', async () => {
    req.headers['x-request-id'] = 'mfa-req-1';
    mockPoolQuery.mockResolvedValue({ rows: [] });

    await requireMFA(req, res, next);

    expect(res.body.requestId).toBe('mfa-req-1');
  });

  it('should use "unknown" as requestId when x-request-id missing', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });

    await requireMFA(req, res, next);

    expect(res.body.requestId).toBe('unknown');
  });
});

describe('requireRole', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq();
    res = createMockRes();
    next = jest.fn();
  });

  it('should return 401 AUTH_UNAUTHORIZED when no req.user', () => {
    const middleware = requireRole('freelancer' as any);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 AUTH_FORBIDDEN when user role does not match', () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    const middleware = requireRole('admin' as any);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(res.body.error.message).toBe('Insufficient permissions');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user has correct role', () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'admin' };
    const middleware = requireRole('admin' as any);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() when user role is one of multiple allowed roles', () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    const middleware = requireRole('admin' as any, 'freelancer' as any, 'employer' as any);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 AUTH_FORBIDDEN when user role is not in multiple allowed roles', () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    const middleware = requireRole('admin' as any, 'employer' as any);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for employer when only admin is allowed', () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'employer' };
    const middleware = requireRole('admin' as any);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('should include requestId in error responses', () => {
    req.headers['x-request-id'] = 'role-req-1';
    const middleware = requireRole('admin' as any);
    middleware(req, res, next);

    expect(res.body.requestId).toBe('role-req-1');
  });

  it('should use "unknown" as requestId when x-request-id is missing', () => {
    const middleware = requireRole('admin' as any);
    middleware(req, res, next);

    expect(res.body.requestId).toBe('unknown');
  });
});

describe('requireVerifiedKyc', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = createMockReq();
    res = createMockRes();
    next = jest.fn();
  });

  it('should return 401 AUTH_UNAUTHORIZED when no req.user', async () => {
    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() for admin user (KYC exempt)', async () => {
    req.user = { id: '1', userId: '1', email: 'admin@test.com', role: 'admin' };
    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockedIsUserVerified).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 KYC_REQUIRED when user is not verified', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockedIsUserVerified.mockResolvedValue(false);

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');
    expect(res.body.error.message).toBe('Identity verification is required for this operation');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user KYC is verified', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockedIsUserVerified.mockResolvedValue(true);

    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 500 KYC_CHECK_FAILED when isUserVerified throws error', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockedIsUserVerified.mockRejectedValue(new Error('KYC service down'));

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error.code).toBe('KYC_CHECK_FAILED');
    expect(res.body.error.message).toBe('Failed to verify KYC status');
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass userId to isUserVerified', async () => {
    req.user = { id: '2', userId: 'user-abc', email: 'a@b.com', role: 'employer' };
    mockedIsUserVerified.mockResolvedValue(true);

    await requireVerifiedKyc(req, res, next);

    expect(mockedIsUserVerified).toHaveBeenCalledWith('user-abc');
  });

  it('should return 403 KYC_REQUIRED for employer with unverified KYC', async () => {
    req.user = { id: '1', userId: '1', email: 'emp@test.com', role: 'employer' };
    mockedIsUserVerified.mockResolvedValue(false);

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe('KYC_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('should include requestId in error responses', async () => {
    req.headers['x-request-id'] = 'kyc-req-1';
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockedIsUserVerified.mockResolvedValue(false);

    await requireVerifiedKyc(req, res, next);

    expect(res.body.requestId).toBe('kyc-req-1');
  });

  it('should use "unknown" as requestId when x-request-id is missing', async () => {
    req.user = { id: '1', userId: '1', email: 'a@b.com', role: 'freelancer' };
    mockedIsUserVerified.mockResolvedValue(false);

    await requireVerifiedKyc(req, res, next);

    expect(res.body.requestId).toBe('unknown');
  });
});