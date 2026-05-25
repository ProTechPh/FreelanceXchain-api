// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUserTransactions = jest.fn() as any;
const mockGetTransactionById = jest.fn() as any;
const mockGetContractTransactions = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
  getUserTransactions: mockGetUserTransactions,
  getTransactionById: mockGetTransactionById,
  getContractTransactions: mockGetContractTransactions,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const transactionRouter = (await import('../../routes/transaction-routes.js')).default;

describe('Transaction Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionRouter);
  });

  describe('GET / - Get User Transactions', () => {
    it('should return user transactions', async () => {
      const transactions = [
        { id: 'tx-1', type: 'payment', amount: 100, status: 'completed' },
        { id: 'tx-2', type: 'escrow', amount: 500, status: 'pending' },
      ];
      mockGetUserTransactions.mockResolvedValue({ success: true, data: transactions });

      const res = await request(app).get('/api/transactions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockGetUserTransactions).toHaveBeenCalledWith('user-1', expect.objectContaining({
        limit: expect.any(Number),
        page: expect.any(Number),
      }));
    });

    it('should pass pagination and filter parameters', async () => {
      mockGetUserTransactions.mockResolvedValue({ success: true, data: [] });

      await request(app).get('/api/transactions?limit=10&page=2&type=payment&status=completed');

      expect(mockGetUserTransactions).toHaveBeenCalledWith('user-1', expect.objectContaining({
        limit: 10,
        page: 2,
        type: 'payment',
        status: 'completed',
      }));
    });

    it('should handle type filter only', async () => {
      mockGetUserTransactions.mockResolvedValue({ success: true, data: [] });

      await request(app).get('/api/transactions?type=escrow');

      expect(mockGetUserTransactions).toHaveBeenCalledWith('user-1', expect.objectContaining({
        type: 'escrow',
      }));
    });

    it('should handle status filter only', async () => {
      mockGetUserTransactions.mockResolvedValue({ success: true, data: [] });

      await request(app).get('/api/transactions?status=pending');

      expect(mockGetUserTransactions).toHaveBeenCalledWith('user-1', expect.objectContaining({
        status: 'pending',
      }));
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/transactions');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetUserTransactions.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/transactions');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /:id - Get Transaction by ID', () => {
    const transactionId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return a transaction by ID', async () => {
      const transaction = { id: transactionId, type: 'payment', amount: 100, status: 'completed' };
      mockGetTransactionById.mockResolvedValue({ success: true, data: transaction });

      const res = await request(app).get(`/api/transactions/${transactionId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(transactionId);
      expect(mockGetTransactionById).toHaveBeenCalledWith(transactionId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get(`/api/transactions/${transactionId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when transaction not found', async () => {
      mockGetTransactionById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transaction not found' },
      });

      const res = await request(app).get(`/api/transactions/${transactionId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is unauthorized', async () => {
      mockGetTransactionById.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to view this transaction' },
      });

      const res = await request(app).get(`/api/transactions/${transactionId}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockGetTransactionById.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/transactions/${transactionId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /contract/:contractId - Get Contract Transactions', () => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return contract transactions', async () => {
      const transactions = [
        { id: 'tx-1', type: 'escrow_deposit', amount: 500 },
        { id: 'tx-2', type: 'milestone_release', amount: 200 },
      ];
      mockGetContractTransactions.mockResolvedValue({ success: true, data: transactions });

      const res = await request(app).get(`/api/transactions/contract/${contractId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockGetContractTransactions).toHaveBeenCalledWith(contractId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get(`/api/transactions/contract/${contractId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when contract not found', async () => {
      mockGetContractTransactions.mockResolvedValue({
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app).get(`/api/transactions/contract/${contractId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return 403 when user is unauthorized', async () => {
      mockGetContractTransactions.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to view contract transactions' },
      });

      const res = await request(app).get(`/api/transactions/contract/${contractId}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockGetContractTransactions.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/transactions/contract/${contractId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});
