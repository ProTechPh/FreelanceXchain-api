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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const transactionRouter = (await import('../../routes/transaction-routes.js')).default;

function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockTransactionService = { getUserTransactions: mockGetUserTransactions, getTransactionById: mockGetTransactionById, getContractTransactions: mockGetContractTransactions };

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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('transaction-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/transactions', transactionRouter);
  });

  it('GET / with type and status filters', async () => {
    mockTransactionService.getUserTransactions.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/transactions?type=payment&status=completed');
    expect(res.status).toBe(200);
  });

  it('GET / without type/status (spread skipped)', async () => {
    mockTransactionService.getUserTransactions.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(200);
  });

  it('GET / with limit and page', async () => {
    mockTransactionService.getUserTransactions.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/transactions?limit=5&page=10');
    expect(res.status).toBe(200);
  });

  it('GET / error', async () => {
    mockTransactionService.getUserTransactions.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(400);
  });

  it('GET /:id success', async () => {
    mockTransactionService.getTransactionById.mockResolvedValue(ok({ id: 't1' }));
    const res = await request(app).get('/api/transactions/t1');
    expect(res.status).toBe(200);
  });

  it('GET /:id NOT_FOUND returns 404', async () => {
    mockTransactionService.getTransactionById.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/transactions/t1');
    expect(res.status).toBe(404);
  });

  it('GET /:id UNAUTHORIZED returns 403', async () => {
    mockTransactionService.getTransactionById.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/api/transactions/t1');
    expect(res.status).toBe(403);
  });

  it('GET /:id other error returns 400', async () => {
    mockTransactionService.getTransactionById.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/transactions/t1');
    expect(res.status).toBe(400);
  });

  it('GET /contract/:contractId success', async () => {
    mockTransactionService.getContractTransactions.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/transactions/contract/c1');
    expect(res.status).toBe(200);
  });

  it('GET /contract/:contractId CONTRACT_NOT_FOUND returns 404', async () => {
    mockTransactionService.getContractTransactions.mockResolvedValue(fail('CONTRACT_NOT_FOUND', 'No'));
    const res = await request(app).get('/api/transactions/contract/c1');
    expect(res.status).toBe(404);
  });

  it('GET /contract/:contractId UNAUTHORIZED returns 403', async () => {
    mockTransactionService.getContractTransactions.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/api/transactions/contract/c1');
    expect(res.status).toBe(403);
  });

  it('GET /contract/:contractId other error returns 400', async () => {
    mockTransactionService.getContractTransactions.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/transactions/contract/c1');
    expect(res.status).toBe(400);
  });
});

describe('transaction-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockGetTransactionById = jest.fn<any>();
  const mockGetContractTransactions = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
      getUserTransactions: jest.fn(),
      getTransactionById: mockGetTransactionById,
      getContractTransactions: mockGetContractTransactions,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/transaction-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/transactions', router);
    jest.clearAllMocks();
  });

  it('L53: GET /:id', async () => {
    mockGetTransactionById.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/transactions/t1');
    expect(res.status).toBe(200);
  });

  it('L82: GET /contract/:contractId', async () => {
    mockGetContractTransactions.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/transactions/contract/c1');
    expect(res.status).toBe(200);
  });
});
