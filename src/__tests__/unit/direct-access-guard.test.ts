import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { directAccessGuard } from '../../middleware/security-middleware.js';
import { config } from '../../config/env.js';

describe('directAccessGuard middleware', () => {
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let originalInternalSecret: string | undefined;

  function createMockReq(path: string, headers: Record<string, string> = {}, method = 'GET') {
    return {
      path,
      url: path,
      method,
      headers,
    } as unknown as Request;
  }

  let originalNodeEnv: string;
  let originalEnableApiDocs: boolean;

  beforeEach(() => {
    originalNodeEnv = config.server.nodeEnv;
    originalInternalSecret = config.server.internalApiSecret;
    originalEnableApiDocs = config.server.enableApiDocs;
    // @ts-expect-error test override
    config.server.nodeEnv = 'production';
    // @ts-expect-error test override
    config.server.internalApiSecret = undefined;
    // @ts-expect-error test override
    config.server.enableApiDocs = false;

    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };

    nextFn = jest.fn();
  });

  afterEach(() => {
    // @ts-expect-error test restore
    config.server.nodeEnv = originalNodeEnv;
    // @ts-expect-error test restore
    config.server.internalApiSecret = originalInternalSecret;
    // @ts-expect-error test restore
    config.server.enableApiDocs = originalEnableApiDocs;
  });

  it('allows OPTIONS preflight requests', () => {
    const req = createMockReq('/api/freelancers', {}, 'OPTIONS');
    directAccessGuard(req, mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('bypasses guard in development environment', () => {
    // @ts-expect-error test override
    config.server.nodeEnv = 'development';
    // @ts-expect-error test override
    config.server.internalApiSecret = 'test-secret';
    directAccessGuard(createMockReq('/api/freelancers', {}), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('bypasses guard in test environment', () => {
    // @ts-expect-error test override
    config.server.nodeEnv = 'test';
    // @ts-expect-error test override
    config.server.internalApiSecret = 'test-secret';
    directAccessGuard(createMockReq('/api/freelancers', {}), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('allows health check and root endpoints without checks', () => {
    directAccessGuard(createMockReq('/'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/api/health'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/robots.txt'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('allows webhooks without secret check', () => {
    directAccessGuard(createMockReq('/api/webhooks/stripe'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/api/kyc/webhook'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('allows oauth callbacks without secret check', () => {
    directAccessGuard(createMockReq('/api/auth/callback'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/api/auth/oauth/google'), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('allows Swagger UI docs when api docs enabled', () => {
    // @ts-expect-error test override
    config.server.enableApiDocs = true;

    directAccessGuard(createMockReq('/api-docs', {}), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/api-docs/index.html', {}), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();

    nextFn = jest.fn();
    directAccessGuard(createMockReq('/openapi.json', {}), mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('blocks direct browser navigation when sec-fetch-dest is document', () => {
    const req = createMockReq('/api/freelancers', { 'sec-fetch-dest': 'document' });
    directAccessGuard(req, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DIRECT_ACCESS_BLOCKED',
      })
    );
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('blocks direct browser navigation when sec-fetch-mode is navigate', () => {
    const req = createMockReq('/api/freelancers', { 'sec-fetch-mode': 'navigate' });
    directAccessGuard(req, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DIRECT_ACCESS_BLOCKED',
      })
    );
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('enforces INTERNAL_API_SECRET when configured', () => {
    // @ts-expect-error test override
    config.server.internalApiSecret = 'test-secret-12345';

    // Missing header
    const reqMissing = createMockReq('/api/freelancers', {});
    directAccessGuard(reqMissing, mockRes as Response, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ACCESS_DENIED',
      })
    );
    expect(nextFn).not.toHaveBeenCalled();

    // Wrong header
    mockRes.status = jest.fn().mockReturnThis() as any;
    mockRes.json = jest.fn().mockReturnThis() as any;
    const reqWrong = createMockReq('/api/freelancers', { 'x-internal-secret': 'wrong-secret' });
    directAccessGuard(reqWrong, mockRes as Response, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(nextFn).not.toHaveBeenCalled();

    // Correct header
    nextFn = jest.fn();
    const reqCorrect = createMockReq('/api/freelancers', { 'x-internal-secret': 'test-secret-12345' });
    directAccessGuard(reqCorrect, mockRes as Response, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });
});
