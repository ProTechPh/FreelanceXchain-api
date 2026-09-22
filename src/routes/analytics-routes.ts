import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { 
  getFreelancerAnalytics, 
  getEmployerAnalytics, 
  getPlatformMetrics,
  getSkillTrends,
  getMarketplaceLiquidityReport,
  getFunnelMetrics,
  getCohortRetentionReport,
  getChurnRiskReport,
  getMarketplaceVelocityReport,
} from '../services/analytics-service.js';
import {
  getAllUserExperiments,
  getRegisteredExperiments,
} from '../services/experiment-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/freelancer', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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
}));

router.get('/employer', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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
}));

router.get('/skill-trends', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getSkillTrends();
  
  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/platform', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getPlatformMetrics();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/liquidity', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getMarketplaceLiquidityReport();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/funnel', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getFunnelMetrics();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/cohorts', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getCohortRetentionReport();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/churn-risk', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getChurnRiskReport();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/velocity', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = await getMarketplaceVelocityReport();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/experiments', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  const result = getAllUserExperiments(userId, userRole);
  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/experiments/catalog', authMiddleware, apiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const result = getRegisteredExperiments();

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

export default router;
