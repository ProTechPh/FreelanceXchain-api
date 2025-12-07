import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import {
  getContractById,
  getUserContracts,
} from '../services/contract-service.js';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Contract:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         projectId:
 *           type: string
 *         proposalId:
 *           type: string
 *         freelancerId:
 *           type: string
 *         employerId:
 *           type: string
 *         escrowAddress:
 *           type: string
 *         totalAmount:
 *           type: number
 *         status:
 *           type: string
 *           enum: [active, completed, disputed, cancelled]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/contracts:
 *   get:
 *     summary: List user's contracts
 *     description: Retrieves all contracts for the authenticated user (as freelancer or employer)
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page
 *       - in: query
 *         name: continuationToken
 *         schema:
 *           type: string
 *         description: Token for pagination
 *     responses:
 *       200:
 *         description: Contracts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contract'
 *                 hasMore:
 *                   type: boolean
 *                 continuationToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const limit = req.query['limit'] ? Number(req.query['limit']) : 20;
  const continuationToken = req.query['continuationToken'] as string | undefined;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const options: { maxItemCount: number; continuationToken?: string } = { maxItemCount: limit };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }

  const result = await getUserContracts(userId, options);

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
 * /api/contracts/{id}:
 *   get:
 *     summary: Get contract details
 *     description: Retrieves details of a specific contract
 *     tags:
 *       - Contracts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract ID
 *     responses:
 *       200:
 *         description: Contract retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = req.params['id'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  const result = await getContractById(id);

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

export default router;
