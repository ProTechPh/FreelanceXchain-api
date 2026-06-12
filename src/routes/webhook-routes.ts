import { Router, type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

const router = Router();

/**
 * Verify blockchain webhook signature (HMAC-SHA256)
 */
function verifyBlockchainSignature(payload: string, signature: string): boolean {
  const secret = process.env['BLOCKCHAIN_WEBHOOK_SECRET'];
  if (!secret) {
    logger.warn('BLOCKCHAIN_WEBHOOK_SECRET not configured - blockchain webhook authentication is disabled. Set BLOCKCHAIN_WEBHOOK_SECRET to secure this endpoint.');
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
router.post('/blockchain', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-blockchain-signature'] as string | undefined;
    const payload = req.rawBody ?? JSON.stringify(req.body);

    if (signature === undefined) {
      logger.warn('Missing blockchain webhook signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    if (!verifyBlockchainSignature(payload, signature)) {
      logger.warn('Invalid blockchain webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    logger.info('Received blockchain webhook:', { event, data });

    // Handle different blockchain events
    switch (event) {
      case 'payment.released':
        // TODO: Update milestone status
        logger.info('Payment released:', data);
        break;

      case 'dispute.resolved':
        // TODO: Update dispute status
        logger.info('Dispute resolved:', data);
        break;

      case 'escrow.refunded':
        // TODO: Update refund status
        logger.info('Escrow refunded:', data);
        break;

      default:
        logger.warn('Unknown blockchain webhook event:', event);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Failed to process blockchain webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;