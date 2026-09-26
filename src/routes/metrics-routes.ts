import { Router, Request, Response } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import {
  getAllSliSummaries,
  getSliSummary,
  type SliRouteClass,
} from '../services/sli-metrics-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

const VALID_CLASSES: SliRouteClass[] = ['dashboard', 'contracts', 'global'];

/**
 * @swagger
 * /api/metrics/sli:
 *   get:
 *     summary: Get SLO/SLI metrics (availability + latency budgets)
 *     description: Returns the availability SLI and p50/p95/p99 latency per endpoint class, as defined in docs/reliability/slo.md. Admin only.
 *     tags:
 *       - Metrics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: class
 *         required: false
 *         schema:
 *           type: string
 *           enum: [dashboard, contracts, global]
 *     responses:
 *       200:
 *         description: SLI summary (single class when ?class= is given, otherwise all classes)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin required)
 */
router.get('/sli', authMiddleware, requirePermission('system:view'), apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const requestedClass = req.query['class'] as SliRouteClass | undefined;

  if (requestedClass !== undefined && !VALID_CLASSES.includes(requestedClass)) {
    sendErrorResponse(res, 400, 'INVALID_CLASS', 'class must be dashboard, contracts, or global', { requestId });
    return;
  }

  const data = requestedClass ? getSliSummary(requestedClass) : getAllSliSummaries();
  res.status(200).json(data);
}));

export default router;
