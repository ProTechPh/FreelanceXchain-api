import { Router, type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import { getBlockchainWebhookSecret } from '../config/env.js';
import { webhookRateLimiter } from '../middleware/rate-limiter.js';
import { WebhookDeduper } from '../utils/webhook-dedup.js';
import crypto from 'crypto';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// Blockchain indexers deliver at-least-once, so the same event (same tx hash /
// id) can arrive multiple times. Dedupe by event + stable payload key so a
// duplicate delivery is acknowledged without re-processing side effects.
const blockchainWebhookDeduper = new WebhookDeduper();

/** Build a stable dedup key from the event name and its data payload. */
function blockchainEventKey(event: string, data: Record<string, unknown> | undefined): string {
  // Prefer a unique on-chain identifier when present; fall back to a hash of
  // the whole payload so repeated deliveries of the same event map to one key.
  const rawData = data ?? {};
  const stableId =
    rawData['transactionHash'] ?? rawData['txHash'] ?? rawData['id'] ?? rawData['eventId'];
  if (typeof stableId === 'string' && stableId.length > 0) {
    return `${event}:${stableId}`;
  }
  return `${event}:${crypto.createHash('sha256').update(JSON.stringify(rawData)).digest('hex')}`;
}

export function verifyBlockchainSignature(payload: string, signature: string): boolean {
  const secret = getBlockchainWebhookSecret();
  if (!secret) {
    logger.warn('BLOCKCHAIN_WEBHOOK_SECRET not configured - all blockchain webhook requests will be rejected. Set BLOCKCHAIN_WEBHOOK_SECRET to enable this endpoint.');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * @swagger
 * /api/webhooks/blockchain:
 *   post:
 *     summary: Blockchain event webhook
 *     description: Receives blockchain event notifications
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/blockchain', webhookRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-blockchain-signature'] as string | undefined;
    // Prefer the exact bytes the sender signed (captured by the express.json
    // verify hook for webhook paths). If rawBody is missing, fall back to a
    // re-serialization of the parsed body so verification still runs instead
    // of crashing on an undefined payload.
    const payload = req.rawBody ?? JSON.stringify(req.body ?? {});

    if (signature === undefined) {
      logger.warn('Missing blockchain webhook signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    if (!verifyBlockchainSignature(payload, signature)) {
      logger.warn('Invalid blockchain webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    // Idempotency: acknowledge duplicates without re-processing. The key is
    // marked as processed only AFTER the switch below succeeds, so a failure
    // is not permanently swallowed (at-least-once delivery will retry it).
    const dedupKey = blockchainEventKey(event as string, data as Record<string, unknown> | undefined);
    const duplicate = await blockchainWebhookDeduper.hasAsync(dedupKey);
    if (duplicate) {
      logger.info('Duplicate blockchain webhook ignored:', { event, dedupKey });
      return res.status(200).json({ received: true, duplicate: true });
    }

    logger.info('Received blockchain webhook:', { event, data });

    switch (event) {
      case 'payment.released':
        logger.info('Payment released:', data);
        break;

      case 'dispute.resolved':
        logger.info('Dispute resolved:', data);
        break;

      case 'escrow.refunded':
        logger.info('Escrow refunded:', data);
        break;

      default:
        logger.warn('Unknown blockchain webhook event:', event);
    }

    // Only mark after successful processing so a retry can complete the work.
    blockchainWebhookDeduper.markProcessed(dedupKey);

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Failed to process blockchain webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}));

export default router;