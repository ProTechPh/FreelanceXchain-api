import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { validateUUID } from '../middleware/validation-middleware.js';
import { apiRateLimiter } from '../middleware/rate-limiter.js';
import { getRequestId } from '../utils/route-helpers.js';
import { sendError, sendServiceError } from '../utils/response.js';
import { clampLimit, clampOffset } from '../utils/index.js';
import { 
  getUserTransactions, 
  getTransactionById, 
  getContractTransactions 
} from '../services/transaction-service.js';

const router = Router();

router.get('/', authMiddleware, apiRateLimiter, async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const requestId = getRequestId(req);
  const limit = clampLimit(req.query['limit'] ? Number(req.query['limit']) : undefined);
  const page = clampOffset(req.query['page'] ? Number(req.query['page']) : undefined);
  const type = req.query['type'] as string | undefined;
  const status = req.query['status'] as string | undefined;

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getUserTransactions(userId, { 
    limit, 
    page, 
    ...(type && { type }), 
    ...(status && { status }) 
  });

  if (!result.success) {
    sendError(res, 400, result.error, requestId);
    return;
  }

  res.status(200).json(result.data);
});

router.get('/:id', authMiddleware, apiRateLimiter, validateUUID(), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const transactionId = req.params['id'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getTransactionById(transactionId, userId);

  if (!result.success) {
    sendServiceError(res, result, requestId, { NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json(result.data);
});

router.get('/contract/:contractId', authMiddleware, apiRateLimiter, validateUUID(['contractId']), async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const contractId = req.params['contractId'] ?? '';
  const requestId = getRequestId(req);

  if (!userId) {
    sendError(res, 401, { code: 'AUTH_UNAUTHORIZED', message: 'User not authenticated' }, requestId);
    return;
  }

  const result = await getContractTransactions(contractId, userId);

  if (!result.success) {
    sendServiceError(res, result, requestId, { CONTRACT_NOT_FOUND: 404, UNAUTHORIZED: 403 });
    return;
  }

  res.status(200).json(result.data);
});

export default router;
