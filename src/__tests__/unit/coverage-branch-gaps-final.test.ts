// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// ============================================================
// Track which user role to inject in auth middleware
// ============================================================
let authUserOverride: any = null;

// ============================================================
// Common mocks
// ============================================================
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = authUserOverride ?? { userId: 'admin-1', role: 'admin' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
}));

// ============================================================
// 1. Admin routes - satisfactionRate catch block (line 340)
// ============================================================
const mockPoolQuery = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
}));

jest.unstable_mockModule(resolveModule('src/services/admin-service.ts'), () => ({
  getPlatformStats: jest.fn<any>().mockResolvedValue({
    success: true,
    data: { totalTransactionVolume: 1000, totalUsers: 10, totalProjects: 5, totalContracts: 3 },
  }),
  getAdminAnalytics: jest.fn<any>(),
  getUserManagement: jest.fn<any>(),
  suspendUser: jest.fn<any>(),
  unsuspendUser: jest.fn<any>(),
  verifyUser: jest.fn<any>(),
  updateUser: jest.fn<any>(),
  getDisputeManagement: jest.fn<any>(),
  getSystemHealth: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: jest.fn<any>(),
}));

// ============================================================
// 2. Escrow refund routes - non-Error throw (lines 142, 197)
// ============================================================
const mockApproveRefund = jest.fn<any>();
const mockRejectRefund = jest.fn<any>();
const mockCreateRefundRequest = jest.fn<any>();
const mockGetContractRefunds = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
  createRefundRequest: mockCreateRefundRequest,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
  getContractRefunds: mockGetContractRefunds,
}));

// ============================================================
// 3. Message routes - error?.code ?? 'UNKNOWN' branches
// ============================================================
const mockSendMessage = jest.fn<any>();
const mockGetConversations = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>();
const mockMarkConversationAsRead = jest.fn<any>();
const mockGetUnreadMessageCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
  sendMessage: mockSendMessage,
  getConversations: mockGetConversations,
  getConversationMessages: mockGetConversationMessages,
  markConversationAsRead: mockMarkConversationAsRead,
  getUnreadMessageCount: mockGetUnreadMessageCount,
}));

// ============================================================
// 4. Contract routes - escrow error fallback branches
// ============================================================
const mockGetContractById = jest.fn<any>();
const mockGetUserContracts = jest.fn<any>();
const mockCancelPendingContract = jest.fn<any>();
const mockGetContractWalletAddresses = jest.fn<any>();
const mockUpdateContractStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/contract-service.ts'), () => ({
  getContractById: mockGetContractById,
  getUserContracts: mockGetUserContracts,
  updateContractStatus: mockUpdateContractStatus,
  cancelPendingContract: mockCancelPendingContract,
  getContractWalletAddresses: mockGetContractWalletAddresses,
}));

const mockGetProjectById = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

const mockInitializeContractEscrow = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  initializeContractEscrow: mockInitializeContractEscrow,
  requestMilestoneCompletion: jest.fn<any>(),
  approveMilestone: jest.fn<any>(),
  getContractPaymentStatus: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
  getDisputesByContract: jest.fn<any>(),
  createDispute: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { updateContract: jest.fn<any>() },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (data: any) => data,
}));

// ============================================================
// 5. Message repository - branch gaps
// ============================================================
const { messageRepository } = await import('../../repositories/message-repository.js');

// ============================================================
// 6. Proposal repository - parse helper return val
// ============================================================
const { proposalRepository } = await import('../../repositories/proposal-repository.js');

// ============================================================
// 7. Base repository appwrite - multiple branch gaps
// ============================================================
const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');

// ============================================================
// IMPORT ROUTES AFTER ALL MOCKS
// ============================================================
const adminRouter = (await import('../../routes/admin-routes.js')).default;
const escrowRefundRouter = (await import('../../routes/escrow-refund-routes.js')).default;
const messageRouter = (await import('../../routes/message-routes.js')).default;
const contractRouter = (await import('../../routes/contract-routes.js')).default;

// ============================================================
// Test subclass for BaseRepositoryAppwrite
// ============================================================
type TestEntity = { id: string; created_at: string; updated_at: string; name?: string };

class TestRepo extends BaseRepositoryAppwrite<TestEntity> {
  constructor() { super('test_collection'); }
  async testQueryAll(orderBy?: string, ascending?: boolean) { return this.queryAll(orderBy, ascending); }
  async testQueryPaginated(options?: any, orderBy?: string, ascending?: boolean) { return this.queryPaginated(options, orderBy, ascending); }
  async testListWithQueries(queries: any[], mapper?: any) { return this.listWithQueries(queries, mapper); }
  async testCountWithQueries(queries: any[]) { return this.countWithQueries(queries); }
  async testPaginatedWithQueries(queries: any[], limit: number, offset: number, mapper?: any) { return this.paginatedWithQueries(queries, limit, offset, mapper); }
}

// ============================================================
// TESTS
// ============================================================
describe('Branch gaps - final achievable coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    authUserOverride = null;
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockPoolQuery.mockReset();
  });

  // ─── 1. Admin routes: satisfactionRate catch block ───────────────────────
  describe('admin-routes: satisfactionRate catch block', () => {
    it('GET /platform-stats returns satisfactionRate=0 when reviews query fails', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('Reviews table not found'));

      const app = express();
      app.use(express.json());
      app.use('/test', adminRouter);

      const res = await request(app).get('/test/platform-stats');
      expect(res.status).toBe(200);
      expect(res.body.satisfactionRate).toBe(0);
    });
  });

  // ─── 2. Base repository appwrite: multiple branch gaps ───────────────────
  describe('BaseRepositoryAppwrite: branch gaps', () => {
    it('queryAll with ascending=true', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01', name: 'test' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testQueryAll('name', true);
      expect(result.length).toBe(1);
    });

    it('queryPaginated with ascending=true', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testQueryPaginated({ limit: 10, offset: 0 }, 'name', true);
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('queryPaginated success without total field', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01' }] });
      const repo = new TestRepo();
      const result = await repo.testQueryPaginated();
      expect(result.items.length).toBe(1);
    });

    it('update with primitive values passes through without JSON.stringify', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: '1', $createdAt: '2024-01-01', $updatedAt: '2024-01-02', name: 'updated' });
      const repo = new TestRepo();
      const result = await repo.update('1', { name: 'updated' } as any);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('updated');
    });

    it('listWithQueries with custom mapper', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01', name: 'test' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testListWithQueries([], (doc: any) => ({ mapped: doc.name }));
      expect(result[0].mapped).toBe('test');
    });

    it('listWithQueries without mapper uses default mapping', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01', name: 'test' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testListWithQueries([]);
      expect(result[0].id).toBe('1');
    });

    it('countWithQueries returns 0 on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const repo = new TestRepo();
      const result = await repo.testCountWithQueries([]);
      expect(result).toBe(0);
    });

    it('paginatedWithQueries with mapper', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01', name: 'test' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testPaginatedWithQueries([], 10, 0, (doc: any) => ({ mapped: doc.name }));
      expect(result.items[0].mapped).toBe('test');
    });

    it('paginatedWithQueries without mapper', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: '1', $createdAt: '2024-01-01', name: 'test' }], total: 1 });
      const repo = new TestRepo();
      const result = await repo.testPaginatedWithQueries([], 10, 0);
      expect(result.items[0].id).toBe('1');
    });
  });

  // ─── 3. Message repository: branch gaps ─────────────────────────────────
  describe('message-repository: branch gaps', () => {
    it('findConversation returns null on Appwrite error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Appwrite down'));
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).toBeNull();
    });

    it('getUserConversations handles null last_message_at', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', participant1_id: 'u1', participant2_id: 'u2', last_message_at: null, $createdAt: '2024-01-01' }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.getUserConversations('u1', 20, 0);
      expect(result.items.length).toBe(1);
    });

    it('getUnreadCount handles zero unread counts (falsy || 0)', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', unread_count_1: 0 }], total: 1 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c2', unread_count_2: 0 }], total: 1 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });
  });

  // ─── 4. Proposal repository: parse helper return val ────────────────────
  describe('proposal-repository: parse helper', () => {
    it('getProposalById handles attachments already as array (non-string)', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        $createdAt: '2024-01-01',
        $updatedAt: '2024-01-01',
        project_id: 'proj-1',
        freelancer_id: 'f-1',
        cover_letter: 'test',
        attachments: [{ url: 'http://test.com/file.pdf', filename: 'file.pdf', size: 100, mimeType: 'application/pdf' }],
        proposed_rate: 100,
        estimated_duration: 7,
        status: 'pending',
      });
      const result = await proposalRepository.getProposalById('p1');
      expect(result).not.toBeNull();
      expect(Array.isArray(result!.attachments)).toBe(true);
    });
  });

  // ─── 5. Escrow refund routes: non-Error throw ──────────────────────────
  describe('escrow-refund-routes: non-Error throw', () => {
    it('approve refund catches non-Error string throw', async () => {
      mockApproveRefund.mockRejectedValueOnce('non-error-string');

      const app = express();
      app.use(express.json());
      app.use('/test', escrowRefundRouter);

      const res = await request(app).post('/test/refunds/550e8400-e29b-41d4-a716-446655440000/approve');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to approve refund');
    });

    it('reject refund catches non-Error object throw', async () => {
      mockRejectRefund.mockRejectedValueOnce({ code: 'UNKNOWN', message: 'object error' });

      const app = express();
      app.use(express.json());
      app.use('/test', escrowRefundRouter);

      const res = await request(app)
        .post('/test/refunds/550e8400-e29b-41d4-a716-446655440000/reject')
        .send({ reason: 'test' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to reject refund');
    });
  });

  // ─── 6. Message routes: error?.code ?? 'UNKNOWN' branches ──────────────
  describe('message-routes: ?? UNKNOWN fallback', () => {
    it('getConversations with error missing code property', async () => {
      mockGetConversations.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const app = express();
      app.use(express.json());
      app.use('/test', messageRouter);

      const res = await request(app).get('/test/conversations');
      expect(res.status).toBe(400);
    });

    it('sendMessage with error missing code property', async () => {
      mockSendMessage.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const app = express();
      app.use(express.json());
      app.use('/test', messageRouter);

      const res = await request(app)
        .post('/test/send')
        .send({ receiverId: 'user-2', content: 'hello' });
      expect(res.status).toBe(400);
    });

    it('getConversationMessages with error missing code property', async () => {
      mockGetConversationMessages.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const app = express();
      app.use(express.json());
      app.use('/test', messageRouter);

      const res = await request(app).get('/test/conversations/550e8400-e29b-41d4-a716-446655440000');
      expect(res.status).toBe(400);
    });

    it('markConversationAsRead with error missing code property', async () => {
      mockMarkConversationAsRead.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const app = express();
      app.use(express.json());
      app.use('/test', messageRouter);

      const res = await request(app)
        .patch('/test/conversations/550e8400-e29b-41d4-a716-446655440000/read');
      expect(res.status).toBe(400);
    });

    it('getUnreadMessageCount with error missing code property', async () => {
      mockGetUnreadMessageCount.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const app = express();
      app.use(express.json());
      app.use('/test', messageRouter);

      const res = await request(app).get('/test/unread-count');
      expect(res.status).toBe(400);
    });
  });

  // ─── 7. Contract routes: escrow error fallback branches ────────────────
  describe('contract-routes: error fallback branches', () => {
    const validContractId = '550e8400-e29b-41d4-a716-446655440000';

    beforeEach(() => {
      authUserOverride = { userId: 'user-1', role: 'employer' };
    });

    it('fund contract: escrowResult.error?.message || fallback when no message', async () => {
      mockGetContractById.mockResolvedValueOnce({
        success: true,
        data: { id: validContractId, status: 'pending', employerId: 'user-1', freelancerId: 'user-2', escrowAddress: null },
      });
      mockGetContractWalletAddresses.mockResolvedValueOnce({
        success: true,
        data: { employerWallet: '0xemp', freelancerWallet: '0xfree' },
      });
      mockGetProjectById.mockResolvedValueOnce({
        success: true,
        data: { id: 'proj-1', budget: 1000 },
      });
      mockInitializeContractEscrow.mockResolvedValueOnce({
        success: false,
        error: { code: 'OTHER' },
      });

      const app = express();
      app.use(express.json());
      app.use('/test', contractRouter);

      const res = await request(app)
        .post(`/test/${validContractId}/fund`)
        .send({});
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('Failed to initialize escrow');
    });

    it('cancel contract: result.error?.code || CANCEL_FAILED when no code', async () => {
      mockCancelPendingContract.mockResolvedValueOnce({
        success: false,
        error: {},
      });

      const app = express();
      app.use(express.json());
      app.use('/test', contractRouter);

      const res = await request(app)
        .post(`/test/${validContractId}/cancel`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANCEL_FAILED');
      expect(res.body.error.message).toBe('Failed to cancel contract');
    });
  });
});
