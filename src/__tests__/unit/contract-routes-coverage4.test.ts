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

const mockAuthMiddleware = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v || 20,
  clampOffset: (v: any) => v || 0,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: jest.fn(),
    getContractsByUser: jest.fn(),
    updateContract: jest.fn(),
    createContract: jest.fn(),
  },
  ContractEntity: {},
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: {
    getDisputesByContract: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserById: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/base-repository-pg.ts'), () => ({
  PaginatedResult: {},
  QueryOptions: {},
  BaseRepositoryPg: class BaseRepositoryPg {},
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: jest.fn(),
    getNotificationsByUser: jest.fn(),
  },
  NotificationEntity: {},
}));

jest.unstable_mockModule(resolveModule('src/types/service-result.ts'), () => ({}));

// Mock the dynamic imports that happen inside the route handler
const mockMapProjectFromEntity = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: mockMapProjectFromEntity,
  mapContractFromEntity: (entity: any) => entity,
  mapNotificationFromEntity: (entity: any) => entity,
  mapFreelancerProfileFromEntity: (entity: any) => entity,
  mapEmployerProfileFromEntity: (entity: any) => entity,
  mapDisputeFromEntity: (entity: any) => entity,
  mapMilestoneFromEntity: (entity: any) => entity,
  FreelancerProfile: {},
  Contract: {},
  Notification: {},
}));

const mockGetWallet = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  getWallet: mockGetWallet,
}));

// Mock ethers
jest.unstable_mockModule('ethers', () => ({
  ethers: {
    parseEther: (val: string) => `${val}000000000000000000`,
  },
}));

const router = (await import('../../routes/contract-routes.js')).default;

describe('Contract Routes - Coverage4', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'employer-1', role: 'employer', email: 'employer@test.com' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/contracts', router);
  });

  describe('GET /:id/fund-info - lines 392-413', () => {
    it('should return fund info with milestone amounts and wallet addresses', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: {
          id: 'contract-1',
          employerId: 'employer-1',
          freelancerId: 'freelancer-1',
          projectId: 'project-1',
          totalAmount: '1.5',
          status: 'pending',
        },
      });

      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { freelancerWallet: '0xFreelancerWallet123' },
      });

      mockGetProjectById.mockResolvedValue({
        success: true,
        data: {
          id: 'project-1',
          milestones: [
            { id: 'm-1', title: 'Design', amount: '0.5' },
            { id: 'm-2', title: 'Development', amount: '1.0' },
          ],
        },
      });

      mockMapProjectFromEntity.mockReturnValue({
        id: 'project-1',
        milestones: [
          { id: 'm-1', title: 'Design', amount: 0.5 },
          { id: 'm-2', title: 'Development', amount: 1.0 },
        ],
      });

      mockGetWallet.mockReturnValue({ address: '0xPlatformWallet456' });

      const res = await request(app).get('/api/contracts/contract-1/fund-info');
      expect(res.status).toBe(200);
      expect(res.body.contractId).toBe('contract-1');
      expect(res.body.freelancerWallet).toBe('0xFreelancerWallet123');
      expect(res.body.platformWallet).toBe('0xPlatformWallet456');
      expect(res.body.milestoneAmounts).toHaveLength(2);
      expect(res.body.milestoneDescriptions).toEqual(['Design', 'Development']);
    });

    it('should return 400 when project is not found', async () => {
      mockGetContractById.mockResolvedValue({
        success: true,
        data: {
          id: 'contract-1',
          employerId: 'employer-1',
          projectId: 'project-1',
          totalAmount: '1.0',
        },
      });

      mockGetContractWalletAddresses.mockResolvedValue({
        success: true,
        data: { freelancerWallet: '0xWallet' },
      });

      mockGetProjectById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });

      const res = await request(app).get('/api/contracts/contract-1/fund-info');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });
});
