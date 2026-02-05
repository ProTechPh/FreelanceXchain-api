import { Router, Request, Response } from 'express';
import { authMiddleware, requireKyc } from '../middleware/auth-middleware';
import { validateUUID, isValidUUID } from '../middleware/validation-middleware';
import {
  submitRating,
  getReputation,
  getWorkHistory,
  canUserRate,
} from '../services/reputation-service';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     BlockchainRating:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         contractId:
 *           type: string
 *         raterId:
 *           type: string
 *         rateeId:
 *           type: string
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         comment:
 *           type: string
 *         timestamp:
 *           type: integer
 *         transactionHash:
 *           type: string
 *     ReputationScore:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *         score:
 *           type: number
 *           description: Weighted average score with time decay
 *         totalRatings:
 *           type: integer
 *         averageRating:
 *           type: number
 *           description: Simple average without time decay
 *         ratings:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlockchainRating'
 *     WorkHistoryEntry:
 *       type: object
 *       properties:
 *         contractId:
 *           type: string
 *         projectId:
 *           type: string
 *         projectTitle:
 *           type: string
 *         role:
 *           type: string
 *           enum: [freelancer, employer]
 *         completedAt:
 *           type: string
 *           format: date-time
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         ratingComment:
 *           type: string
 *     RatingInput:
 *       type: object
 *       required:
 *         - contractId
 *         - rateeId
 *         - rating
 *       properties:
 *         contractId:
 *           type: string
 *         rateeId:
 *           type: string
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         comment:
 *           type: string
 */


/**
 * @swagger
 * /api/reputation/{userId}:
 *   get:
 *     summary: Get user reputation
 *     description: Retrieves the reputation score and ratings for a user from the blockchain
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to get reputation for (UUID)
 *     responses:
 *       200:
 *         description: Reputation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReputationScore'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: User not found
 */
router.get('/:userId', validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'User ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getReputation(userId);

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
 * /api/reputation/rate:
 *   post:
 *     summary: Submit rating
 *     description: Submit a rating for another user after contract completion. Rating must be between 1 and 5.
 *     tags:
 *       - Reputation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RatingInput'
 *     responses:
 *       201:
 *         description: Rating submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rating:
 *                   $ref: '#/components/schemas/BlockchainRating'
 *                 transactionHash:
 *                   type: string
 *       400:
 *         description: Invalid rating or validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 *       409:
 *         description: Duplicate rating
 */
router.post('/rate', authMiddleware, requireKyc, async (req: Request, res: Response) => {
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

  const { contractId, rateeId, rating, comment } = req.body as {
    contractId?: string;
    rateeId?: string;
    rating?: number;
    comment?: string;
  };

  // Validate required fields
  const missingFields: string[] = [];
  if (!contractId) missingFields.push('contractId');
  if (!rateeId) missingFields.push('rateeId');
  if (rating === undefined || rating === null) missingFields.push('rating');

  if (missingFields.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        details: missingFields,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  // Validate UUID format
  const uuidErrors: { field: string; message: string }[] = [];
  if (contractId && !isValidUUID(contractId)) {
    uuidErrors.push({ field: 'contractId', message: 'contractId must be a valid UUID' });
  }
  if (rateeId && !isValidUUID(rateeId)) {
    uuidErrors.push({ field: 'rateeId', message: 'rateeId must be a valid UUID' });
  }

  if (uuidErrors.length > 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid UUID format',
        details: uuidErrors,
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await submitRating({
    contractId: contractId!,
    raterId: userId,
    rateeId: rateeId!,
    rating: rating!,
    comment,
  });

  if (!result.success) {
    let statusCode = 400;
    if (result.error.code === 'NOT_FOUND') statusCode = 404;
    if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
    if (result.error.code === 'DUPLICATE_RATING') statusCode = 409;

    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});


/**
 * @swagger
 * /api/reputation/{userId}/history:
 *   get:
 *     summary: Get work history
 *     description: Retrieves the work history for a user including completed contracts and ratings
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to get work history for (UUID)
 *     responses:
 *       200:
 *         description: Work history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkHistoryEntry'
 *       400:
 *         description: Invalid UUID format
 *       404:
 *         description: User not found
 */
router.get('/:userId/history', validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  if (!userId) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'User ID is required' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await getWorkHistory(userId);

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
 * /api/reputation/can-rate:
 *   get:
 *     summary: Check if user can rate
 *     description: Check if the authenticated user can rate another user for a specific contract
 *     tags:
 *       - Reputation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract ID
 *       - in: query
 *         name: rateeId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to rate
 *     responses:
 *       200:
 *         description: Check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canRate:
 *                   type: boolean
 *                 reason:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/can-rate', authMiddleware, requireKyc, async (req: Request, res: Response) => {
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

  const contractId = req.query['contractId'] as string | undefined;
  const rateeId = req.query['rateeId'] as string | undefined;

  if (!contractId || !rateeId) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'contractId and rateeId are required query parameters',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await canUserRate(userId, rateeId, contractId);

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

export default router;
