/**
 * Payment Routes
 * API endpoints for milestone completion, approval, disputes, and payment status
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  requestMilestoneCompletion,
  approveMilestone,
  disputeMilestone,
  getContractPaymentStatus,
} from '../services/payment-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

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
 *         description: The milestone ID
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *         description: The contract ID
 *     responses:
 *       200:
 *         description: Milestone marked as complete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MilestoneCompletionResult'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/complete',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!contractId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId query parameter is required' },
        });
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
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
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
 *         description: The milestone ID
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *         description: The contract ID
 *     responses:
 *       200:
 *         description: Milestone approved and payment released
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MilestoneApprovalResult'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/approve',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!contractId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId query parameter is required' },
        });
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
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
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
 *         description: The milestone ID
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *         description: The contract ID
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
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/milestones/:milestoneId/dispute',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const milestoneId = req.params['milestoneId'] ?? '';
      const contractId = req.query['contractId'] as string | undefined;
      const { reason } = req.body as { reason?: string };

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!contractId) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId query parameter is required' },
        });
        return;
      }

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reason is required in request body' },
        });
        return;
      }

      const result = await disputeMilestone(
        contractId,
        milestoneId,
        userId,
        reason
      );

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
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
 *         description: The contract ID
 *     responses:
 *       200:
 *         description: Contract payment status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContractPaymentStatus'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.get(
  '/contracts/:contractId/status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const contractId = req.params['contractId'] ?? '';

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const result = await getContractPaymentStatus(contractId, userId);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json(result.data);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
