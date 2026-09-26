import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireRole, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';
import {
  createRefundRequest,
  approveRefund,
  rejectRefund,
  getContractRefunds,
  withdrawRefundRequest,
} from '../services/escrow-refund-service.js';
import { asyncHandler } from '../utils/async-handler.js';

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
router.post('/:contractId/refund-request', authMiddleware, requireVerifiedKyc, validateUUID(['contractId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    const userId = req.user?.userId ?? '';
    const { amount, reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Refund reason is required', { requestId: getRequestId(req) });
    }

    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(amount))) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Refund amount must be a positive number', { requestId: getRequestId(req) });
    }

    const result = await createRefundRequest({
      contractId,
      requestedBy: userId,
      amount,
      reason,
    });

    if (!result.success) {
      return sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error creating refund request:', { error: error instanceof Error ? error.message : String(error) });
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create refund request', { requestId: getRequestId(req) });
  }
}));

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
router.get('/:contractId/refunds', authMiddleware, validateUUID(['contractId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const contractId = req.params['contractId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await getContractRefunds(contractId, userId);

    if (!result.success) {
      return sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error getting refunds', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get refunds', { requestId: getRequestId(req) });
  }
}));

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
router.post('/refunds/:refundId/approve', authMiddleware, requireVerifiedKyc, requireRole('freelancer', 'employer'), validateUUID(['refundId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const refundId = req.params['refundId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await approveRefund({
      refundId,
      approvedBy: userId,
    });

    if (!result.success) {
      return sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error approving refund:', { error: error instanceof Error ? error.message : String(error) });
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to approve refund', { requestId: getRequestId(req) });
  }
}));

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
router.post('/refunds/:refundId/reject', authMiddleware, requireVerifiedKyc, requireRole('freelancer', 'employer'), validateUUID(['refundId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const refundId = req.params['refundId'] ?? '';
    const userId = req.user?.userId ?? '';
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Rejection reason is required', { requestId: getRequestId(req) });
    }

    const result = await rejectRefund({
      refundId,
      rejectedBy: userId,
      reason,
    });

    if (!result.success) {
      return sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error rejecting refund:', { error: error instanceof Error ? error.message : String(error) });
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to reject refund', { requestId: getRequestId(req) });
  }
}));

/**
 * @swagger
 * /api/escrow/refunds/{refundId}/withdraw:
 *   post:
 *     summary: Withdraw a pending refund request
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
 *         description: Refund request withdrawn successfully
 */
router.post('/refunds/:refundId/withdraw', authMiddleware, requireVerifiedKyc, validateUUID(['refundId']), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const refundId = req.params['refundId'] ?? '';
    const userId = req.user?.userId ?? '';

    const result = await withdrawRefundRequest(refundId, userId);

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 : result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req) });
    }

    return res.json(result.data);
  } catch (error) {
    logger.error('Error withdrawing refund request:', { error: error instanceof Error ? error.message : String(error) });
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to withdraw refund request', { requestId: getRequestId(req) });
  }
}));

export default router;
