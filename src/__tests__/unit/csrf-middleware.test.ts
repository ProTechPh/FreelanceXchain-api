import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

const capturedOptions: any = {};

// Use mutable wrappers so we can change implementations per-test after module import
const mockGenerateCsrfToken = jest.fn(() => 'mock-token');
const mockDoubleCsrfProtection = jest.fn((_req: any, _res: any, next: any) => next());

jest.unstable_mockModule('csrf-csrf', () => ({
  doubleCsrf: jest.fn((options: any) => {
    capturedOptions.getSessionIdentifier = options.getSessionIdentifier;
    return {
      generateCsrfToken: (...args: any[]) => (mockGenerateCsrfToken as any)(...args),
      doubleCsrfProtection: (...args: any[]) => (mockDoubleCsrfProtection as any)(...args),
    };
  }),
}));

const { csrfProtection, generateCsrfToken } = await import('../../middleware/csrf-middleware.js');

describe('CSRF Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockGenerateCsrfToken as jest.Mock).mockImplementation(() => 'mock-token');
    (mockDoubleCsrfProtection as jest.Mock).mockImplementation((_req: any, _res: any, next: any) => next());
  });

  it('should fall back to unknown when ip and user-agent are missing', () => {
    expect(capturedOptions.getSessionIdentifier).toBeDefined();
    const req = {
      ip: undefined,
      socket: { remoteAddress: undefined },
      headers: {},
    } as any;
    const result = capturedOptions.getSessionIdentifier(req);
    expect(result).toBe('unknown-unknown');
  });

  it('should use socket.remoteAddress when req.ip is missing', () => {
    const req = {
      ip: undefined,
      socket: { remoteAddress: '192.168.1.1' },
      headers: { 'user-agent': 'Mozilla' },
    } as any;
    const result = capturedOptions.getSessionIdentifier(req);
    expect(result).toBe('192.168.1.1-Mozilla');
  });

  it('should use req.ip when available', () => {
    const req = {
      ip: '10.0.0.1',
      socket: { remoteAddress: '192.168.1.1' },
      headers: { 'user-agent': 'Chrome' },
    } as any;
    const result = capturedOptions.getSessionIdentifier(req);
    expect(result).toBe('10.0.0.1-Chrome');
  });

  it('should skip csrf protection in test environment', () => {
    const req = { method: 'POST', path: '/api/test', headers: {} } as any;
    const res = {} as any;
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should skip csrf protection for exempt paths', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const req = { method: 'POST', path: '/api/auth/login', headers: {} } as any;
    const res = {} as any;
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    process.env.NODE_ENV = originalEnv;
  });

  it('should skip csrf protection for GET requests', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const req = { method: 'GET', path: '/api/test', headers: {} } as any;
    const res = {} as any;
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    process.env.NODE_ENV = originalEnv;
  });

  it('should reject request when csrf validation fails', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    (mockDoubleCsrfProtection as jest.Mock).mockImplementation((_req: any, _res: any, callback: any) => {
      callback(new Error('Invalid CSRF token'));
    });

    const req = { method: 'POST', path: '/api/test', headers: {}, ip: '127.0.0.1' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'CSRF validation failed',
      expect.objectContaining({ path: '/api/test' }),
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'CSRF_VALIDATION_FAILED' }),
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should generate csrf token successfully', () => {
    const req = { headers: {}, method: 'GET', ip: '127.0.0.1' } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn(),
    } as any;

    generateCsrfToken(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'CSRF token generated successfully',
      expect.any(Object),
    );
  });


  it('should handle csrf token generation error', () => {
    const req = { headers: {}, method: 'GET', ip: '127.0.0.1' } as any;

    const throwingRes = {
      status: jest.fn()
        .mockImplementationOnce(() => { throw new Error('res broken'); })
        .mockReturnValue({ json: jest.fn() }),
    } as any;

    generateCsrfToken(req, throwingRes);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to generate CSRF token',
      expect.any(Object),
    );
  });

  it('should call next when csrf validation succeeds', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const req = { method: 'POST', path: '/api/test', headers: {}, ip: '127.0.0.1' } as any;
    const res = {} as any;
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    process.env.NODE_ENV = originalEnv;
  });
});
