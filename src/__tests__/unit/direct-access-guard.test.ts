import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { directAccessGuard } from '../../middleware/security-middleware.js';
import { config } from '../../config/env.js';

describe('directAccessGuard middleware', () => {
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let originalInternalSecret: string | undefined;

  function createMockReq(path: string, headers: Record<string, string> = {}) {
    return {
      path,
      url: path,
      headers,
    } as unknown as Request;
  }

  beforeEach(() => {
    originalInternalSecret = config.server.internalApiSecret;
    // @ts-expect-error test override
    config.server.internalApiSecret = undefined;

    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };

    nextFn = jest.fn();
  });

  afterEach(() => {
    // @ts-expect-error test restore
    config.server.internalApiSecret = originalInternalSecret;
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
