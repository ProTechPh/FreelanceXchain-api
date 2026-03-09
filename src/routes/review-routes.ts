import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { clampLimit, clampOffset } from '../utils/index.js';
import { ReviewService } from '../services/review-service.js';

const router = Router();

/**
 * @swagger
 * /api/reviews/{contractId}:
 *   post:
 *     summary: Submit a review for a completed contract
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review submitted successfully
 *       400:
 *         description: Invalid input or rating
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not part of contract, or cannot review)
 *       404:
 *         description: Contract not found
 */
router.post('/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const reviewerId = req.user!.id;
    const contractId = req.params.contractId as string;
    const { rating, comment } = req.body;

    // FIXED: Added Number.isInteger check to reject fractional ratings (e.g. 3.7)
    if (rating === undefined || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      return;
    }

    const review = await ReviewService.submitReview({
      contractId,
      reviewerId,
      rating,
      comment
    });

    res.status(201).json(review);
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'User is not part of this contract') {
      res.status(403).json({ error: error.message });
    } else if (error.message === 'Can only review completed contracts') {
      res.status(400).json({ error: error.message });
    } else if (error.message === 'You have already reviewed this contract') {
      res.status(400).json({ error: error.message });
    } else {
      console.error('Error submitting review:', error);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  }
});

/**
 * @swagger
 * /api/reviews/{contractId}:
 *   get:
 *     summary: Get reviews for a specific contract
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of reviews for the contract
 *       404:
 *         description: Contract not found
 */
router.get('/:contractId', apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const contractId = req.params.contractId as string;
    const reviews = await ReviewService.getReviewsByContract(contractId);
    res.json(reviews);
  } catch (error: any) {
    console.error('Error fetching reviews for contract:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * @swagger
 * /api/reviews/user/{userId}:
 *   get:
 *     summary: Get reviews received by a user
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of user reviews
 */
router.get('/user/:userId', apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const limit = clampLimit(Number(req.query.limit));
    const offset = clampOffset(Number(req.query.offset));

    const reviews = await ReviewService.getUserReviews(userId, { limit, offset });
    res.json(reviews);
  } catch (error: any) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({ error: 'Failed to fetch user reviews' });
  }
});

/**
 * @swagger
 * /api/reviews/user/{userId}/summary:
 *   get:
 *     summary: Get user rating summary and recent reviews
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User rating summary
 */
router.get('/user/:userId/summary', apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const summary = await ReviewService.getUserRatingSummary(userId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching user rating summary:', error);
    res.status(500).json({ error: 'Failed to fetch user rating summary' });
  }
});

/**
 * @swagger
 * /api/reviews/{contractId}/can-review:
 *   get:
 *     summary: Check if the current user can review a contract
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Check result
 */
router.get('/:contractId/can-review', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const contractId = req.params.contractId as string;

    const canReview = await ReviewService.canReview(contractId, userId);
    res.json({ canReview });
  } catch (error: any) {
    if (error.message === 'Contract not found') {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error checking review eligibility:', error);
      res.status(500).json({ error: 'Failed to check review eligibility' });
    }
  }
});

export default router;