import { Router, type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import { webhookRateLimiter } from '../middleware/rate-limiter.js';
import { asyncHandler } from '../utils/async-handler.js';
import { WebhookDeduper } from '../utils/webhook-dedup.js';
import { verifyAndParseEvent, handleStripeEvent } from '../services/stripe-webhook-service.js';

/**
 * Kept in its own router (still mounted under /api/webhooks) rather than added
 * to webhook-routes.ts, so the existing blockchain webhook tests don't pull the
 * Stripe SDK into their module graph.
 *
 * No CSRF and no raw-body plumbing is needed here: app.ts already captures
 * req.rawBody for any path under /api/webhooks, and csrf-middleware already
 * exempts that prefix.
 */
const router = Router();

// Stripe delivers at-least-once. event.id is Stripe's own idempotency key, so
// no payload hashing is needed. This is a per-process fast path only — the
// durable guarantee is that every write is a full-state overwrite derived from
// a fresh retrieve, gated by the last_event_created watermark.
const stripeWebhookDeduper = new WebhookDeduper();

/**
 * @swagger
 * /api/webhooks/stripe:
 *   post:
 *     summary: Stripe webhook
 *     description: Receives Stripe subscription lifecycle events. Signature-verified; never authenticated.
 *     tags:
 *       - Webhooks
 *     responses:
 *       200:
 *         description: Event processed (or acknowledged as a duplicate)
 *       400:
 *         description: Missing or invalid signature
 *       500:
 *         description: Processing failed; Stripe will retry
 *       503:
 *         description: Stripe webhooks are not configured
 */
router.post('/stripe', webhookRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string | undefined;

  const verified = verifyAndParseEvent(req.rawBody, signature);

  if (!verified.ok) {
    const status = verified.code === 'NOT_CONFIGURED' ? 503 : 400;
    res.status(status).json({ error: verified.message });
    return;
  }

  const { event } = verified;

  if (stripeWebhookDeduper.has(event.id)) {
    logger.info('Duplicate Stripe webhook ignored', { eventId: event.id, eventType: event.type });
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  try {
    await handleStripeEvent(event);
  } catch (error) {
    // Answer non-2xx on purpose: Stripe retries for up to 3 days, and that
    // retry IS the recovery path for a transient datastore failure.
    logger.error('Failed to process Stripe webhook', error as Error, {
      eventId: event.id,
      eventType: event.type,
    });
    res.status(500).json({ error: 'Failed to process event' });
    return;
  }

  // Only mark processed after success, so a failed delivery is retried rather
  // than permanently swallowed by the deduper.
  stripeWebhookDeduper.markProcessed(event.id);

  res.status(200).json({ received: true });
}));

export default router;
