import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth-middleware.js';
import { validate, submitAppRatingSchema } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId, sendServiceError } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  submitAppRating,
  getRatingEligibility,
  listAppRatings,
  getAppRatingSummary,
} from '../services/app-rating-service.js';
import type { AppRatingSource } from '../models/app-rating.js';

const router = Router();

const STATUS_MAP = {
  INVALID_RATING: 400,
  INVALID_SOURCE: 400,
  COMMENT_TOO_LONG: 400,
  RATE_LIMITED: 429,
  DUPLICATE_RATING: 409,
  SUBMIT_FAILED: 500,
  LIST_FAILED: 500,
  SUMMARY_FAILED: 500,
} as const;

/**
 * POST /api/app-ratings
 *
 * Deliberately not gated on `requireVerifiedKyc` (unlike /api/reviews): rating
 * the app is not a financial action, and requiring KYC would silence exactly
 * the early-journey users whose opinion is most worth having.
 */
router.post(
  '/',
  authMiddleware,
  apiRateLimiter,
  validate(submitAppRatingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const { rating, comment, source, contextId } = req.body;

    const result = await submitAppRating({
      userId,
      userRole: userRole ?? 'unknown',
      rating,
      comment,
      source: source as AppRatingSource,
      contextId,
    });

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(201).json(result.data);
  })
);

/** GET /api/app-ratings/eligibility — may this user be prompted right now? */
router.get(
  '/eligibility',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const userId = req.user?.userId;

    if (!userId) {
      sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
      return;
    }

    const result = await getRatingEligibility(userId);

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

/** GET /api/app-ratings/admin — every submission, attributed. */
router.get(
  '/admin',
  authMiddleware,
  requireRole('admin'),
  apiRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const source = req.query['source'] as string | undefined;
    const ratingParam = req.query['rating'] as string | undefined;
    const rating = ratingParam === undefined ? undefined : Number(ratingParam);

    const result = await listAppRatings({
      source,
      ...(rating !== undefined && Number.isFinite(rating) ? { rating } : {}),
    });

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

/** GET /api/app-ratings/admin/summary — average, histogram and per-source split. */
router.get(
  '/admin/summary',
  authMiddleware,
  requireRole('admin'),
  apiRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = getRequestId(req);
    const result = await getAppRatingSummary();

    if (!result.success) {
      sendServiceError(res, result, requestId, STATUS_MAP);
      return;
    }

    res.status(200).json(result.data);
  })
);

export default router;
