import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendError } from '../utils/response.js';
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
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getEmailPreferences(userId);

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.patch('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const preferences = req.body;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await updateEmailPreferences(userId, preferences);

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.post('/unsubscribe-all', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await unsubscribeAll(userId);

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
    return;
  }

  res.status(200).json({ message: 'Unsubscribed from all emails' });
});

export default router;
