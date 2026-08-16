import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { 
  getFreelancerAnalytics, 
  getEmployerAnalytics, 
  getPlatformMetrics,
  getSkillTrends 
} from '../services/analytics-service.js';

const router = Router();

router.get('/freelancer', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const startDate = req.query['startDate'] as string | undefined;
  const endDate = req.query['endDate'] as string | undefined;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getFreelancerAnalytics(userId, { 
    ...(startDate && { startDate }), 
    ...(endDate && { endDate }) 
  });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/employer', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const startDate = req.query['startDate'] as string | undefined;
  const endDate = req.query['endDate'] as string | undefined;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = await getEmployerAnalytics(userId, { 
    ...(startDate && { startDate }), 
    ...(endDate && { endDate }) 
  });

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/skill-trends', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getSkillTrends();
  
  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/platform', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getPlatformMetrics();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
