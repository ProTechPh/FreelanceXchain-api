import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  createRefundRequest,
  approveRefund,
  rejectRefund,
  getContractRefunds,
} from '../services/escrow-refund-service.js';

const router = Router();

/**
 * @swagger
 * /api/escrow/{contractId}/refund-request:
 *   post:
 *     summary: Create refund request
 *     tags:
 *       - Escrow Refunds
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount to refund (optional, defaults to full amount)
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund request created successfully
 */
router.post('/:contractId/refund-request', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    const userId = req.user?.id ?? '';
    const { amount, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Refund reason is required' });
    }

    const result = await createRefundRequest({
      contractId,
      requestedBy: userId,
      amount,
      reason,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error creating refund request:', error);
    return res.status(500).json({ error: 'Failed to create refund request' });
  }
});

/**
 * @swagger
 * /api/escrow/{contractId}/refunds:
 *   get:
 *     summary: Get refund requests for contract
 *     tags:
 *       - Escrow Refunds
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of refund requests
 */
router.get('/:contractId/refunds', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    const userId = req.user?.id ?? '';

    const result = await getContractRefunds(contractId, userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting refunds:', error);
    return res.status(500).json({ error: 'Failed to get refunds' });
  }
});

/**
 * @swagger
 * /api/escrow/refunds/{refundId}/approve:
 *   post:
 *     summary: Approve refund request
 *     tags:
 *       - Escrow Refunds
 *     parameters:
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund approved successfully
 */
router.post('/refunds/:refundId/approve', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const refundId = req.params['refundId'] ?? '';
    const userId = req.user?.id ?? '';

    const result = await approveRefund({
      refundId,
      approvedBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error approving refund:', error);
    return res.status(500).json({ error: 'Failed to approve refund' });
  }
});

/**
 * @swagger
 * /api/escrow/refunds/{refundId}/reject:
 *   post:
 *     summary: Reject refund request
 *     tags:
 *       - Escrow Refunds
 *     parameters:
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund rejected successfully
 */
router.post('/refunds/:refundId/reject', authMiddleware, validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const refundId = req.params['refundId'] ?? '';
    const userId = req.user?.id ?? '';
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await rejectRefund({
      refundId,
      rejectedBy: userId,
      reason,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error rejecting refund:', error);
    return res.status(500).json({ error: 'Failed to reject refund' });
  }
});

export default router;
