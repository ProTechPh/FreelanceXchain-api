/**
 * Dispute Routes
 * API endpoints for dispute creation, evidence submission, and resolution
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById,
  getDisputesByContract,
} from '../services/dispute-service.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Evidence:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         submitterId:
 *           type: string
 *         type:
 *           type: string
 *           enum: [text, file, link]
 *         content:
 *           type: string
 *         submittedAt:
 *           type: string
 *           format: date-time
 *     DisputeResolution:
 *       type: object
 *       properties:
 *         decision:
 *           type: string
 *           enum: [freelancer_favor, employer_favor, split]
 *         reasoning:
 *           type: string
 *         resolvedBy:
 *           type: string
 *         resolvedAt:
 *           type: string
 *           format: date-time
 *     Dispute:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         contractId:
 *           type: string
 *         milestoneId:
 *           type: string
 *         initiatorId:
 *           type: string
 *         reason:
 *           type: string
 *         evidence:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Evidence'
 *         status:
 *           type: string
 *           enum: [open, under_review, resolved]
 *         resolution:
 *           $ref: '#/components/schemas/DisputeResolution'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateDisputeRequest:
 *       type: object
 *       required:
 *         - contractId
 *         - milestoneId
 *         - reason
 *       properties:
 *         contractId:
 *           type: string
 *         milestoneId:
 *           type: string
 *         reason:
 *           type: string
 *     SubmitEvidenceRequest:
 *       type: object
 *       required:
 *         - type
 *         - content
 *       properties:
 *         type:
 *           type: string
 *           enum: [text, file, link]
 *         content:
 *           type: string
 *     ResolveDisputeRequest:
 *       type: object
 *       required:
 *         - decision
 *         - reasoning
 *       properties:
 *         decision:
 *           type: string
 *           enum: [freelancer_favor, employer_favor, split]
 *         reasoning:
 *           type: string
 */


/**
 * @swagger
 * /api/disputes:
 *   post:
 *     summary: Create a new dispute
 *     description: Create a dispute for a milestone, locking associated funds
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDisputeRequest'
 *     responses:
 *       201:
 *         description: Dispute created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request or milestone already disputed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to create dispute
 *       404:
 *         description: Contract or milestone not found
 */
router.post(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const { contractId, milestoneId, reason } = req.body as {
        contractId?: string;
        milestoneId?: string;
        reason?: string;
      };

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!contractId || typeof contractId !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId is required' },
        });
        return;
      }

      if (!isValidUUID(contractId)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'contractId must be a valid UUID' },
        });
        return;
      }

      if (!milestoneId || typeof milestoneId !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'milestoneId is required' },
        });
        return;
      }

      if (!isValidUUID(milestoneId)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'milestoneId must be a valid UUID' },
        });
        return;
      }

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' },
        });
        return;
      }

      const result = await createDispute({
        contractId,
        milestoneId,
        initiatorId: userId,
        reason,
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 :
                          result.error.code === 'ALREADY_DISPUTED' ? 409 :
                          result.error.code === 'DUPLICATE_DISPUTE' ? 409 : 400;
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  }
);


/**
 * @swagger
 * /api/disputes/{disputeId}:
 *   get:
 *     summary: Get dispute details
 *     description: Get details of a specific dispute
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     responses:
 *       200:
 *         description: Dispute details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Dispute not found
 */
router.get(
  '/:disputeId',
  authMiddleware,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const disputeId = req.params['disputeId'] ?? '';

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      const result = await getDisputeById(disputeId);

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
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
 * /api/disputes/{disputeId}/evidence:
 *   post:
 *     summary: Submit evidence for a dispute
 *     description: Submit evidence to support a dispute case
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitEvidenceRequest'
 *     responses:
 *       200:
 *         description: Evidence submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request, invalid UUID format, or dispute already resolved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to submit evidence
 *       404:
 *         description: Dispute not found
 */
router.post(
  '/:disputeId/evidence',
  authMiddleware,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const disputeId = req.params['disputeId'] ?? '';
      const { type, content } = req.body as {
        type?: 'text' | 'file' | 'link';
        content?: string;
      };

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      if (!type || !['text', 'file', 'link'].includes(type)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'type must be one of: text, file, link' },
        });
        return;
      }

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'content is required' },
        });
        return;
      }

      const result = await submitEvidence({
        disputeId,
        submitterId: userId,
        type,
        content,
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'UNAUTHORIZED' ? 403 :
                          result.error.code === 'INVALID_STATUS' ? 400 : 400;
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
 * /api/disputes/{disputeId}/resolve:
 *   post:
 *     summary: Resolve a dispute (admin only)
 *     description: Admin resolves a dispute, triggering payment based on decision
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The dispute ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResolveDisputeRequest'
 *     responses:
 *       200:
 *         description: Dispute resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid request, invalid UUID format, or dispute already resolved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to resolve disputes
 *       404:
 *         description: Dispute not found
 */
router.post(
  '/:disputeId/resolve',
  authMiddleware,
  validateUUID(['disputeId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      const disputeId = req.params['disputeId'] ?? '';
      const { decision, reasoning } = req.body as {
        decision?: 'freelancer_favor' | 'employer_favor' | 'split';
        reasoning?: string;
      };

      if (!userId) {
        res.status(401).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        });
        return;
      }

      // Only admins can resolve disputes
      if (userRole !== 'admin') {
        res.status(403).json({
          error: { code: 'AUTH_UNAUTHORIZED', message: 'Only administrators can resolve disputes' },
        });
        return;
      }

      if (!decision || !['freelancer_favor', 'employer_favor', 'split'].includes(decision)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'decision must be one of: freelancer_favor, employer_favor, split' },
        });
        return;
      }

      if (!reasoning || typeof reasoning !== 'string') {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reasoning is required' },
        });
        return;
      }

      const result = await resolveDispute({
        disputeId,
        decision,
        reasoning,
        resolvedBy: userId,
        resolverRole: 'admin',
      });

      if (!result.success) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 :
                          result.error.code === 'ALREADY_RESOLVED' ? 400 : 400;
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
 * /api/contracts/{contractId}/disputes:
 *   get:
 *     summary: List disputes for a contract
 *     description: Get all disputes associated with a contract
 *     tags: [Disputes]
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
 *         description: List of disputes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not authorized to view disputes
 *       404:
 *         description: Contract not found
 */
router.get(
  '/contracts/:contractId/disputes',
  authMiddleware,
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

      const result = await getDisputesByContract(contractId, userId);

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
