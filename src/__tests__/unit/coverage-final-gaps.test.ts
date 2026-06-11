// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ─── Error Handler: forbidden, badRequest, conflict, internal ───
describe('Error Handler - Missing Factory Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create forbidden error', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.forbidden();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('Access denied');
  });

  it('should create forbidden error with custom message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.forbidden('Custom forbidden');
    expect(error.message).toBe('Custom forbidden');
  });

  it('should create badRequest error', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.badRequest();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Bad request');
  });

  it('should create badRequest error with custom message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.badRequest('Custom bad request');
    expect(error.message).toBe('Custom bad request');
  });

  it('should create conflict error', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.conflict();
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Resource already exists');
  });

  it('should create conflict error with custom message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.conflict('Custom conflict');
    expect(error.message).toBe('Custom conflict');
  });

  it('should create internal error', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.internal();
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('An unexpected error occurred');
  });

  it('should create internal error with custom message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const error = errors.internal('Custom internal');
    expect(error.message).toBe('Custom internal');
  });
});

// ─── Scheduler Service - uncovered lines ───
describe('Scheduler Service - Additional Coverage', () => {
  let mockDatabases: any;
  const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const mockCronSchedule = jest.fn();
  const mockCronGetTasks = jest.fn();
  const mockSendWeeklyDigestEmail = jest.fn();
  let scheduledCallbacks: Map<string, () => void>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    scheduledCallbacks = new Map();

    mockCronSchedule.mockImplementation((expression: any, callback: any) => {
      scheduledCallbacks.set(expression, callback);
      return { stop: jest.fn() };
    });
    mockCronGetTasks.mockReturnValue([{ stop: jest.fn() }]);
  });

  async function initScheduler() {
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
    jest.unstable_mockModule('node-cron', () => ({
      default: { schedule: mockCronSchedule, getTasks: mockCronGetTasks },
    }));
    jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
      sendWeeklyDigestEmail: mockSendWeeklyDigestEmail,
    }));
    const { initializeScheduler } = await import('../../services/scheduler-service.js');
    initializeScheduler();
  }

  it('should handle sendWeeklyDigests with pending milestones', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'p1', created_at: new Date().toISOString() }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', title: 'Top', budget: 500 }],
        total: 1,
      });

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'u1', email: 'u1@test.com', full_name: 'User1' })
      .mockResolvedValueOnce({
        $id: 'proj1',
        milestones: JSON.stringify([{ title: 'm1', status: 'pending' }]),
      });

    callback();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
  });

  it('should handle sendWeeklyDigests when user doc fetch fails', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      });

    mockDatabases.getDocument.mockRejectedValueOnce(new Error('User not found'));

    callback();
    await new Promise((r) => setTimeout(r, 50));
    // Should continue to next user (skip this one)
  });

  it('should handle sendWeeklyDigests with string milestones', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'p1', created_at: new Date(Date.now() - 86400000 * 10).toISOString() }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', title: 'Top', budget: 500 }],
        total: 1,
      });

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'u1', email: 'u1@test.com', name: 'User1' })
      .mockResolvedValueOnce({
        $id: 'proj1',
        milestones: [{ title: 'm1', status: 'pending' }],
      });

    callback();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
  });

  it('should handle sendWeeklyDigests with null milestones', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'p1', created_at: new Date(Date.now() - 86400000 * 10).toISOString() }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', title: 'Top', budget: 500 }],
        total: 1,
      });

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'u1', email: 'u1@test.com', full_name: 'User1' })
      .mockResolvedValueOnce({
        $id: 'proj1',
      });

    callback();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
  });

  it('should handle sendWeeklyDigests when contract project fetch fails', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 9 * * 1');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'p1', created_at: new Date(Date.now() - 86400000 * 10).toISOString() }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1', freelancer_id: 'u1' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'proj1', title: 'Top', budget: 500 }],
        total: 1,
      });

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'u1', email: 'u1@test.com', full_name: 'User1' })
      .mockRejectedValueOnce(new Error('Project not found'));

    callback();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSendWeeklyDigestEmail).toHaveBeenCalled();
  });

  it('should handle executeSavedSearches with freelancer search type', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 */6 * * *');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 's1', search_type: 'freelancer', filters: { category: 'dev' } }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'f1' }],
        total: 1,
      });

    callback();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('should handle cleanupOldNotifications with delete failure', async () => {
    await initScheduler();
    const callback = scheduledCallbacks.get('0 2 * * *');

    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'n1', created_at: oldDate },
        { $id: 'n2', created_at: oldDate },
      ],
      total: 2,
    });
    mockDatabases.deleteDocument
      .mockRejectedValueOnce(new Error('Delete failed'))
      .mockResolvedValueOnce({});

    callback();
    await new Promise((r) => setTimeout(r, 100));
    expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(2);
  });
});

// ─── Email Preference Service - uncovered lines ───
describe('Email Preference Service - Additional Coverage', () => {
  let mockDatabases: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.getDocument.mockReset();
  });

  function toAppwriteDoc(data: Record<string, any>) {
    const { id, created_at, updated_at, ...rest } = data;
    return {
      $id: id || 'pref-1',
      $createdAt: created_at || '2025-01-01T00:00:00Z',
      $updatedAt: updated_at || '2025-01-01T00:00:00Z',
      ...rest,
    };
  }

  it('should update preferences when doc exists', async () => {
    const { updateEmailPreferences } = await import('../../services/email-preference-service.js');

    const doc = toAppwriteDoc({
      id: 'pref-1',
      user_id: 'user-1',
      proposal_received: true,
      proposal_accepted: true,
      milestone_updates: true,
      payment_notifications: true,
      dispute_notifications: true,
      marketing_emails: false,
      weekly_digest: true,
    });
    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
    mockDatabases.updateDocument.mockResolvedValueOnce(doc);

    const result = await updateEmailPreferences('user-1', { marketing_emails: true } as any);
    expect(result.success).toBe(true);
  });

  it('should return NOT_FOUND when preferences not found for update', async () => {
    const { updateEmailPreferences } = await import('../../services/email-preference-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await updateEmailPreferences('user-1', { marketing_emails: true } as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should fall back to getEmailPreferences when no valid update keys', async () => {
    const { updateEmailPreferences } = await import('../../services/email-preference-service.js');

    const doc = toAppwriteDoc({
      id: 'pref-1',
      user_id: 'user-1',
      proposal_received: true,
      proposal_accepted: true,
      milestone_updates: true,
      payment_notifications: true,
      dispute_notifications: true,
      marketing_emails: false,
      weekly_digest: true,
    });
    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

    const result = await updateEmailPreferences('user-1', { id: 'x', user_id: 'y' } as any);
    expect(result.success).toBe(true);
  });

  it('should handle update error gracefully', async () => {
    const { updateEmailPreferences } = await import('../../services/email-preference-service.js');

    const doc = toAppwriteDoc({
      id: 'pref-1',
      user_id: 'user-1',
      proposal_received: true,
    });
    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
    mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Update failed'));

    const result = await updateEmailPreferences('user-1', { marketing_emails: true } as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

// ─── Auth Routes - Phone OTP, Email OTP, Magic URL, Verify Token ───
describe('Auth Routes - Uncovered Phone/Email/Magic/Verify Routes', () => {
  let app: express.Express;

  const mockRequestPhoneOtp = jest.fn<any>();
  const mockRequestEmailOtp = jest.fn<any>();
  const mockRequestMagicUrl = jest.fn<any>();
  const mockVerifyAuthToken = jest.fn<any>();
  const mockRegisterWithAppwrite = jest.fn<any>();
  const mockLoginWithAppwrite = jest.fn<any>();
  const mockGetOAuthUrl = jest.fn<any>();

  jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
    register: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    isAuthError: (result: any) =>
      result && typeof result === 'object' && 'code' in result && !('accessToken' in result),
    validatePasswordStrength: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    loginWithAppwrite: mockLoginWithAppwrite,
    registerWithAppwrite: mockRegisterWithAppwrite,
    getOAuthUrl: mockGetOAuthUrl,
    exchangeCodeForSession: jest.fn(),
    resendConfirmationEmail: jest.fn(),
    requestPasswordReset: jest.fn(),
    updatePassword: jest.fn(),
    getCurrentUserWithKyc: jest.fn(),
    logout: jest.fn(),
    enrollMFA: jest.fn(),
    verifyMFAEnrollment: jest.fn(),
    challengeMFA: jest.fn(),
    verifyMFAChallenge: jest.fn(),
    getMFAFactors: jest.fn(),
    disableMFA: jest.fn(),
    consumeMfaSession: jest.fn(),
    validateTokenAndGetUser: jest.fn(),
    requestPhoneOtp: mockRequestPhoneOtp,
    requestEmailOtp: mockRequestEmailOtp,
    requestMagicUrl: mockRequestMagicUrl,
    verifyAuthToken: mockVerifyAuthToken,
  }));

  jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
  jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));
  jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
    authRateLimiter: (_req: any, _res: any, next: any) => next(),
    registerRateLimiter: (_req: any, _res: any, next: any) => next(),
    passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
    apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

  jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      req.headers = req.headers || {};
      req.headers.authorization = req.headers.authorization || 'Bearer test-token';
      next();
    },
  }));

  jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
    generateCsrfToken: () => 'csrf-token',
  }));

  jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
    userRepository: { updateUser: jest.fn() },
  }));

  jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  }));

  jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
    getRequestId: (req: any) => req.headers?.['x-request-id'] ?? 'test-request-id',
  }));

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/auth-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });

  describe('POST /login/phone', () => {
    it('should return 400 when phone is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login/phone')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when requestPhoneOtp returns auth error', async () => {
      mockRequestPhoneOtp.mockResolvedValue({ code: 'PHONE_ERROR', message: 'Invalid phone' });
      const res = await request(app)
        .post('/api/auth/login/phone')
        .send({ phone: '+1234567890' });
      expect(res.status).toBe(400);
    });

    it('should return 200 when requestPhoneOtp succeeds', async () => {
      mockRequestPhoneOtp.mockResolvedValue({ secret: 'otp-secret', userId: 'user-1' });
      const res = await request(app)
        .post('/api/auth/login/phone')
        .send({ phone: '+1234567890' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /login/email-otp', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login/email-otp')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when requestEmailOtp returns auth error', async () => {
      mockRequestEmailOtp.mockResolvedValue({ code: 'EMAIL_ERROR', message: 'Failed' });
      const res = await request(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 200 when requestEmailOtp succeeds', async () => {
      mockRequestEmailOtp.mockResolvedValue({ secret: 'otp-secret', userId: 'user-1' });
      const res = await request(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /login/magic-url', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login/magic-url')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'bad-email' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when requestMagicUrl returns auth error', async () => {
      mockRequestMagicUrl.mockResolvedValue({ code: 'MAGIC_ERROR', message: 'Failed' });
      const res = await request(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 200 when requestMagicUrl succeeds', async () => {
      mockRequestMagicUrl.mockResolvedValue({ message: 'Magic URL sent' });
      const res = await request(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /login/verify-token', () => {
    it('should return 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login/verify-token')
        .send({ secret: 'some-secret' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when secret is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'user-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 202 when registration is required', async () => {
      mockVerifyAuthToken.mockResolvedValue({
        code: 'AUTH_REQUIRE_REGISTRATION',
        message: 'User does not exist',
      });
      const res = await request(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'user-1', secret: 'some-secret' });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('registration_required');
    });

    it('should return 400 when verifyAuthToken returns other auth error', async () => {
      mockVerifyAuthToken.mockResolvedValue({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token',
      });
      const res = await request(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'user-1', secret: 'some-secret' });
      expect(res.status).toBe(400);
    });

    it('should return 200 when verifyAuthToken succeeds', async () => {
      mockVerifyAuthToken.mockResolvedValue({
        user: { id: 'user-1', email: 'test@test.com', role: 'freelancer' },
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      const res = await request(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'user-1', secret: 'some-secret' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /oauth/register', () => {
    it('should return 400 when accessToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when role is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'admin' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when both accessToken and role are missing', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 401 when registerWithAppwrite returns auth error', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid token',
      });
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });
      expect(res.status).toBe(401);
    });

    it('should return 201 when registration succeeds', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({
        user: { id: 'user-1', email: 'test@test.com', role: 'freelancer' },
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });
      expect(res.status).toBe(201);
    });

    it('should return 500 on unexpected error', async () => {
      mockRegisterWithAppwrite.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });
      expect(res.status).toBe(500);
    });
  });
});
