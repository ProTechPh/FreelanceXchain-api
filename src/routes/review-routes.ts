import { Router, Request, Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validate, validateUUID, validateAppwriteDocumentId, submitReviewSchema } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import {
  submitRating as submitReview,
  getReviewById,
  getUserReviews,
  getProjectReviews,
  canUserRate as canUserReview,
} from '../services/reputation-service.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/', authMiddleware, requireVerifiedKyc, apiRateLimiter, validate(submitReviewSchema), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const { contractId, rating, comment, workQuality, communication, professionalism, wouldWorkAgain } = req.body;

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  // Field validation is handled by the middleware (submitReviewSchema).
  const result = await submitReview({
    contractId,
    raterId: userId,
    rating,
    comment,
    workQuality,
    communication,
    professionalism,
    wouldWorkAgain,
  });

  if (!result.success) {
    const statusCode = result.error.code === 'NOT_FOUND' ? 404 : result.error.code === 'UNAUTHORIZED' ? 403 : result.error.code === 'DUPLICATE_RATING' ? 409 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(201).json(result.data);
}));

router.get('/:id', apiRateLimiter, validateAppwriteDocumentId(), asyncHandler(async (req: Request, res: Response) => {
  const reviewId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  const result = await getReviewById(reviewId);

  if (!result.success) {
    const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
    sendErrorResponse(res, statusCode, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/user/:userId', apiRateLimiter, validateAppwriteDocumentId(['userId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = getRequestId(req);

  const result = await getUserReviews(userId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/project/:projectId', apiRateLimiter, validateUUID(['projectId']), asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params['projectId'] ?? '';
  const requestId = getRequestId(req);

  const result = await getProjectReviews(projectId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

router.get('/can-review/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const contractId = req.params['contractId'] ?? '';
  const rateeId = req.query['rateeId'] as string | undefined;
  const requestId = getRequestId(req);

  if (!userId) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'User not authenticated', { requestId });
    return;
  }

  if (!rateeId) {
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'rateeId query parameter is required', { requestId });
    return;
  }

  const result = await canUserReview(userId, rateeId, contractId);

  if (!result.success) {
    sendErrorResponse(res, 400, result.error.code, result.error.message, { requestId });
    return;
  }

  res.status(200).json(result.data);
}));

export default router;