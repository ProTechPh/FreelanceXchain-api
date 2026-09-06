import { Request, Response, CookieOptions } from 'express';
import { getNodeEnv } from '../config/env.js';

export interface AuthCookieNames {
  accessTokenCookie: string;
  refreshTokenCookie: string;
}

/**
 * Returns environment-appropriate cookie names.
 * In production over HTTPS, uses the __Host- prefix for cookie origin lockdown (RFC 6265bis).
 */
export function getAuthCookieNames(): AuthCookieNames {
  const isProd = getNodeEnv() === 'production';
  return {
    accessTokenCookie: isProd ? '__Host-psifi.access-token' : 'psifi.access-token',
    refreshTokenCookie: isProd ? '__Host-psifi.refresh-token' : 'psifi.refresh-token',
  };
}

/**
 * Sets secure, HttpOnly session cookies for authenticated users.
 * Protects against XSS token exfiltration (CWE-79 -> CWE-384).
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken?: string
): void {
  const isProd = getNodeEnv() === 'production';
  const { accessTokenCookie, refreshTokenCookie } = getAuthCookieNames();

  // Access token cookie (1 hour expiry matching JWT lifetime)
  const accessOptions: CookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 3600 * 1000,
  };

  res.cookie(accessTokenCookie, accessToken, accessOptions);

  // Fallback plain cookie name in development for simpler local tooling
  if (!isProd) {
    res.cookie('access_token', accessToken, accessOptions);
  }

  // Refresh token cookie (30 days expiry, scoped strictly to auth routes)
  if (refreshToken) {
    const refreshOptions: CookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 3600 * 1000,
    };

    res.cookie(refreshTokenCookie, refreshToken, refreshOptions);

    if (!isProd) {
      res.cookie('refresh_token', refreshToken, refreshOptions);
    }
  }
}

/**
 * Clears authentication cookies across all paths and naming variants.
 */
export function clearAuthCookies(res: Response): void {
  const isProd = getNodeEnv() === 'production';
  const { accessTokenCookie, refreshTokenCookie } = getAuthCookieNames();

  const baseOptions: CookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  };

  res.clearCookie(accessTokenCookie, { ...baseOptions, path: '/' });
  res.clearCookie(refreshTokenCookie, { ...baseOptions, path: '/api/auth' });
  res.clearCookie('access_token', { ...baseOptions, path: '/' });
  res.clearCookie('refresh_token', { ...baseOptions, path: '/api/auth' });
  res.clearCookie('__Host-psifi.access-token', { ...baseOptions, path: '/' });
  res.clearCookie('__Host-psifi.refresh-token', { ...baseOptions, path: '/api/auth' });
}

/**
 * Extracts an authentication token from incoming request headers or HttpOnly cookies.
 * Prioritizes explicit Bearer headers for API clients, falling back to session cookies.
 */
export function extractTokenFromRequest(req: Request | {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}): string | undefined {
  const authHeader = req.headers['authorization'] || req.headers.authorization;
  if (typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  let cookies = req.cookies;
  if (!cookies && typeof req.headers['cookie'] === 'string') {
    cookies = {};
    for (const pair of (req.headers['cookie'] as string).split(';')) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        try {
          cookies[key] = decodeURIComponent(val);
        } catch {
          cookies[key] = val;
        }
      }
    }
  }

  if (cookies) {
    const { accessTokenCookie } = getAuthCookieNames();
    const cookieToken =
      cookies[accessTokenCookie] ||
      cookies['access_token'] ||
      cookies['__Host-psifi.access-token'];

    if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
      return cookieToken.trim();
    }
  }

  return undefined;
}
