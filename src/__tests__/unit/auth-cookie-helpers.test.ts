import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockValidateToken = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  validateToken: mockValidateToken,
}));

const {
  getAuthCookieNames,
  setAuthCookies,
  clearAuthCookies,
  extractTokenFromRequest,
} = await import('../../utils/auth-cookie-helpers.js');
const { authMiddleware } = await import('../../middleware/auth-middleware.js');

describe('auth-cookie-helpers', () => {
  describe('getAuthCookieNames', () => {
    it('should return cookie names with access and refresh tokens', () => {
      const names = getAuthCookieNames();
      expect(names.accessTokenCookie).toBeDefined();
      expect(names.refreshTokenCookie).toBeDefined();
    });
  });

  describe('setAuthCookies', () => {
    it('should set httpOnly cookies on the response', () => {
      const cookieMock = jest.fn();
      const res = { cookie: cookieMock } as unknown as Response;

      setAuthCookies(res, 'mock-access-token', 'mock-refresh-token');

      expect(cookieMock).toHaveBeenCalledWith(
        expect.any(String),
        'mock-access-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        })
      );

      expect(cookieMock).toHaveBeenCalledWith(
        expect.any(String),
        'mock-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/api/auth',
        })
      );
    });

    it('should set only access token cookie when no refresh token is provided', () => {
      const cookieMock = jest.fn();
      const res = { cookie: cookieMock } as unknown as Response;

      setAuthCookies(res, 'mock-access-token');

      expect(cookieMock).toHaveBeenCalledWith(
        expect.any(String),
        'mock-access-token',
        expect.objectContaining({ httpOnly: true })
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('should call clearCookie for access and refresh paths', () => {
      const clearMock = jest.fn();
      const res = { clearCookie: clearMock } as unknown as Response;

      clearAuthCookies(res);

      expect(clearMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ path: '/' })
      );
      expect(clearMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ path: '/api/auth' })
      );
    });
  });

  describe('extractTokenFromRequest', () => {
    it('should prioritize Bearer token from authorization header', () => {
      const req = {
        headers: { authorization: 'Bearer header-token' },
        cookies: { access_token: 'cookie-token' },
      };

      const token = extractTokenFromRequest(req as any);
      expect(token).toBe('header-token');
    });

    it('should fallback to cookie when authorization header is absent', () => {
      const req = {
        headers: {},
        cookies: { access_token: 'cookie-token' },
      };

      const token = extractTokenFromRequest(req as any);
      expect(token).toBe('cookie-token');
    });

    it('should return undefined when neither header nor cookie is present', () => {
      const req = { headers: {} };
      const token = extractTokenFromRequest(req as any);
      expect(token).toBeUndefined();
    });
  });

  describe('authMiddleware with Cookie Support', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        headers: {},
        cookies: { access_token: 'valid-cookie-jwt' },
        path: '/api/projects',
        method: 'GET',
        ip: '127.0.0.1',
      };
      mockRes = {
        status: jest.fn().mockReturnThis() as any,
        json: jest.fn().mockReturnThis() as any,
        setHeader: jest.fn().mockReturnThis() as any,
      };
      mockNext = jest.fn();
    });

    it('should authenticate user via cookie when authorization header is omitted', async () => {
      mockValidateToken.mockResolvedValueOnce({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'freelancer',
      });

      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual({
        userId: 'user-123',
        email: 'user@example.com',
        role: 'freelancer',
      });
    });
  });
});
