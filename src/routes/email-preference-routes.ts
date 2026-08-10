import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse, sendSuccessResponse } from '../utils/response-helpers.js';
import {
  getEmailPreferences,
  updateEmailPreferences,
  unsubscribeAll,
} from '../services/email-preference-service.js';

const router = Router();

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await getEmailPreferences(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.patch('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const preferences = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await updateEmailPreferences(userId, preferences);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.post('/unsubscribe-all', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', requestId);
    return;
  }

  const result = await unsubscribeAll(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, requestId);
    return;
  }

  sendSuccessResponse(res, 200, { message: 'Unsubscribed from all emails' }, requestId);
});

export default router;
