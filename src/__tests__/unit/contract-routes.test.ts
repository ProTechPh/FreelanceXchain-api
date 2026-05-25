// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetContractById = jest.fn<any>();
const mockGetUserContracts = jest.fn<any>();
const mockUpdateContractStatus = jest.fn<any>();
const mockCancelPendingContract = jest.fn<any>();
const mockGetContractWalletAddresses = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/contract-service.ts'), () => ({
  getContractById: mockGetContractById,
  getUserContracts: mockGetUserContracts,
  updateContractStatus: mockUpdateContractStatus,
  cancelPendingContract: mockCancelPendingContract,
  getContractWalletAddresses: mockGetContractWalletAddresses,
}));

const mockInitializeContractEscrow = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  initializeContractEscrow: mockInitializeContractEscrow,
}));

const mockGetProjectById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

const mockGetDisputesByContract = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
  getDisputesByContract: mockGetDisputesByContract,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { userId: 'user-1', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v || 20,
  clampOffset: (v: any) => v || 0,
}));

const contractRouter = (await import('../../routes/contract-routes.js')).default;

describe('Contract Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/contracts', contractRouter);
  });

  describe('GET / - List user contracts', () => {
    it('should return user contracts', async () => {
      mockGetUserContracts.mockResolvedValue({ success: true, data: { items: [{ id: 'c-1' }], hasMore: false } });
      const res = await request(app).get('/api/contracts');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });
      const res = await request(app).get('/api/contracts');
      expect(res.status).toBe(401);
    });

    it('should return 400 on service failure', async () => {
      mockGetUserContracts.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/contracts');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:id - Get contract by ID', () => {
    it('should return contract for authorized user', async () => {
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', freelancerId: 'user-1', employerId: 'user-2', status: 'active' } });
      const res = await request(app).get('/api/contracts/c-1');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockGetContractById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get('/api/contracts/c-1');
      expect(res.status).toBe(404);
    });

    it('should return 403 when user is not involved', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = { userId: 'outsider', role: 'freelancer' }; next(); });
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', freelancerId: 'user-1', employerId: 'user-2', status: 'active' } });
      const res = await request(app).get('/api/contracts/c-1');
      expect(res.status).toBe(403);
    });

    it('should allow admin to view any contract', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = { userId: 'admin-1', role: 'admin' }; next(); });
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', freelancerId: 'user-1', employerId: 'user-2', status: 'active' } });
      const res = await request(app).get('/api/contracts/c-1');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /:id/fund - Fund contract escrow', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });
      const res = await request(app).post('/api/contracts/c-1/fund');
      expect(res.status).toBe(401);
    });

    it('should return 404 when contract not found', async () => {
      mockGetContractById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/contracts/c-1/fund');
      expect(res.status).toBe(404);
    });

    it('should return 403 when user is not the employer', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = { userId: 'freelancer-1', role: 'freelancer' }; next(); });
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'employer-1', freelancerId: 'freelancer-1', status: 'pending' } });
      const res = await request(app).post('/api/contracts/c-1/fund');
      expect(res.status).toBe(403);
    });

    it('should return 200 when contract already active with escrow', async () => {
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'active', escrowAddress: '0xabc' } });
      const res = await request(app).post('/api/contracts/c-1/fund');
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already funded');
    });

    it('should return 400 when contract is not pending', async () => {
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'completed' } });
      const res = await request(app).post('/api/contracts/c-1/fund');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('should accept frontend escrow address', async () => {
      mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 } });
      
      const mockContractRepo = { updateContract: jest.fn<any>().mockResolvedValue({}) };
      jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
        contractRepository: mockContractRepo,
      }));
      
      mockUpdateContractStatus.mockResolvedValue({ success: true, data: { status: 'active' } });

      const res = await request(app).post('/api/contracts/c-1/fund').send({ escrowAddress: '0xfrontend', transactionHash: '0xtx' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /:id/cancel - Cancel pending contract', () => {
    it('should cancel contract successfully', async () => {
      mockCancelPendingContract.mockResolvedValue({ success: true, data: { id: 'c-1', status: 'cancelled' } });
      const res = await request(app).post('/api/contracts/c-1/cancel');
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('cancelled');
    });

    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });
      const res = await request(app).post('/api/contracts/c-1/cancel');
      expect(res.status).toBe(401);
    });

    it('should return 404 when not found', async () => {
      mockCancelPendingContract.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/contracts/c-1/cancel');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockCancelPendingContract.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized' } });
      const res = await request(app).post('/api/contracts/c-1/cancel');
      expect(res.status).toBe(403);
    });

    it('should return 400 for other errors', async () => {
      mockCancelPendingContract.mockResolvedValue({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot cancel' } });
      const res = await request(app).post('/api/contracts/c-1/cancel');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:contractId/disputes - Get contract disputes', () => {
    it('should return disputes for contract', async () => {
      mockGetDisputesByContract.mockResolvedValue({ success: true, data: [{ id: 'd-1', status: 'open' }] });
      const res = await request(app).get('/api/contracts/c-1/disputes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });
      const res = await request(app).get('/api/contracts/c-1/disputes');
      expect(res.status).toBe(401);
    });

    it('should return 404 when contract not found', async () => {
      mockGetDisputesByContract.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get('/api/contracts/c-1/disputes');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockGetDisputesByContract.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized' } });
      const res = await request(app).get('/api/contracts/c-1/disputes');
      expect(res.status).toBe(403);
    });

    it('should handle thrown errors', async () => {
      mockGetDisputesByContract.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app).get('/api/contracts/c-1/disputes');
      expect(res.status).toBe(500);
    });
  });
});
