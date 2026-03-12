import { Router, type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

const router = Router();

/**
 * Verify Didit webhook signature
 */
function verifyDiditSignature(payload: string, signature: string): boolean {
  const secret = process.env['DIDIT_WEBHOOK_SECRET'];
  if (!secret) {
    logger.warn('DIDIT_WEBHOOK_SECRET not configured');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * @swagger
 * /api/webhooks/didit:
 *   post:
 *     summary: Didit KYC verification webhook
 *     description: Receives KYC verification status updates from Didit
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
router.post('/didit', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-didit-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify signature
    if (!verifyDiditSignature(payload, signature)) {
      logger.warn('Invalid Didit webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    logger.info('Received Didit webhook:', { event, sessionId: data?.sessionId });

    // Handle different event types
    switch (event) {
      case 'verification.completed':
        // TODO: Update KYC status in database
        logger.info('KYC verification completed:', data);
        break;

      case 'verification.failed':
        // TODO: Update KYC status to failed
        logger.info('KYC verification failed:', data);
        break;

      case 'verification.expired':
        // TODO: Mark KYC session as expired
        logger.info('KYC verification expired:', data);
        break;

      default:
        logger.warn('Unknown Didit webhook event:', event);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Failed to process Didit webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

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
 */
router.post('/blockchain', async (req: Request, res: Response) => {
  try {
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
