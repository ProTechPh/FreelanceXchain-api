import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

import path from 'path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock env
const mockGetTurnstileSecret = jest.fn<() => string | undefined>();
const mockGetTurnstileHostnames = jest.fn<() => string>();
const mockGetNodeEnv = jest.fn<() => string>();

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  getTurnstileSecret: mockGetTurnstileSecret,
  getTurnstileHostnames: mockGetTurnstileHostnames,
  getNodeEnv: mockGetNodeEnv,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { requireTurnstile } = await import(resolveModule('src/middleware/turnstile-middleware.ts'));

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    res: {
      status,
      json,
    } as unknown as Response,
    status,
    json,
  };
}

describe('requireTurnstile Middleware', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNodeEnv.mockReturnValue('production');
    mockGetTurnstileSecret.mockReturnValue('test-turnstile-secret');
    mockGetTurnstileHostnames.mockReturnValue('freelancexchain.works,localhost');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should bypass verification in test mode when TURNSTILE_SECRET is unset', async () => {
    mockGetNodeEnv.mockReturnValue('test');
    mockGetTurnstileSecret.mockReturnValue(undefined);

    const req = createMockReq();
    const { res } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should bypass verification in development mode when TURNSTILE_SECRET is unset', async () => {
    mockGetNodeEnv.mockReturnValue('development');
    mockGetTurnstileSecret.mockReturnValue(undefined);

    const req = createMockReq();
    const { res } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('login');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should return 403 when token is missing', async () => {
    const req = createMockReq({ body: {} });
    const { res, status, json } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'TURNSTILE_VERIFICATION_REQUIRED',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when token exceeds 2048 characters', async () => {
    const longToken = 'a'.repeat(2049);
    const req = createMockReq({ body: { 'cf-turnstile-response': longToken } });
    const { res, status } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when siteverify fetch encounters a network error', async () => {
    globalThis.fetch = jest.fn<any>().mockRejectedValueOnce(new Error('Network error')) as unknown as typeof fetch;

    const req = createMockReq({ body: { 'cf-turnstile-response': 'valid-token' } });
    const { res, status, json } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'TURNSTILE_VERIFICATION_FAILED',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when siteverify returns success: false', async () => {
    globalThis.fetch = jest.fn<any>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as unknown as typeof fetch;

    const req = createMockReq({ body: { 'cf-turnstile-response': 'bad-token' } });
    const { res, status } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when action does not match expected action', async () => {
    globalThis.fetch = jest.fn<any>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        action: 'login', // Expected 'signup'
        hostname: 'freelancexchain.works',
      }),
    }) as unknown as typeof fetch;

    const req = createMockReq({ body: { 'cf-turnstile-response': 'valid-token' } });
    const { res, status } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when hostname is not in expected hostnames', async () => {
    globalThis.fetch = jest.fn<any>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        action: 'signup',
        hostname: 'unauthorized-site.com',
      }),
    }) as unknown as typeof fetch;

    const req = createMockReq({ body: { 'cf-turnstile-response': 'valid-token' } });
    const { res, status } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when siteverify returns success: true with matching action and hostname', async () => {
    globalThis.fetch = jest.fn<any>().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        action: 'signup',
        hostname: 'freelancexchain.works',
      }),
    }) as unknown as typeof fetch;

    const req = createMockReq({
      body: { 'cf-turnstile-response': 'valid-token' },
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    const { res } = createMockRes();
    const next = jest.fn() as NextFunction;

    const middleware = requireTurnstile('signup');
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
