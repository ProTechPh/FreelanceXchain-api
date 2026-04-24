/**
 * Payment Routes
 * API endpoints for milestone completion, approval, disputes, and payment status
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  _initializeContractEscrow,
  requestMilestoneCompletion,
  approveMilestone,
  getContractPaymentStatus,
} from '../services/payment-service.js';
import { createDispute } from '../services/dispute-service.js';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';

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

      const result = await createDispute({
        contractId,
        milestoneId,
        initiatorId: userId,
        reason
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 : 400;
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.json({
        status: 'disputed',
        disputeId: result.data.id,
      });
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
        // Admin exception: Check if it threw an unauthorized error but the user is an admin
        if (result.error.code === 'UNAUTHORIZED' && req.user?.role === 'admin') {
          // If the user is an admin, we bypass this exact error and manually fetch the info.
          // In an ideal system we'd pass the role directly to `getContractPaymentStatus`,
          // but doing it directly via the same queries here saves refactoring the service payload type

          const { getContractById } = await import('../services/contract-service.js');
          const { getProjectById } = await import('../services/project-service.js');
          const { mapProjectFromEntity } = await import('../utils/entity-mapper.js');

          const contractRes = await getContractById(contractId);
          if (contractRes.success && contractRes.data) {
            const projectRes = await getProjectById(contractRes.data.projectId);
            if (projectRes.success && projectRes.data) {
              const project = mapProjectFromEntity(projectRes.data);

              const totalAmount = contractRes.data.totalAmount;
              const releasedAmount = project.milestones
                .filter(m => m.status === 'approved')
                .reduce((sum, m) => sum + m.amount, 0);

              res.json({
                contractId: contractRes.data.id,
                escrowAddress: contractRes.data.escrowAddress,
                totalAmount,
                releasedAmount,
                pendingAmount: totalAmount - releasedAmount,
                milestones: project.milestones.map(m => ({
                  id: m.id,
                  title: m.title,
                  amount: m.amount,
                  status: m.status,
                })),
                contractStatus: contractRes.data.status,
              });
              return;
            }
          }
        }

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
