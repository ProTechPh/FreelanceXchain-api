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

const mockContractRepository = { updateContract: jest.fn<any>().mockResolvedValue({}) };
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockMapProjectFromEntity = jest.fn<any>((entity: any) => ({
  ...entity,
  milestones: entity.milestones || [],
}));
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: mockMapProjectFromEntity,
}));

const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v || 20,
  clampOffset: (v: any) => v || 0,
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const contractRouter = (await import('../../routes/contract-routes.js')).default;

describe('Contract Routes - Coverage Gaps (Server-side Escrow)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'employer-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/contracts', contractRouter);
  });

  describe('POST /:id/fund - server-side escrow fallback', () => {
    it('should return 400 when project not found (no frontend escrow)', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockGetProjectById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });

      const res = await request(app).post('/api/contracts/c-1/fund').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should return 400 when wallet addresses not found', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockGetProjectById.mockResolvedValue({ success: true, data: { id: 'p-1', milestones: [] } });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: false,
        error: { code: 'WALLETS_NOT_FOUND', message: 'Wallet addresses not configured' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WALLETS_NOT_FOUND');
    });

    it('should return 500 when escrow initialization fails', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockGetProjectById.mockResolvedValue({ success: true, data: { id: 'p-1', milestones: [] } });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { employerWallet: '0xemp', freelancerWallet: '0xfree' },
      });
      mockInitializeContractEscrow.mockResolvedValue({
        success: false,
        error: { code: 'DEPLOY_FAILED', message: 'Contract deployment failed' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({});
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('ESCROW_FAILED');
    });

    it('should return 400 when escrow fails with AMOUNT_MISMATCH', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockGetProjectById.mockResolvedValue({ success: true, data: { id: 'p-1', milestones: [] } });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { employerWallet: '0xemp', freelancerWallet: '0xfree' },
      });
      mockInitializeContractEscrow.mockResolvedValue({
        success: false,
        error: { code: 'AMOUNT_MISMATCH', message: 'Amounts do not match' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ESCROW_FAILED');
    });

    it('should succeed with server-side escrow deployment', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockGetProjectById.mockResolvedValue({ success: true, data: { id: 'p-1', milestones: [] } });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { employerWallet: '0xemp', freelancerWallet: '0xfree' },
      });
      mockInitializeContractEscrow.mockResolvedValue({
        success: true,
        data: { escrowAddress: '0xescrow123' },
      });
      mockUpdateContractStatus.mockResolvedValue({ success: true, data: { status: 'active' } });

      const res = await request(app).post('/api/contracts/c-1/fund').send({});
      expect(res.status).toBe(200);
      expect(res.body.escrowAddress).toBe('0xescrow123');
      expect(res.body.contractStatus).toBe('active');
    });

    it('should handle INVALID_STATUS_TRANSITION with already active contract', async () => {
      mockGetContractById
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'c-1', status: 'active', escrowAddress: '0xexisting' },
        });
      mockUpdateContractStatus.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_STATUS_TRANSITION', message: 'Invalid transition' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({ escrowAddress: '0xfrontend' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already funded');
      expect(res.body.escrowAddress).toBe('0xexisting');
    });

    it('should return 500 when activation fails without recovery', async () => {
      mockGetContractById
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'c-1', status: 'pending', escrowAddress: null },
        });
      mockUpdateContractStatus.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_STATUS_TRANSITION', message: 'Invalid transition' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({ escrowAddress: '0xfrontend' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('ACTIVATION_FAILED');
    });

    it('should return 500 when activation fails with non-transition error', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', status: 'pending', projectId: 'p-1', totalAmount: 1000 },
      });
      mockUpdateContractStatus.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).post('/api/contracts/c-1/fund').send({ escrowAddress: '0xfrontend' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('ACTIVATION_FAILED');
    });
  });

  describe('GET /:id/fund-info', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).get('/api/contracts/c-1/fund-info');
      expect(res.status).toBe(401);
    });

    it('should return 404 when contract not found', async () => {
      mockGetContractById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get('/api/contracts/c-1/fund-info');
      expect(res.status).toBe(404);
    });

    it('should return 403 when user is not the employer', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'other-user', role: 'freelancer' };
        next();
      });
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', projectId: 'p-1', totalAmount: 1 },
      });
      const res = await request(app).get('/api/contracts/c-1/fund-info');
      expect(res.status).toBe(403);
    });

    it('should return 400 when wallet addresses not found', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', projectId: 'p-1', totalAmount: 1 },
      });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: false,
        error: { code: 'WALLETS_NOT_FOUND', message: 'Wallets not configured' },
      });
      const res = await request(app).get('/api/contracts/c-1/fund-info');
      expect(res.status).toBe(400);
    });

    it('should return 400 when project not found', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', employerId: 'employer-1', projectId: 'p-1', totalAmount: 1 },
      });
      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { freelancerWallet: '0xfree' },
      });
      mockGetProjectById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get('/api/contracts/c-1/fund-info');
      expect(res.status).toBe(400);
    });
  });
});
