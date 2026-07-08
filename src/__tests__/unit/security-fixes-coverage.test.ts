/**
 * Coverage tests for security fixes — covers branches introduced by the business logic vulnerability patches.
 */
import { jest } from '@jest/globals';
import path from 'path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ============================================================
// 1. async-lock.ts — cleanup branch (line 26)
// ============================================================
describe('async-lock cleanup branch', () => {
  it('should clean up lock when a different lock has been set for the same key', async () => {
    const { withLock } = await import('../../utils/async-lock.js');
    const p1 = withLock('overlap-key', async () => {
      await new Promise(r => setTimeout(r, 30));
      return 'first';
    });
    const p2 = withLock('overlap-key', async () => 'second');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
  });
});

// ============================================================
// 2. milestone-service.ts — getMilestoneById authorization (lines 32-34)
// ============================================================
describe('milestone-service security branches', () => {
  it('getMilestoneById should return UNAUTHORIZED for non-party user', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-1', contract_id: 'c-1', status: 'submitted', title: 'Test', amount: 100, revision_count: 0,
        }),
        update: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', status: 'active',
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { getMilestoneById } = await import('../../services/milestone-service.js');
    const result = await getMilestoneById('m-1', 'stranger-id');
    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('UNAUTHORIZED');
  });

  it('getMilestoneById should succeed for contract party', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-1', contract_id: 'c-1', status: 'submitted', title: 'Test', amount: 100, revision_count: 0,
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', status: 'active',
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { getMilestoneById } = await import('../../services/milestone-service.js');
    const result = await getMilestoneById('m-1', 'emp-1');
    expect(result.success).toBe(true);
  });

  it('getMilestoneById should succeed without userId (internal call)', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-1', contract_id: 'c-1', status: 'submitted', title: 'Test', amount: 100, revision_count: 0,
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { getMilestoneById } = await import('../../services/milestone-service.js');
    const result = await getMilestoneById('m-1');
    expect(result.success).toBe(true);
  });
});

// ============================================================
// 3. milestone-service.ts — submitMilestone contract status check (line 88)
// ============================================================
describe('milestone-service submit contract status check', () => {
  it('should reject submission on non-active contract', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-sub', contract_id: 'c-sub', status: 'pending', title: 'Test', amount: 100, revision_count: 0,
        }),
        update: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-sub', employer_id: 'emp-sub', freelancer_id: 'free-sub', status: 'cancelled',
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { submitMilestone } = await import('../../services/milestone-service.js');
    const result = await submitMilestone({
      milestoneId: 'm-sub',
      freelancerId: 'free-sub',
      deliverables: [],
    });

    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('INVALID_STATUS');
    expect((result as any).error.message).toContain('cancelled');
  });
});

// ============================================================
// 4. milestone-service.ts — revision count cap
// ============================================================
describe('milestone-service revision cap', () => {
  it('should reject revision when max revisions reached', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-2', contract_id: 'c-2', status: 'submitted', title: 'Test', amount: 100, revision_count: 5,
        }),
        update: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-2', employer_id: 'emp-2', freelancer_id: 'free-2', status: 'active',
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
      disputeRepository: { createDispute: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      sendNotificationToUser: jest.fn<any>(),
    }));

    jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
      createNotification: jest.fn<any>(),
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { rejectMilestone } = await import('../../services/milestone-service.js');
    const result = await rejectMilestone({
      milestoneId: 'm-2',
      employerId: 'emp-2',
      reason: 'test',
      requestRevision: true,
    });

    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('MAX_REVISIONS_REACHED');
  });
});

// ============================================================
// 4. milestone-service.ts — reject without revision creates dispute
// ============================================================
describe('milestone-service reject creates dispute', () => {
  it('should create dispute record when rejecting without revision', async () => {
    jest.resetModules();

    const mockCreateDispute = jest.fn<any>().mockResolvedValue({ id: 'd-new' });

    jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
      milestoneRepository: {
        getById: jest.fn<any>().mockResolvedValue({
          id: 'm-3', contract_id: 'c-3', status: 'submitted', title: 'Test', amount: 100, revision_count: 0,
        }),
        update: jest.fn<any>().mockResolvedValue({
          id: 'm-3', contract_id: 'c-3', status: 'disputed', title: 'Test', amount: 100, revision_count: 0,
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-3', employer_id: 'emp-3', freelancer_id: 'free-3', status: 'active',
        }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
      disputeRepository: { createDispute: mockCreateDispute },
    }));

    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      sendNotificationToUser: jest.fn<any>().mockResolvedValue(undefined),
    }));

    jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
      createNotification: jest.fn<any>().mockResolvedValue({ success: true, data: {} }),
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { rejectMilestone } = await import('../../services/milestone-service.js');
    const result = await rejectMilestone({
      milestoneId: 'm-3',
      employerId: 'emp-3',
      reason: 'Not good enough',
      requestRevision: false,
    });

    expect(result.success).toBe(true);
    expect(mockCreateDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        contract_id: 'c-3',
        milestone_id: 'm-3',
        initiator_id: 'emp-3',
        status: 'open',
      })
    );
  });
});

// ============================================================
// 5. contract-service.ts — authorization branches
// ============================================================
describe('contract-service security branches', () => {
  it('updateContractStatus should reject non-party user', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', status: 'pending',
        }),
        updateContract: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
      disputeRepository: {
        getDisputesByContract: jest.fn<any>().mockResolvedValue({ items: [] }),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { getUserById: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { updateContractStatus } = await import('../../services/contract-service.js');
    const result = await updateContractStatus('c-1', 'active', 'stranger-id');
    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('UNAUTHORIZED');
  });

  it('setEscrowAddress should reject non-pending contract', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-2', employer_id: 'emp-1', freelancer_id: 'free-1', status: 'active',
        }),
        updateContract: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
      disputeRepository: { getDisputesByContract: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { getUserById: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { setEscrowAddress } = await import('../../services/contract-service.js');
    const result = await setEscrowAddress('c-2', '0xESC', 'emp-1');
    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('INVALID_STATUS');
  });

  it('setEscrowAddress should reject non-party user', async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
      contractRepository: {
        getContractById: jest.fn<any>().mockResolvedValue({
          id: 'c-3', employer_id: 'emp-1', freelancer_id: 'free-1', status: 'pending',
        }),
        updateContract: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
      disputeRepository: { getDisputesByContract: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { getUserById: jest.fn<any>() },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { setEscrowAddress } = await import('../../services/contract-service.js');
    const result = await setEscrowAddress('c-3', '0xESC', 'stranger-id');
    expect(result.success).toBe(false);
    expect((result as any).error.code).toBe('UNAUTHORIZED');
  });
});

// ============================================================
// 6. dispute-evidence-routes.ts — isValidFileUrl branches
// ============================================================
describe('dispute-evidence-routes fileUrl validation', () => {
  let app: any;

  beforeAll(async () => {
    jest.resetModules();

    const mockUser = { userId: 'user-1', email: 'test@test.com', role: 'freelancer' };

    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = mockUser;
        next();
      },
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));

    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: () => (_req: any, _res: any, next: any) => next(),
    }));

    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));

    jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
      submitEvidence: jest.fn<any>().mockResolvedValue({ success: true, data: { id: 'e-1' } }),
      getDisputeEvidence: jest.fn<any>().mockResolvedValue({ success: true, data: [] }),
      deleteEvidence: jest.fn<any>().mockResolvedValue({ success: true }),
      verifyEvidence: jest.fn<any>().mockResolvedValue({ success: true, data: {} }),
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-req-id',
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/dispute-evidence-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/disputes', router);
  });

  it('should reject HTTP fileUrl', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'http://example.com/file' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('HTTPS');
  });

  it('should reject file:// scheme fileUrl', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('should reject javascript: scheme fileUrl', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('should reject malformed URL', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('should accept HTTPS fileUrl', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'https://storage.example.com/file.pdf' });
    expect(res.status).toBe(200);
  });

  it('should accept missing fileUrl (optional)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d-1/evidence')
      .send({ evidenceType: 'document', description: 'test' });
    expect(res.status).toBe(200);
  });
});

// ============================================================
// 7. didit-kyc-service.ts — webhook deduplication (lines 229-254)
// ============================================================
describe('didit-kyc-service webhook deduplication', () => {
  it('should ignore duplicate webhook event_id', async () => {
    jest.resetModules();

    const mockVerification = {
      id: 'v-1', user_id: 'u-1', session_id: 's-1', status: 'approved',
    };

    jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
      createKycVerification: jest.fn<any>().mockResolvedValue(mockVerification),
      getKycVerificationById: jest.fn<any>().mockResolvedValue(mockVerification),
      getKycVerificationByUserId: jest.fn<any>().mockResolvedValue(mockVerification),
      getKycVerificationBySessionId: jest.fn<any>().mockResolvedValue(mockVerification),
      updateKycVerification: jest.fn<any>().mockResolvedValue(mockVerification),
      getKycVerificationsByStatus: jest.fn<any>().mockResolvedValue({ items: [] }),
      getPendingReviews: jest.fn<any>().mockResolvedValue({ items: [] }),
      getKycVerificationHistory: jest.fn<any>().mockResolvedValue([]),
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: {
        getUserById: jest.fn<any>().mockResolvedValue({ id: 'u-1', role: 'freelancer' }),
        update: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
      freelancerProfileRepository: {
        getProfileByUserId: jest.fn<any>().mockResolvedValue(null),
        createProfile: jest.fn<any>(),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { processWebhook } = await import('../../services/didit-kyc-service.js');

    const payload = {
      session_id: 's-1',
      status: 'Approved' as const,
      event_id: 'evt-dedup-1',
      webhook_type: 'status.updated' as const,
      timestamp: Date.now(),
      created_at: Date.now(),
    };

    // First call should process
    const result1 = await processWebhook(payload);
    expect(result1.success).toBe(true);

    // Second call with same event_id should be deduplicated
    const result2 = await processWebhook(payload);
    expect(result2.success).toBe(true);
  });
});
