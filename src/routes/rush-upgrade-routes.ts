import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { logger } from '../config/logger.js';

import {
  requestRushUpgrade,
  respondToRushUpgrade,
  acceptCounterOffer,
  declineCounterOffer,
  payRushUpgradeFee,
  getRushUpgradeRequestsForContract,
} from '../services/rush-upgrade-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();
function hasMoreThanTwoDecimals(value: number): boolean {
  const decimalStr = value.toString().split('.')[1];
  return decimalStr !== undefined && decimalStr.length > 2;
}



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
router.post('/contracts/:id/rush-upgrade', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const requestId = getRequestId(req);
    const { proposedPercentage } = req.body;

    /* istanbul ignore next */

    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    }

    if (!proposedPercentage || typeof proposedPercentage !== 'number' || proposedPercentage <= 0 || proposedPercentage > 100 || hasMoreThanTwoDecimals(proposedPercentage)) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Proposed percentage must be between 0.01 and 100', { requestId });
    }

    const result = await requestRushUpgrade(userId, { contractId, proposedPercentage });

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;
      if (result.error.code === 'PENDING_REQUEST_EXISTS' || result.error.code === 'ALREADY_RUSH') statusCode = 409;

      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    }

    return res.status(201).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error requesting rush upgrade', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to request rush upgrade', { requestId: getRequestId(req) });
  }
}));

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
router.post('/rush-upgrade-requests/:id/respond', authMiddleware, requireRole('freelancer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);
    const { action, counterPercentage } = req.body;

    /* istanbul ignore next */

    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: xRequestId });
    }

    if (!action || !['accept', 'decline', 'counter_offer'].includes(action)) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Action must be accept, decline, or counter_offer', { requestId: xRequestId });
    }

    if (action === 'counter_offer' && (!counterPercentage || typeof counterPercentage !== 'number' || counterPercentage <= 0 || counterPercentage > 100 || hasMoreThanTwoDecimals(counterPercentage))) {
      return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Counter percentage must be between 0.01 and 100', { requestId: xRequestId });
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

      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: xRequestId });
    }

    // If accepted, the result includes both request and contract
    if ('contract' in result.data) {
      return res.status(200).json({
        request: result.data.request,
        contract: result.data.contract,
      });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error responding to rush upgrade', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to respond to rush upgrade', { requestId: getRequestId(req) });
  }
}));

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
router.post('/rush-upgrade-requests/:id/accept-counter', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);
    const transactionHash = typeof req.body?.['transactionHash'] === 'string' && req.body['transactionHash'] ? req.body['transactionHash'] : undefined;

    /* istanbul ignore next */

    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: xRequestId });
    }

    const result = await acceptCounterOffer(userId, requestIdParam, transactionHash ? { transactionHash } : undefined);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: xRequestId });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error accepting counter-offer', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to accept counter-offer', { requestId: getRequestId(req) });
  }
}));

/**
 * @swagger
 * /api/rush-upgrade-requests/{id}/pay:
 *   post:
 *     summary: Pay rush fee for accepted rush upgrade
 *     description: Employer pays the rush fee on-chain via MetaMask and registers the payment
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
 *         description: Rush fee paid and applied to contract
 *       400:
 *         description: Invalid request status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 */
router.post('/rush-upgrade-requests/:id/pay', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);
    const transactionHash = typeof req.body?.['transactionHash'] === 'string' && req.body['transactionHash'] ? req.body['transactionHash'] : undefined;

    /* istanbul ignore next */

    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: xRequestId });
    }

    const result = await payRushUpgradeFee(userId, { requestId: requestIdParam, transactionHash });

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: xRequestId });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error paying rush fee', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to pay rush fee', { requestId: getRequestId(req) });
  }
}));

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
router.post('/rush-upgrade-requests/:id/decline-counter', authMiddleware, requireRole('employer'), requireVerifiedKyc, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const requestIdParam = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);

    /* istanbul ignore next */

    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: xRequestId });
    }

    const result = await declineCounterOffer(userId, requestIdParam);

    if (!result.success) {
      let statusCode = 400;
      if (result.error.code === 'NOT_FOUND') statusCode = 404;
      if (result.error.code === 'UNAUTHORIZED') statusCode = 403;

      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: xRequestId });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error declining counter-offer', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to decline counter-offer', { requestId: getRequestId(req) });
  }
}));

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
router.get('/contracts/:id/rush-upgrade-requests', authMiddleware, apiRateLimiter, validateUUID(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const contractId = req.params['id'] ?? '';
    const userId = req.user?.userId;
    const xRequestId = getRequestId(req);

    // M11: Verify the user is a party to the contract before returning rush upgrade requests
    if (!userId) {
      return sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId: xRequestId });
    }

    const result = await getRushUpgradeRequestsForContract(contractId, userId, req.user?.role === 'admin');

    if (!result.success) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 : result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId: xRequestId });

    }

    return res.status(200).json(result.data);
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Error getting rush upgrade requests', error);
    return sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to get rush upgrade requests', { requestId: getRequestId(req) });
  }
}));

export default router;
