import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';

import {
  requestRushUpgrade,
  respondToRushUpgrade,
  acceptCounterOffer,
  declineCounterOffer,
  getRushUpgradeRequestsByContract,
} from '../services/rush-upgrade-service.js';

const router = Router();

/**
 * @swagger
 * /api/contracts/{id}/rush-upgrade:
 *   post:
 *     summary: Request rush upgrade
 *     description: Employer requests a rush upgrade on an active contract with a proposed rush fee percentage (employer only)
 *     tags:
 *       - Rush Upgrade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Contract ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proposedPercentage
 *             properties:
 *               proposedPercentage:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 100
 *                 description: Proposed rush fee percentage
 *     responses:
 *       201:
 *         description: Rush upgrade request created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Contract not found
 *       409:
 *         description: Pending request already exists or contract already rush
 */
router.post('/contracts/:id/rush-upgrade', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const requestId = getRequestId(req);
    const { proposedPercentage } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    if (!proposedPercentage || typeof proposedPercentage !== 'number' || proposedPercentage <= 0 || proposedPercentage > 100) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Proposed percentage must be between 0.01 and 100' },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    const result = await requestRushUpgrade(userId, { contractId, proposedPercentage });

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
      if (result.error.code === 'PENDING_REQUEST_EXISTS' || result.error.code === 'ALREADY_RUSH') statusCode = 409;

      return res.status(statusCode).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    return res.status(201).json(result.data);
  } catch (error) {
    console.error('Error requesting rush upgrade:', error);
    return res.status(500).json({ error: 'Failed to request rush upgrade' });
  }
});

/**
 * @swagger
 * /api/rush-upgrade-requests/{id}/respond:
 *   post:
 *     summary: Respond to rush upgrade request
 *     description: Freelancer responds to a rush upgrade request (accept, decline, or counter-offer)
 *     tags:
 *       - Rush Upgrade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Rush upgrade request ID (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accept, decline, counter_offer]
 *               counterPercentage:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 100
 *                 description: Required when action is counter_offer
 *     responses:
 *       200:
 *         description: Response recorded successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 */
router.post('/rush-upgrade-requests/:id/respond', authMiddleware, requireRole('freelancer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);
    const { action, counterPercentage } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    if (!action || !['accept', 'decline', 'counter_offer'].includes(action)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Action must be accept, decline, or counter_offer' },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    if (action === 'counter_offer' && (!counterPercentage || typeof counterPercentage !== 'number' || counterPercentage <= 0 || counterPercentage > 100)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Counter percentage must be between 0.01 and 100' },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    const result = await respondToRushUpgrade(userId, {
      requestId: requestIdParam,
      action,
      counterPercentage,
    });

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return res.status(statusCode).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    // If accepted, the result includes both request and contract
    const data = result.data as any;
    if (data.contract) {
      return res.status(200).json({
        request: data.request,
        contract: data.contract,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error responding to rush upgrade:', error);
    return res.status(500).json({ error: 'Failed to respond to rush upgrade' });
  }
});

/**
 * @swagger
 * /api/rush-upgrade-requests/{id}/accept-counter:
 *   post:
 *     summary: Accept counter-offer
 *     description: Employer accepts freelancer's counter-offer for rush upgrade
 *     tags:
 *       - Rush Upgrade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Rush upgrade request ID (UUID)
 *     responses:
 *       200:
 *         description: Counter-offer accepted, rush fee applied
 *       400:
 *         description: Invalid request status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 */
router.post('/rush-upgrade-requests/:id/accept-counter', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);

    if (!userId) {
      return res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    const result = await acceptCounterOffer(userId, requestIdParam);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return res.status(statusCode).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error('Error accepting counter-offer:', error);
    return res.status(500).json({ error: 'Failed to accept counter-offer' });
  }
});

/**
 * @swagger
 * /api/rush-upgrade-requests/{id}/decline-counter:
 *   post:
 *     summary: Decline counter-offer
 *     description: Employer declines freelancer's counter-offer for rush upgrade
 *     tags:
 *       - Rush Upgrade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Rush upgrade request ID (UUID)
 *     responses:
 *       200:
 *         description: Counter-offer declined
 *       400:
 *         description: Invalid request status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 */
router.post('/rush-upgrade-requests/:id/decline-counter', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);

    if (!userId) {
      return res.status(401).json({
        error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    const result = await declineCounterOffer(userId, requestIdParam);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return res.status(statusCode).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error('Error declining counter-offer:', error);
    return res.status(500).json({ error: 'Failed to decline counter-offer' });
  }
});

/**
 * @swagger
 * /api/contracts/{id}/rush-upgrade-requests:
 *   get:
 *     summary: List rush upgrade requests for a contract
 *     description: Get all rush upgrade requests for a specific contract (contract parties only)
 *     tags:
 *       - Rush Upgrade
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Contract ID (UUID)
 *     responses:
 *       200:
 *         description: Rush upgrade requests retrieved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Contract not found
 */
router.get('/contracts/:id/rush-upgrade-requests', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] ?? '';
    const xRequestId = getRequestId(req);

    const result = await getRushUpgradeRequestsByContract(contractId);

    if (!result.success) {
      return res.status(400).json({
        error: { code: result.error.code, message: result.error.message },
        timestamp: new Date().toISOString(),
        requestId: xRequestId,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error('Error getting rush upgrade requests:', error);
    return res.status(500).json({ error: 'Failed to get rush upgrade requests' });
  }
});

export default router;
