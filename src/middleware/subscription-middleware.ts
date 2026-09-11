/**
 * Pro subscription gate
 *
 * Deliberately a separate module from auth-middleware.ts: billing entitlement
 * is a different concern from identity, and several route tests mock
 * auth-middleware with a factory that exports only `authMiddleware` — adding an
 * export there would break them.
 *
 * Shaped after requireVerifiedKyc, including the admin bypass.
 */

import type { Request, Response, NextFunction } from 'express';
import { isPro, isDevProGrantActive } from '../services/subscription-service.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

/** The single error code the frontend keys its upgrade prompt off. */
export const PLAN_UPGRADE_REQUIRED = 'PLAN_UPGRADE_REQUIRED';

/**
 * Requires an active Pro subscription. Must be used AFTER authMiddleware.
 *
 * Admins bypass the paywall entirely, before any I/O — they operate the
 * platform and are never billed for it.
 */
export async function requirePro(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = getRequestId(req);

  if (!req.user) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  if (isDevProGrantActive()) {
    next();
    return;
  }

  let entitled: boolean;
  try {
    entitled = await isPro(req.user.userId);
  } catch (error) {
    // A paywall and an outage must not look the same to a paying customer, so
    // an unreadable entitlement is 503, never 403.
    logger.error('Failed to verify subscription status', error as Error, {
      requestId,
      userId: req.user.userId,
    });

    sendErrorResponse(res, 503, 'SUBSCRIPTION_CHECK_FAILED', 'Unable to verify your subscription right now. Please try again.', { requestId });
    return;
  }

  if (!entitled) {
    logger.authzFailure(req.user.userId, req.path, req.method, {
      requestId,
      reason: PLAN_UPGRADE_REQUIRED,
    });

    sendErrorResponse(res, 403, PLAN_UPGRADE_REQUIRED, 'This feature requires a Pro subscription', {
      requestId,
      details: ['Upgrade to Pro to use this feature'],
    });
    return;
  }

  next();
}
