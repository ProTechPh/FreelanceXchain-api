/**
 * Payment Routes
 * API endpoints for milestone completion, approval, disputes, and payment status
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  requestMilestoneCompletion,
  approveMilestone,
  getContractPaymentStatus,
  getContractPaymentHistory,
} from '../services/payment-service.js';
import { createDispute } from '../services/dispute-service.js';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     MilestoneCompletionResult:
 *       type: object
 *       properties:
 *         milestoneId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [submitted]
 *         notificationSent:
 *           type: boolean
 *     MilestoneApprovalResult:
 *       type: object
 *       properties:
 *         milestoneId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [approved]
 *         paymentReleased:
 *           type: boolean
 *         transactionHash:
 *           type: string
 *         contractCompleted:
 *           type: boolean
 *     MilestoneDisputeResult:
 *       type: object
 *       properties:
 *         milestoneId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [disputed]
 *         disputeId:
 *           type: string
 *         disputeCreated:
 *           type: boolean
 *     ContractPaymentStatus:
 *       type: object
 *       properties:
 *         contractId:
 *           type: string
 *         escrowAddress:
 *           type: string
 *         totalAmount:
 *           type: number
 *         releasedAmount:
 *           type: number
 *         pendingAmount:
 *           type: number
 *         milestones:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               title:
 *                 type: string
 *               amount:
 *                 type: number
 *               status:
 *                 type: string
 *         contractStatus:
 *           type: string
 *     DisputeRequest:
 *       type: object
 *       required:
 *         - reason
 *       properties:
 *         reason:
 *           type: string
 *           description: Reason for disputing the milestone
 *     PaymentHistoryRecord:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         milestoneId:
 *           type: string
 *           nullable: true
 *         payerId:
 *           type: string
 *         payeeId:
 *           type: string
 *         amount:
 *           type: number
 *         currency:
 *           type: string
 *         txHash:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *         paymentType:
 *           type: string
 *           enum: [escrow_deposit, milestone_release, refund, dispute_resolution, rush_fee]
 *         createdAt:
 *           type: string
 *     PaymentHistoryResponse:
 *       type: object
 *       properties:
 *         contractId:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PaymentHistoryRecord'
 */


/**
 * @swagger
 * /api/payments/milestones/{milestoneId}/complete:
 *   post:
 *     summary: Mark milestone as complete
 *     description: Freelancer marks a milestone as complete, triggering employer notification
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The milestone ID (UUID)
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The contract ID (UUID)
 *     responses:
 *       200:
 *         description: Milestone marked as complete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MilestoneCompletionResult'
 *       400:
 *         description: Invalid request or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/complete',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['milestoneId']),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;

      /* istanbul ignore next */
  if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
        return;
      }

      if (!contractId) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId query parameter is required', { requestId: getRequestId(req) });
        return;
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(contractId)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId must be a valid UUID', { requestId: getRequestId(req) });
        return;
      }

      const result = await requestMilestoneCompletion(
        contractId,
        milestoneId,
        userId
      );

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req), details: result.error.details });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  })
);


/**
 * @swagger
 * /api/payments/milestones/{milestoneId}/approve:
 *   post:
 *     summary: Approve milestone completion
 *     description: Employer approves milestone completion, triggering payment release
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The milestone ID (UUID)
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The contract ID (UUID)
 *     responses:
 *       200:
 *         description: Milestone approved and payment released
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MilestoneApprovalResult'
 *       400:
 *         description: Invalid request or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/approve',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['milestoneId']),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;

      /* istanbul ignore next */
  if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
        return;
      }

      if (!contractId) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId query parameter is required', { requestId: getRequestId(req) });
        return;
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(contractId)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId must be a valid UUID', { requestId: getRequestId(req) });
        return;
      }

      const result = await approveMilestone(
        contractId,
        milestoneId,
        userId
      );

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req), details: result.error.details });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  })
);


/**
 * @swagger
 * /api/payments/milestones/{milestoneId}/dispute:
 *   post:
 *     summary: Dispute milestone
 *     description: Either party disputes a milestone, locking funds and creating a dispute record
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The milestone ID (UUID)
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The contract ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisputeRequest'
 *     responses:
 *       200:
 *         description: Dispute created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MilestoneDisputeResult'
 *       400:
 *         description: Invalid request or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/dispute',
  authMiddleware,
  requireVerifiedKyc,
  apiRateLimiter,
  validateUUID(['milestoneId']),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;
      const { reason } = req.body as { reason?: string };

      /* istanbul ignore next */
  if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
        return;
      }

      if (!contractId) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId query parameter is required', { requestId: getRequestId(req) });
        return;
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(contractId)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'contractId must be a valid UUID', { requestId: getRequestId(req) });
        return;
      }

      if (!reason || typeof reason !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'reason is required in request body', { requestId: getRequestId(req) });
        return;
      }

      // Unified with POST /api/disputes: both endpoints go through
      // dispute-service.createDispute so every dispute also marks the milestone
      // Disputed on the escrow contract (real mode), keeping DB and ledger in sync.
      const result = await createDispute({
        contractId,
        milestoneId,
        initiatorId: userId,
        reason,
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 :
                          result.error.code === 'ALREADY_DISPUTED' || result.error.code === 'DUPLICATE_DISPUTE' ? 409 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req), details: result.error.details });
        return;
      }

      res.json({
        status: 'disputed',
        disputeId: result.data.id,
      });
    } catch (error) {
      /* istanbul ignore next */
      next(error);
    }
  })
);


/**
 * @swagger
 * /api/payments/contracts/{contractId}/status:
 *   get:
 *     summary: Get contract payment status
 *     description: Get detailed payment status for a contract including milestone statuses
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The contract ID (UUID)
 *     responses:
 *       200:
 *         description: Contract payment status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContractPaymentStatus'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.get(
  '/contracts/:contractId/status',
  authMiddleware,
  apiRateLimiter,
  validateUUID(['contractId']),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const contractId = req.params['contractId'] ?? '';

      /* istanbul ignore next */
  if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
        return;
      }

      const result = await getContractPaymentStatus(contractId, userId, req.user?.role);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req), details: result.error.details });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  })
);


/**
 * @swagger
 * /api/payments/contracts/{contractId}/history:
 *   get:
 *     summary: Get contract payment history
 *     description: Get the payments log for a contract — every ledger money movement (escrow deposit, milestone release, refund, dispute resolution, rush fee), newest first
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The contract ID (UUID)
 *     responses:
 *       200:
 *         description: Contract payment history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentHistoryResponse'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a party to the contract
 *       404:
 *         description: Contract not found
 */
router.get(
  '/contracts/:contractId/history',
  authMiddleware,
  apiRateLimiter,
  validateUUID(['contractId']),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const contractId = req.params['contractId'] ?? '';

      /* istanbul ignore next */
      if (!userId) {
        sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: getRequestId(req) });
        return;
      }

      const result = await getContractPaymentHistory(contractId, userId, req.user?.role);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: getRequestId(req), details: result.error.details });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  })
);

export default router;
