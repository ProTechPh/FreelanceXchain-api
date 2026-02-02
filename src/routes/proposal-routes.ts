import { Router, Request, Response } from 'express';
import { authMiddleware, requireKyc, requireRole } from '../middleware/auth-middleware.js';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware.js';
import {
  submitProposal,
  getProposalById,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} from '../services/proposal-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Proposal:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         projectId:
 *           type: string
 *         freelancerId:
 *           type: string
 *         coverLetter:
 *           type: string
 *         proposedRate:
 *           type: number
 *         estimatedDuration:
 *           type: number
 *           description: Duration in days
 *         status:
 *           type: string
 *           enum: [pending, accepted, rejected, withdrawn]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */


/**
 * @swagger
 * /api/proposals:
 *   post:
 *     summary: Submit proposal
 *     description: Submit a proposal for a project (freelancer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - coverLetter
 *               - proposedRate
 *               - estimatedDuration
 *             properties:
 *               projectId:
 *                 type: string
 *               coverLetter:
 *                 type: string
 *                 minLength: 10
 *               proposedRate:
 *                 type: number
 *                 minimum: 1
 *               estimatedDuration:
 *                 type: number
 *                 minimum: 1
 *                 description: Duration in days
 *     responses:
 *       201:
 *         description: Proposal submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       409:
 *         description: Duplicate proposal
 */
router.post('/', authMiddleware, requireKyc, requireRole('freelancer'), async (req: Request, res: Response) => {
  const { projectId, coverLetter, proposedRate, estimatedDuration } = req.body;
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Validate input
  const errors: { field: string; message: string }[] = [];
  if (!projectId || typeof projectId !== 'string') {
    errors.push({ field: 'projectId', message: 'Project ID is required' });
  } else if (!isValidUUID(projectId)) {
    errors.push({ field: 'projectId', message: 'Project ID must be a valid UUID' });
  }
  if (!coverLetter || typeof coverLetter !== 'string' || coverLetter.trim().length < 10) {
    errors.push({ field: 'coverLetter', message: 'Cover letter must be at least 10 characters' });
  }
  if (!proposedRate || typeof proposedRate !== 'number' || proposedRate < 1) {
    errors.push({ field: 'proposedRate', message: 'Proposed rate must be at least 1' });
  }
  if (!estimatedDuration || typeof estimatedDuration !== 'number' || estimatedDuration < 1) {
    errors.push({ field: 'estimatedDuration', message: 'Estimated duration must be at least 1 day' });
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await submitProposal(userId, { projectId, coverLetter, proposedRate, estimatedDuration });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'DUPLICATE_PROPOSAL') statusCode = 409;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data.proposal);
});


/**
 * @swagger
 * /api/proposals/{id}:
 *   get:
 *     summary: Get proposal details
 *     description: Retrieves details of a specific proposal
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.get('/:id', authMiddleware, requireKyc, validateUUID(), async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getProposalById(id);

  if (!result.success) {
    res.status(404).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

/**
 * @swagger
 * /api/proposals/freelancer/me:
 *   get:
 *     summary: Get my proposals
 *     description: Retrieves all proposals submitted by the authenticated freelancer
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Proposals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Proposal'
 *       401:
 *         description: Unauthorized
 */
router.get('/freelancer/me', authMiddleware, requireKyc, requireRole('freelancer'), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getProposalsByFreelancer(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});


/**
 * @swagger
 * /api/proposals/{id}/accept:
 *   post:
 *     summary: Accept proposal
 *     description: Accept a proposal and create a contract (employer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 proposal:
 *                   $ref: '#/components/schemas/Proposal'
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/accept', authMiddleware, requireKyc, requireRole('employer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await acceptProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json({
    proposal: result.data.proposal,
    contract: result.data.contract,
  });
});

/**
 * @swagger
 * /api/proposals/{id}/reject:
 *   post:
 *     summary: Reject proposal
 *     description: Reject a proposal (employer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/reject', authMiddleware, requireKyc, requireRole('employer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await rejectProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data.proposal);
});


/**
 * @swagger
 * /api/proposals/{id}/withdraw:
 *   post:
 *     summary: Withdraw proposal
 *     description: Withdraw a pending proposal (freelancer only)
 *     tags:
 *       - Proposals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Proposal ID (UUID)
 *     responses:
 *       200:
 *         description: Proposal withdrawn successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Invalid proposal status or UUID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Proposal not found
 */
router.post('/:id/withdraw', authMiddleware, requireKyc, requireRole('freelancer'), validateUUID(), async (req: Request, res: Response) => {
  const proposalId = req.params['id'] ?? '';
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await withdrawProposal(proposalId, userId);

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
