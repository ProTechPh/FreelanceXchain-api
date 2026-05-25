import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDoubleCsrfProtection = jest.fn();
const mockGenerateCsrfToken = jest.fn();
const mockDoubleCsrf = jest.fn(() => ({
  generateCsrfToken: mockGenerateCsrfToken,
  doubleCsrfProtection: mockDoubleCsrfProtection,
}));

jest.unstable_mockModule('csrf-csrf', () => ({
  doubleCsrf: mockDoubleCsrf,
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    jwt: { secret: 'test-jwt-secret' },
  },
}));

const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

const { csrfProtection, generateCsrfToken } = await import('../csrf-middleware.js');

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/some-protected-route',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-request-id': 'req-123', 'user-agent': 'test-agent' },
    ...overrides,
  } as unknown as Request;
}

interface MockResponse {
  status: ReturnType<typeof jest.fn>;
  json: ReturnType<typeof jest.fn>;
}

function createMockResponse(): MockResponse {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function createMockNext(): NextFunction & { calls: any[][] } {
  const calls: any[][] = [];
  const next = ((...args: any[]) => { calls.push(args); }) as unknown as NextFunction & { calls: any[][] };
  next.calls = calls;
  return next;
}

describe('csrf-middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    mockGenerateCsrfToken.mockReturnValue('default-token');
  });

  describe('csrfProtection', () => {
    it('should call next() immediately when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(next.calls[0]).toHaveLength(0);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /health', () => {
      const req = createMockRequest({ method: 'POST', path: '/health' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(next.calls[0]).toHaveLength(0);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/health', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/health' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/webhooks', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/webhooks' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/login', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/login' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/login/mfa-verify', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/login/mfa-verify' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/register', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/register' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/callback', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/callback' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/oauth/callback', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/oauth/callback' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/oauth/register', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/oauth/register' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/refresh', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/refresh' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/forgot-password', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/forgot-password' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/reset-password', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/reset-password' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/resend-confirmation', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/resend-confirmation' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/auth/csrf-token', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/csrf-token' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for exempt path /api/kyc/webhook', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/kyc/webhook' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for sub-paths of exempt paths', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/login/extra' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for sub-paths of /api/webhooks', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/webhooks/stripe/events' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for sub-paths of /api/kyc/webhook', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/kyc/webhook/didit' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should NOT skip CSRF for paths that merely start with exempt path prefix without slash', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/loginother' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalled();
    });

    it('should skip CSRF for GET requests on non-exempt paths', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(next.calls[0]).toHaveLength(0);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for HEAD requests on non-exempt paths', () => {
      const req = createMockRequest({ method: 'HEAD', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should skip CSRF for OPTIONS requests on non-exempt paths', () => {
      const req = createMockRequest({ method: 'OPTIONS', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should delegate to doubleCsrfProtection for POST on non-exempt path', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalledWith(req, expect.anything(), expect.any(Function));
      expect(next.calls).toHaveLength(1);
      expect(next.calls[0]).toHaveLength(0);
    });

    it('should delegate to doubleCsrfProtection for PUT on non-exempt path', () => {
      const req = createMockRequest({ method: 'PUT', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalled();
    });

    it('should delegate to doubleCsrfProtection for DELETE on non-exempt path', () => {
      const req = createMockRequest({ method: 'DELETE', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalled();
    });

    it('should delegate to doubleCsrfProtection for PATCH on non-exempt path', () => {
      const req = createMockRequest({ method: 'PATCH', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalled();
    });

    it('should return 403 when CSRF validation fails', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/protected',
        ip: '192.168.1.1',
        headers: { 'x-request-id': 'req-403', 'user-agent': 'test-agent' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const csrfError = new Error('CSRF token mismatch');
      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(csrfError));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockDoubleCsrfProtection).toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith('CSRF validation failed', {
        requestId: 'req-403',
        path: '/api/protected',
        method: 'POST',
        ip: '192.168.1.1',
        error: 'CSRF token mismatch',
      });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: 'Invalid or missing CSRF token',
          },
          requestId: 'req-403',
        }),
      );
      expect(next.calls).toHaveLength(0);
    });

    it('should use "unknown" as requestId when x-request-id header is missing', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/protected',
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      const csrfError = new Error('bad token');
      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(csrfError));

      csrfProtection(req, res as unknown as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        }),
      );
    });

    it('should include timestamp in 403 response', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(new Error('fail')));

      csrfProtection(req, res as unknown as Response, next);

      const jsonArg = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect(jsonArg.timestamp).toBeDefined();
      expect(typeof jsonArg.timestamp).toBe('string');
    });

    it('should call next() when doubleCsrfProtection succeeds', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(undefined));

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(next.calls[0]).toHaveLength(0);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should check exempt path before method, allowing POST to exempt paths', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/auth/login' });
      const res = createMockResponse();
      const next = createMockNext();

      csrfProtection(req, res as unknown as Response, next);

      expect(next.calls).toHaveLength(1);
      expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects passed as CSRF errors', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb('string error'));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockLoggerWarn).toHaveBeenCalledWith('CSRF validation failed', expect.objectContaining({
        error: undefined,
      }));
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should use err.message when error is an Error-like object', () => {
      const req = createMockRequest({ method: 'POST', path: '/api/protected' });
      const res = createMockResponse();
      const next = createMockNext();

      const errorLike = { message: 'custom message' };
      mockDoubleCsrfProtection.mockImplementation((_req: any, _res: any, cb: any) => cb(errorLike));

      csrfProtection(req, res as unknown as Response, next);

      expect(mockLoggerWarn).toHaveBeenCalledWith('CSRF validation failed', expect.objectContaining({
        error: 'custom message',
      }));
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('generateCsrfToken', () => {
    it('should return 200 with token info on success', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/auth/csrf-token',
        ip: '127.0.0.1',
        headers: { 'x-request-id': 'req-gen-1', 'user-agent': 'test-agent' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockReturnValue('generated-csrf-token-value');

      generateCsrfToken(req, res as unknown as Response);

      expect(mockGenerateCsrfToken).toHaveBeenCalledWith(req, expect.anything());
      expect(mockLoggerInfo).toHaveBeenCalledWith('CSRF token generated successfully', expect.objectContaining({
        requestId: 'req-gen-1',
        cookieName: 'psifi.x-csrf-token',
        tokenGenerated: true,
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'CSRF token generated and set in cookie',
          cookieName: 'psifi.x-csrf-token',
          requestId: 'req-gen-1',
        }),
      );
    });

    it('should use __Host- prefix in production', () => {
      process.env.NODE_ENV = 'production';

      const req = createMockRequest({
        method: 'GET',
        path: '/api/auth/csrf-token',
        ip: '127.0.0.1',
        headers: { 'x-request-id': 'req-prod', 'user-agent': 'test-agent' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockReturnValue('prod-token');

      generateCsrfToken(req, res as unknown as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: '__Host-psifi.x-csrf-token',
        }),
      );

      delete process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
    });

    it('should use "unknown" requestId when header is missing', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/auth/csrf-token',
        headers: {},
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockReturnValue('token');

      generateCsrfToken(req, res as unknown as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        }),
      );
    });

    it('should include timestamp in success response', () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockReturnValue('token');

      generateCsrfToken(req, res as unknown as Response);

      const jsonArg = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect(jsonArg.timestamp).toBeDefined();
      expect(typeof jsonArg.timestamp).toBe('string');
    });

    it('should return 500 when csrfTokenGenerator throws an error', () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-throw' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockImplementation(() => {
        throw new Error('Token generation explosion');
      });

      generateCsrfToken(req, res as unknown as Response);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to generate CSRF token',
        expect.objectContaining({
          requestId: 'req-throw',
          error: 'Token generation explosion',
        }),
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            code: 'CSRF_TOKEN_GENERATION_FAILED',
            message: 'Failed to generate CSRF token',
          },
          requestId: 'req-throw',
        }),
      );
    });

    it('should return 500 when csrfTokenGenerator throws a non-Error value', () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-nonerr' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockImplementation(() => {
        throw 'string error value';
      });

      generateCsrfToken(req, res as unknown as Response);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to generate CSRF token',
        expect.objectContaining({
          requestId: 'req-nonerr',
          error: 'Unknown error',
        }),
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should include stack in logger.error when error is an Error instance', () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-stack' },
      });
      const res = createMockResponse();

      const thrownError = new Error('stack test');
      mockGenerateCsrfToken.mockImplementation(() => {
        throw thrownError;
      });

      generateCsrfToken(req, res as unknown as Response);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to generate CSRF token',
        expect.objectContaining({
          stack: thrownError.stack,
        }),
      );
    });

    it('should not include stack in logger.error when error is not an Error instance', () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-nostack' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockImplementation(() => {
        throw 42;
      });

      generateCsrfToken(req, res as unknown as Response);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to generate CSRF token',
        expect.objectContaining({
          stack: undefined,
        }),
      );
    });

    it('should include timestamp in 500 error response', () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockImplementation(() => {
        throw new Error('oops');
      });

      generateCsrfToken(req, res as unknown as Response);

      const jsonArg = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect(jsonArg.timestamp).toBeDefined();
      expect(typeof jsonArg.timestamp).toBe('string');
    });

    it('should log tokenGenerated as false when generator returns falsy token', () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-falsy' },
      });
      const res = createMockResponse();

      mockGenerateCsrfToken.mockReturnValue(null);

      generateCsrfToken(req, res as unknown as Response);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'CSRF token generated successfully',
        expect.objectContaining({
          tokenGenerated: false,
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when csrfTokenGenerator is not a function', async () => {
      const notAFuncReturn = {
        generateCsrfToken: 'not-a-function' as unknown as ReturnType<typeof jest.fn>,
        doubleCsrfProtection: mockDoubleCsrfProtection,
      };
      mockDoubleCsrf.mockReturnValue(notAFuncReturn);

      jest.resetModules();

      jest.unstable_mockModule('csrf-csrf', () => ({
        doubleCsrf: jest.fn(() => notAFuncReturn),
      }));

      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { jwt: { secret: 'test-jwt-secret' } },
      }));

      jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
        logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError },
      }));

      const { generateCsrfToken: genBroken } = await import('../csrf-middleware.js');

      const req = createMockRequest({
        method: 'GET',
        headers: { 'x-request-id': 'req-broken' },
      });
      const res = createMockResponse();

      genBroken(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            code: 'CSRF_TOKEN_GENERATION_FAILED',
            message: 'Failed to generate CSRF token',
          },
          requestId: 'req-broken',
        }),
      );

      mockDoubleCsrf.mockReturnValue({
        generateCsrfToken: mockGenerateCsrfToken,
        doubleCsrfProtection: mockDoubleCsrfProtection,
      });
    });
  });
});