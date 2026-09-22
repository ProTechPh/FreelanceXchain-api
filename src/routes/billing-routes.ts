import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter, billingRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';
import { isStripeConfigured } from '../config/stripe.js';
import { createCheckoutSession, createPortalSession, getPlanPrices, getTrialPeriodDays, getBillingEligibility } from '../services/stripe-billing-service.js';
import { getEntitlement } from '../services/subscription-service.js';

const router = Router();

/** Map a service error code onto the HTTP status it deserves. */
function statusForBillingError(code: string): number {
  switch (code) {
    case 'BILLING_NOT_CONFIGURED':
      return 503;
    case 'ALREADY_SUBSCRIBED':
    case 'NO_STRIPE_CUSTOMER':
      return 409;
    // Configuration faults, not outages: retrying changes nothing, so they must
    // not be reported as 502 "Stripe unavailable".
    case 'INTERVAL_UNAVAILABLE':
    case 'STRIPE_REQUEST_INVALID':
    case 'STRIPE_PRICE_MISCONFIGURED':
      return 400;
    case 'STRIPE_AUTH_FAILED':
      return 503;
    case 'VERIFICATION_REQUIRED':
      return 403;
    case 'USER_NOT_FOUND':
      return 404;
    case 'STRIPE_UNAVAILABLE':
      return 502;
    default:
      return 400;
  }
}

/**
 * @swagger
 * /api/billing/plans:
 *   get:
 *     summary: Public plan descriptor
 *     description: Static Free/Pro descriptor for the pricing page. Makes no Stripe call.
 *     tags:
 *       - Billing
 *     responses:
 *       200:
 *         description: Plans retrieved successfully
 */
router.get('/plans', apiRateLimiter, asyncHandler(async (_req: Request, res: Response) => {
  // Amounts come from Stripe, not from constants here, so the page can never
  // quote a figure checkout will not honour.
  const prices = await getPlanPrices();

  res.status(200).json({
    billingEnabled: isStripeConfigured(),
    // Surfaced so the pricing page advertises the trial that checkout will
    // actually apply, rather than a figure typed into the markup.
    trialPeriodDays: getTrialPeriodDays(),
    plans: [
      {
        id: 'free',
        name: 'Free',
        prices: [],
        description: 'The full marketplace: projects, proposals, escrow, messaging, reputation and the whole analytics layer.',
      },
      {
        id: 'pro',
        name: 'Pro',
        description: 'Everything in Free, plus AI matching, AI proposals and priority matching.',
        // Monthly and annual are billing variants of one plan, not two tiers.
        prices,
      },
    ],
  });
}));

/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Current subscription state
 *     description: Returns the caller's plan and subscription detail. Free is a valid state, not an error.
 *     tags:
 *       - Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription state retrieved successfully
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Subscription state could not be read
 */
router.get('/subscription', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const userId = req.user?.userId;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Admins are entitled without a subscription; report that honestly rather
  // than showing them an upgrade prompt in billing settings.
  if (req.user?.role === 'admin') {
    res.status(200).json({
      plan: 'pro',
      status: 'active',
      isPro: true,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      manageable: false,
      reason: 'admin',
      canSubscribe: false,
      subscribeBlockedReason: null,
      trialEligible: false,
      trialDays: 0,
      trialIneligibleReason: null,
    });
    return;
  }

  const result = await getEntitlement(userId);

  if (!result.success) {
    sendErrorResponse(res, 503, result.error.code, result.error.message, { requestId });
    return;
  }

  // Eligibility is per-user, so it belongs here rather than on the public
  // /plans route. The UI needs it to say why a trial is unavailable instead of
  // quietly charging someone who expected a free week.
  const eligibility = await getBillingEligibility(userId);

  res.status(200).json({ ...result.data, ...eligibility });
}));

/**
 * @swagger
 * /api/billing/checkout-session:
 *   post:
 *     summary: Start a Pro subscription checkout
 *     description: Creates a Stripe-hosted Checkout Session. Entitlement is granted by webhook, never by the redirect.
 *     tags:
 *       - Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checkout session created
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Already subscribed
 *       502:
 *         description: Stripe unavailable
 *       503:
 *         description: Billing not configured
 */
router.post('/checkout-session', authMiddleware, billingRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const userId = req.user?.userId;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { successUrl, cancelUrl, interval } = (req.body ?? {}) as {
    successUrl?: string;
    cancelUrl?: string;
    interval?: string;
  };

  if (interval !== undefined && interval !== 'month' && interval !== 'year') {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'interval must be "month" or "year"', { requestId });
    return;
  }

  const result = await createCheckoutSession({
    userId,
    requestId,
    interval,
    successUrl,
    cancelUrl,
  });

  if (!result.success) {
    sendErrorResponse(res, statusForBillingError(result.error.code), result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

/**
 * @swagger
 * /api/billing/portal-session:
 *   post:
 *     summary: Open the Stripe Customer Portal
 *     description: Returns a hosted portal URL where the user can update payment details, cancel or resume.
 *     tags:
 *       - Billing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portal session created
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: No billing account yet
 *       502:
 *         description: Stripe unavailable
 *       503:
 *         description: Billing not configured
 */
router.post('/portal-session', authMiddleware, billingRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const userId = req.user?.userId;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const { returnUrl } = (req.body ?? {}) as { returnUrl?: string };

  const result = await createPortalSession({ userId, returnUrl });

  if (!result.success) {
    sendErrorResponse(res, statusForBillingError(result.error.code), result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

export default router;
