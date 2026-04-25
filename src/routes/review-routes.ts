import { Router, Request, Response } from 'express';
import { authMiddleware, requireVerifiedKyc } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import {
  submitRating as submitReview,
  getReviewById,
  getUserReviews,
  getProjectReviews,
  canUserRate as canUserReview,
} from '../services/reputation-service.js';

const router = Router();

router.post('/', authMiddleware, requireVerifiedKyc, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const { contractId, rating, comment, workQuality, communication, professionalism, wouldWorkAgain } = req.body;

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const errors: { field: string; message: string }[] = [];
  if (!contractId) errors.push({ field: 'contractId', message: 'Contract ID is required' });
  if (!rating || rating < 1 || rating > 5) errors.push({ field: 'rating', message: 'Rating must be between 1 and 5' });
  if (!comment) errors.push({ field: 'comment', message: 'Comment is required' });

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

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
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(201).json(result.data);
});

router.get('/:id', apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const reviewId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  const result = await getReviewById(reviewId);

  if (!result.success) {
    const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
    res.status(statusCode).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/user/:userId', apiRateLimiter, validateUUID(['userId']), async (req: Request, res: Response) => {
  const userId = req.params['userId'] ?? '';
  const requestId = getRequestId(req);

  const result = await getUserReviews(userId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/project/:projectId', apiRateLimiter, validateUUID(['projectId']), async (req: Request, res: Response) => {
  const projectId = req.params['projectId'] ?? '';
  const requestId = getRequestId(req);

  const result = await getProjectReviews(projectId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/can-review/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const contractId = req.params['contractId'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    res.status(401).json({
      error: { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  const result = await canUserReview(userId, userId, contractId);

  if (!result.success) {
    res.status(400).json({
      error: { code: result.error.code, message: result.error.message },
      timestamp: new Date().toISOString(),
      requestId,
    });
    return;
  }

  res.status(200).json(result.data);
});

export default router;