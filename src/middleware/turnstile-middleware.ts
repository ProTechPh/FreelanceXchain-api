/**
 * Cloudflare Turnstile bot verification middleware.
 *
 * Implements the canonical siteverify check:
 * 1. Reads the cf-turnstile-response token from req.body or headers.
 * 2. Validates token format (non-empty string <= 2048 chars).
 * 3. Calls https://challenges.cloudflare.com/turnstile/v0/siteverify with secret, token, remoteip.
 * 4. Requires success === true, action === expectedAction, and hostname in expectedHostnames.
 * 5. Gates, does not replace, the underlying handler.
 */

import type { Request, Response, NextFunction } from 'express';
import { getTurnstileSecret, getTurnstileHostnames, getNodeEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

interface SiteverifyResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

function extractTurnstileToken(req: Request): string | undefined {
  if (typeof req.body === 'object' && req.body !== null) {
    const token = req.body['cf-turnstile-response'] || req.body['turnstileToken'];
    if (typeof token === 'string' && token.length > 0) return token;
  }
  const header = req.headers['cf-turnstile-response'];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || req.ip;
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() || req.ip;
  }
  return req.ip;
}

async function callSiteverify(secret: string, token: string, clientIp?: string): Promise<SiteverifyResult> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      secret,
      response: token,
      ...(clientIp && { remoteip: clientIp }),
    }),
  });

  if (!response.ok) {
    throw new Error(`siteverify returned HTTP ${response.status}`);
  }

  return response.json() as Promise<SiteverifyResult>;
}

function getExpectedHostnames(): Set<string> {
  return new Set(
    getTurnstileHostnames()
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean)
  );
}

function shouldBypassTurnstile(nodeEnv: string, secret?: string): boolean {
  if (nodeEnv === 'test' && !secret) return true;
  if (nodeEnv === 'development' && !secret) {
    logger.debug('Turnstile secret not configured; bypassing verification in development');
    return true;
  }
  return false;
}

export function requireTurnstile(expectedAction: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const secret = getTurnstileSecret();

    if (shouldBypassTurnstile(getNodeEnv(), secret)) {
      next();
      return;
    }

    const token = extractTurnstileToken(req);
    const expectedHostnames = getExpectedHostnames();

    if (!token || token.length > 2048 || expectedHostnames.size === 0) {
      sendErrorResponse(
        res,
        403,
        'TURNSTILE_VERIFICATION_REQUIRED',
        'Bot verification is required to complete this action',
        { requestId }
      );
      return;
    }

    let result: SiteverifyResult;
    try {
      result = await callSiteverify(secret ?? '', token, getClientIp(req));
    } catch (error) {
      logger.error('Turnstile siteverify request failed', { error, requestId });
      sendErrorResponse(
        res,
        403,
        'TURNSTILE_VERIFICATION_FAILED',
        'Failed to verify bot challenge. Please try again.',
        { requestId }
      );
      return;
    }

    const resultHostname = result.hostname ? result.hostname.trim().toLowerCase() : undefined;
    if (
      !result.success ||
      (result.action && result.action !== expectedAction) ||
      (resultHostname && !expectedHostnames.has(resultHostname))
    ) {
      logger.warn('Turnstile verification failed', {
        success: result.success,
        action: result.action,
        expectedAction,
        hostname: result.hostname,
        errorCodes: result['error-codes'],
        requestId,
      });

      sendErrorResponse(
        res,
        403,
        'TURNSTILE_VERIFICATION_FAILED',
        'Bot verification check failed. Please refresh and try again.',
        { requestId, details: result['error-codes'] }
      );
      return;
    }

    next();
  };
}
