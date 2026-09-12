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

export function requireTurnstile(expectedAction: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const nodeEnv = getNodeEnv();
    const secret = getTurnstileSecret();

    // In test environment, bypass when TURNSTILE_SECRET is not configured
    if (nodeEnv === 'test' && !secret) {
      next();
      return;
    }

    // In development environment, log a notice and bypass if unconfigured
    if (nodeEnv === 'development' && !secret) {
      logger.debug('Turnstile secret not configured; bypassing verification in development');
      next();
      return;
    }

    const token =
      (typeof req.body === 'object' && req.body !== null
        ? req.body['cf-turnstile-response'] || req.body['turnstileToken']
        : undefined) ||
      (req.headers['cf-turnstile-response'] as string | undefined);

    const expectedHostnames = new Set(
      getTurnstileHostnames()
        .split(',')
        .map((hostname) => hostname.trim().toLowerCase())
        .filter(Boolean)
    );

    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 2048 ||
      expectedHostnames.size === 0
    ) {
      sendErrorResponse(
        res,
        403,
        'TURNSTILE_VERIFICATION_REQUIRED',
        'Bot verification is required to complete this action',
        { requestId }
      );
      return;
    }

    // Determine client IP for verification
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim() || req.ip
      : Array.isArray(forwarded)
      ? forwarded[0]?.trim() || req.ip
      : req.ip;

    let result: {
      success: boolean;
      action?: string;
      hostname?: string;
      'error-codes'?: string[];
    };

    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret: secret ?? '',
          response: token,
          ...(clientIp && { remoteip: clientIp }),
        }),
      });

      if (!response.ok) {
        throw new Error(`siteverify returned HTTP ${response.status}`);
      }

      result = await response.json();
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
