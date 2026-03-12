import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import {
  getAggregatedScore,
  getReputationBreakdown,
  getReputationHistory,
  getReputationLeaderboard,
} from '../services/reputation-aggregation-service.js';

const router = Router();

/**
 * @swagger
 * /api/reputation/{userId}/score:
 *   get:
 *     summary: Get aggregated reputation score
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Aggregated reputation score
 */
router.get('/:userId/score', validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.params['userId'] ?? '';

    const result = await getAggregatedScore(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting reputation score:', error);
    return res.status(500).json({ error: 'Failed to get reputation score' });
  }
});

/**
 * @swagger
 * /api/reputation/{userId}/breakdown:
 *   get:
 *     summary: Get reputation breakdown
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reputation breakdown by stars
 */
router.get('/:userId/breakdown', validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.params['userId'] ?? '';

    const result = await getReputationBreakdown(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting reputation breakdown:', error);
    return res.status(500).json({ error: 'Failed to get reputation breakdown' });
  }
});

/**
 * @swagger
 * /api/reputation/{userId}/history:
 *   get:
 *     summary: Get reputation history over time
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 12
 *     responses:
 *       200:
 *         description: Reputation history
 */
router.get('/:userId/history', validateUUID(), apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.params['userId'] ?? '';
    const months = parseInt(req.query['months'] as string) || 12;

    const result = await getReputationHistory(userId, months);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting reputation history:', error);
    return res.status(500).json({ error: 'Failed to get reputation history' });
  }
});

/**
 * @swagger
 * /api/reputation/leaderboard:
 *   get:
 *     summary: Get platform leaderboard
 *     tags:
 *       - Reputation
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Top rated users
 */
router.get('/leaderboard', apiRateLimiter, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 10;

    const result = await getReputationLeaderboard(limit);

    if (!result.success) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.json(result.data);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

export default router;
