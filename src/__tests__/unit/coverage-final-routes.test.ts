// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// ===== COMMON MOCKS =====
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  csrfProtection: (_req: any, _res: any, next: any) => next(),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf-token'),
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    appwrite: {
      endpoint: 'http://localhost',
      projectId: 'test',
      buckets: {
        proposalAttachments: 'pa',
        projectAttachments: 'pad',
        disputeEvidence: 'de',
        portfolioImages: 'pi',
        milestoneDeliverables: 'md',
      },
    },
  },
}));

// ===== ESCROW REFUND SERVICE =====
const mockCreateRefundRequest = jest.fn<any>();
const mockApproveRefund = jest.fn<any>();
const mockRejectRefund = jest.fn<any>();
const mockGetContractRefunds = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
  createRefundRequest: mockCreateRefundRequest,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
  getContractRefunds: mockGetContractRefunds,
}));

// ===== PAYMENT SERVICE =====
const mockRequestMilestoneCompletion = jest.fn<any>();
const mockApproveMilestone = jest.fn<any>();
const mockGetContractPaymentStatus = jest.fn<any>();
const mockInitializeContractEscrow = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  requestMilestoneCompletion: mockRequestMilestoneCompletion,
  approveMilestone: mockApproveMilestone,
  getContractPaymentStatus: mockGetContractPaymentStatus,
  initializeContractEscrow: mockInitializeContractEscrow,
}));

// ===== DISPUTE SERVICE =====
const mockCreateDispute = jest.fn<any>();
const mockGetDisputesByContract = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
  createDispute: mockCreateDispute,
  getDisputesByContract: mockGetDisputesByContract,
}));

// ===== CONTRACT SERVICE =====
const mockGetContractById = jest.fn<any>();
const mockGetUserContracts = jest.fn<any>();
const mockCancelPendingContract = jest.fn<any>();
const mockGetContractWalletAddresses = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/contract-service.ts'), () => ({
  getContractById: mockGetContractById,
  getUserContracts: mockGetUserContracts,
  updateContractStatus: jest.fn<any>(),
  cancelPendingContract: mockCancelPendingContract,
  getContractWalletAddresses: mockGetContractWalletAddresses,
}));

// ===== PROJECT SERVICE =====
const mockGetProjectById = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

// ===== CONTRACT REPOSITORY =====
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { updateContract: jest.fn<any>() },
}));

// ===== ENTITY MAPPER =====
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (data: any) => data,
}));

// ===== FILE SERVICE (storage-uploader) =====
const mockDeleteFile = jest.fn<any>();
const mockGetSignedUrl = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadFile: jest.fn<any>(),
  deleteFile: mockDeleteFile,
  getSignedUrl: mockGetSignedUrl,
  listUserFiles: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: () => [],
}));

// ===== DISPUTE EVIDENCE SERVICE =====
const mockSubmitEvidence = jest.fn<any>();
const mockGetDisputeEvidence = jest.fn<any>();
const mockDeleteEvidence = jest.fn<any>();
const mockVerifyEvidence = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
  submitEvidence: mockSubmitEvidence,
  getDisputeEvidence: mockGetDisputeEvidence,
  deleteEvidence: mockDeleteEvidence,
  verifyEvidence: mockVerifyEvidence,
}));

// ===== NOTIFICATION SERVICE =====
const mockGetNotificationsByUser = jest.fn<any>();
const mockMarkNotificationRead = jest.fn<any>();
const mockMarkAllNotificationsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getNotificationsByUser: mockGetNotificationsByUser,
  markNotificationAsRead: mockMarkNotificationRead,
  markAllNotificationsAsRead: mockMarkAllNotificationsRead,
  getUnreadCount: mockGetUnreadCount,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: jest.fn<any>(),
  getSSEStats: jest.fn<any>(),
}));

// ===== FREELANCER PROFILE SERVICE =====
const mockCreateProfile = jest.fn<any>();
const mockGetProfileByUserId = jest.fn<any>();
const mockUpdateProfile = jest.fn<any>();
const mockAddSkillsToProfile = jest.fn<any>();
const mockRemoveSkillFromProfile = jest.fn<any>();
const mockAddExperience = jest.fn<any>();
const mockUpdateExperience = jest.fn<any>();
const mockRemoveExperience = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/freelancer-profile-service.ts'), () => ({
  createProfile: mockCreateProfile,
  getProfileByUserId: mockGetProfileByUserId,
  updateProfile: mockUpdateProfile,
  addSkillsToProfile: mockAddSkillsToProfile,
  removeSkillFromProfile: mockRemoveSkillFromProfile,
  addExperience: mockAddExperience,
  updateExperience: mockUpdateExperience,
  removeExperience: mockRemoveExperience,
}));

// ===== REPUTATION SERVICE =====
const mockGetReviewById = jest.fn<any>();
const mockGetUserReviews = jest.fn<any>();
const mockGetProjectReviews = jest.fn<any>();
const mockCanUserRate = jest.fn<any>();
const mockSubmitRating = jest.fn<any>();
const mockGetReputation = jest.fn<any>();
const mockGetWorkHistory = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReviewById: mockGetReviewById,
  getUserReviews: mockGetUserReviews,
  getProjectReviews: mockGetProjectReviews,
  canUserRate: mockCanUserRate,
  submitRating: mockSubmitRating,
  getReputation: mockGetReputation,
  getWorkHistory: mockGetWorkHistory,
}));

// ===== REPUTATION AGGREGATION SERVICE =====
const mockGetAggregatedScore = jest.fn<any>();
const mockGetReputationBreakdown = jest.fn<any>();
const mockGetReputationHistory = jest.fn<any>();
const mockGetReputationLeaderboard = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-aggregation-service.ts'), () => ({
  getAggregatedScore: mockGetAggregatedScore,
  getReputationBreakdown: mockGetReputationBreakdown,
  getReputationHistory: mockGetReputationHistory,
  getReputationLeaderboard: mockGetReputationLeaderboard,
}));

// ===== RUSH UPGRADE SERVICE =====
const mockRequestRushUpgrade = jest.fn<any>();
const mockRespondToRushUpgrade = jest.fn<any>();
const mockAcceptCounterOffer = jest.fn<any>();
const mockDeclineCounterOffer = jest.fn<any>();
const mockGetRushUpgradeRequestsByContract = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/rush-upgrade-service.ts'), () => ({
  requestRushUpgrade: mockRequestRushUpgrade,
  respondToRushUpgrade: mockRespondToRushUpgrade,
  acceptCounterOffer: mockAcceptCounterOffer,
  declineCounterOffer: mockDeclineCounterOffer,
  getRushUpgradeRequestsByContract: mockGetRushUpgradeRequestsByContract,
}));

// ===== SAVED SEARCH SERVICE =====
const mockUpdateSavedSearch = jest.fn<any>();
const mockDeleteSavedSearch = jest.fn<any>();
const mockExecuteSavedSearch = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/saved-search-service.ts'), () => ({
  updateSavedSearch: mockUpdateSavedSearch,
  deleteSavedSearch: mockDeleteSavedSearch,
  executeSavedSearch: mockExecuteSavedSearch,
  createSavedSearch: jest.fn<any>(),
  getUserSavedSearches: jest.fn<any>(),
}));

// ===== TRANSACTION SERVICE =====
const mockGetTransactionById = jest.fn<any>();
const mockGetContractTransactions = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
  getTransactionById: mockGetTransactionById,
  getContractTransactions: mockGetContractTransactions,
  getUserTransactions: jest.fn<any>(),
}));

// ===== SKILL SERVICE =====
const mockCreateCategory = jest.fn<any>();
const mockCreateSkill = jest.fn<any>();
const mockCreateUserCustomSkill = jest.fn<any>();
const mockUpdateUserCustomSkill = jest.fn<any>();
const mockDeleteUserCustomSkill = jest.fn<any>();
const mockSearchSkills = jest.fn<any>();
const mockGetActiveSkillsByCategory = jest.fn<any>();
const mockGetFullTaxonomy = jest.fn<any>();
const mockGetAllCategories = jest.fn<any>();
const mockGetAllSkills = jest.fn<any>();
const mockGetSkillById = jest.fn<any>();
const mockUpdateSkill = jest.fn<any>();
const mockDeleteSkill = jest.fn<any>();
const mockUpdateCategory = jest.fn<any>();
const mockDeleteCategory = jest.fn<any>();
const mockGetCategoryById = jest.fn<any>();
const mockDeprecateSkill = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  deleteCategory: mockDeleteCategory,
  getCategoryById: mockGetCategoryById,
  getAllCategories: mockGetAllCategories,
  createSkill: mockCreateSkill,
  updateSkill: mockUpdateSkill,
  deleteSkill: mockDeleteSkill,
  getSkillById: mockGetSkillById,
  getAllSkills: mockGetAllSkills,
  deprecateSkill: mockDeprecateSkill,
  getFullTaxonomy: mockGetFullTaxonomy,
  searchSkills: mockSearchSkills,
  getActiveSkillsByCategory: mockGetActiveSkillsByCategory,
}));

jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
  createUserCustomSkill: mockCreateUserCustomSkill,
  updateUserCustomSkill: mockUpdateUserCustomSkill,
  deleteUserCustomSkill: mockDeleteUserCustomSkill,
  getUserCustomSkills: jest.fn<any>(),
  getUserCustomSkillById: jest.fn<any>(),
  searchUserCustomSkills: jest.fn<any>(),
  getPendingSkillSuggestions: jest.fn<any>(),
  updateSkillSuggestionStatus: jest.fn<any>(),
}));

// ===== AUTH SERVICE =====
const mockRegisterWithAppwrite = jest.fn<any>();
const mockLoginWithAppwrite = jest.fn<any>();
const mockExchangeCodeForSession = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  isAuthError: (r: any) => r && 'code' in r && 'message' in r,
  validatePasswordStrength: jest.fn().mockReturnValue({ valid: true }),
  loginWithAppwrite: mockLoginWithAppwrite,
  registerWithAppwrite: mockRegisterWithAppwrite,
  getOAuthUrl: jest.fn().mockReturnValue('http://oauth.test'),
  exchangeCodeForSession: mockExchangeCodeForSession,
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
  requestPhoneOtp: jest.fn(),
  requestEmailOtp: jest.fn(),
  requestMagicUrl: jest.fn(),
  verifyAuthToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));

// ===== ADMIN SERVICE =====
const mockGetPlatformStats = jest.fn<any>();
const mockGetAdminAnalytics = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/admin-service.ts'), () => ({
  getPlatformStats: mockGetPlatformStats,
  getUserManagement: jest.fn<any>(),
  suspendUser: jest.fn<any>(),
  unsuspendUser: jest.fn<any>(),
  verifyUser: jest.fn<any>(),
  updateUser: jest.fn<any>(),
  getDisputeManagement: jest.fn<any>(),
  getSystemHealth: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: mockGetAdminAnalytics,
}));

// ===== POOL (for admin routes) =====
const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
  isPostgresAvailable: jest.fn().mockReturnValue(false),
}));

// ===== IMPORTS =====
const escrowRefundRouter = (await import('../../routes/escrow-refund-routes.js')).default;
const paymentRouter = (await import('../../routes/payment-routes.js')).default;
const contractRouter = (await import('../../routes/contract-routes.js')).default;
const fileUploadRouter = (await import('../../routes/file-upload.js')).default;
const disputeEvidenceRouter = (await import('../../routes/dispute-evidence-routes.js')).default;
const notificationRouter = (await import('../../routes/notification-routes.js')).default;
const freelancerRouter = (await import('../../routes/freelancer-routes.js')).default;
const reviewRouter = (await import('../../routes/review-routes.js')).default;
const reputationRouter = (await import('../../routes/reputation-routes.js')).default;
const rushUpgradeRouter = (await import('../../routes/rush-upgrade-routes.js')).default;
const savedSearchRouter = (await import('../../routes/saved-search-routes.js')).default;
const transactionRouter = (await import('../../routes/transaction-routes.js')).default;
const skillRouter = (await import('../../routes/skill-routes.js')).default;
const authRouter = (await import('../../routes/auth-routes.js')).default;
const adminRouter = (await import('../../routes/admin-routes.js')).default;

// ===== HELPERS =====
function setupApp(router: any) {
  const app = express();
  app.use(express.json());
  app.use('/test', router);
  return app;
}

function errorRes(code: string, message: string) {
  return { success: false, error: { code, message } };
}

// ============================================================
// ESCROW REFUND ROUTES
// ============================================================
describe('Escrow Refund Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(escrowRefundRouter);
  });

  it('POST /:contractId/refund-request with no reason → 400', async () => {
    const res = await request(app).post('/test/uuid-1/refund-request').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Refund reason is required');
  });

  it('POST /:contractId/refund-request service failure → 400', async () => {
    mockCreateRefundRequest.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/uuid-1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /:contractId/refund-request service throws → 500', async () => {
    mockCreateRefundRequest.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/test/uuid-1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(500);
  });

  it('GET /:contractId/refunds service failure → 400', async () => {
    mockGetContractRefunds.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/uuid-1/refunds');
    expect(res.status).toBe(400);
  });

  it('GET /:contractId/refunds service throws → 500', async () => {
    mockGetContractRefunds.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/test/uuid-1/refunds');
    expect(res.status).toBe(500);
  });

  it('POST /refunds/:refundId/approve service failure → 400', async () => {
    mockApproveRefund.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/refunds/uuid-1/approve');
    expect(res.status).toBe(400);
  });

  it('POST /refunds/:refundId/approve service throws → 500', async () => {
    mockApproveRefund.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/test/refunds/uuid-1/approve');
    expect(res.status).toBe(500);
  });

  it('POST /refunds/:refundId/reject with no reason → 400', async () => {
    const res = await request(app).post('/test/refunds/uuid-1/reject').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Rejection reason is required');
  });

  it('POST /refunds/:refundId/reject service failure → 400', async () => {
    mockRejectRefund.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/refunds/uuid-1/reject').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /refunds/:refundId/reject service throws → 500', async () => {
    mockRejectRefund.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/test/refunds/uuid-1/reject').send({ reason: 'test' });
    expect(res.status).toBe(500);
  });
});

// ============================================================
// PAYMENT ROUTES
// ============================================================
describe('Payment Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(paymentRouter);
  });

  it('POST /milestones/:milestoneId/complete missing contractId → 400', async () => {
    const res = await request(app).post('/test/milestones/uuid-1/complete');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /milestones/:milestoneId/complete NOT_FOUND → 404', async () => {
    mockRequestMilestoneCompletion.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).post('/test/milestones/uuid-1/complete?contractId=c-1');
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/complete UNAUTHORIZED → 403', async () => {
    mockRequestMilestoneCompletion.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/test/milestones/uuid-1/complete?contractId=c-1');
    expect(res.status).toBe(403);
  });

  it('POST /milestones/:milestoneId/complete other error → 400', async () => {
    mockRequestMilestoneCompletion.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/milestones/uuid-1/complete?contractId=c-1');
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/approve missing contractId → 400', async () => {
    const res = await request(app).post('/test/milestones/uuid-1/approve');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /milestones/:milestoneId/approve NOT_FOUND → 404', async () => {
    mockApproveMilestone.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).post('/test/milestones/uuid-1/approve?contractId=c-1');
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/approve UNAUTHORIZED → 403', async () => {
    mockApproveMilestone.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/test/milestones/uuid-1/approve?contractId=c-1');
    expect(res.status).toBe(403);
  });

  it('POST /milestones/:milestoneId/approve other error → 400', async () => {
    mockApproveMilestone.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/milestones/uuid-1/approve?contractId=c-1');
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/dispute missing contractId → 400', async () => {
    const res = await request(app).post('/test/milestones/uuid-1/dispute').send({ reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /milestones/:milestoneId/dispute missing reason → 400', async () => {
    const res = await request(app).post('/test/milestones/uuid-1/dispute?contractId=c-1').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /milestones/:milestoneId/dispute NOT_FOUND → 404', async () => {
    mockCreateDispute.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).post('/test/milestones/uuid-1/dispute?contractId=c-1').send({ reason: 'test' });
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/dispute UNAUTHORIZED → 403', async () => {
    mockCreateDispute.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/test/milestones/uuid-1/dispute?contractId=c-1').send({ reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('POST /milestones/:milestoneId/dispute other error → 400', async () => {
    mockCreateDispute.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/milestones/uuid-1/dispute?contractId=c-1').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('GET /contracts/:contractId/status NOT_FOUND → 404', async () => {
    mockGetContractPaymentStatus.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/contracts/uuid-1/status');
    expect(res.status).toBe(404);
  });

  it('GET /contracts/:contractId/status UNAUTHORIZED (non-admin) → 403', async () => {
    mockGetContractPaymentStatus.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/test/contracts/uuid-1/status');
    expect(res.status).toBe(403);
  });

  it('GET /contracts/:contractId/status other error → 400', async () => {
    mockGetContractPaymentStatus.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/contracts/uuid-1/status');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// CONTRACT ROUTES
// ============================================================
describe('Contract Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(contractRouter);
  });

  it('GET /:id user not in contract and not admin → 403', async () => {
    mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', freelancerId: 'other', employerId: 'other2', status: 'active' } });
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(403);
  });

  it('POST /:id/fund contract already active with escrow → 200', async () => {
    mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'active', escrowAddress: '0x123' } });
    const res = await request(app).post('/test/uuid-1/fund');
    expect(res.status).toBe(200);
    expect(res.body.contractStatus).toBe('active');
  });

  it('POST /:id/fund contract not pending → 400', async () => {
    mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'completed', escrowAddress: null } });
    const res = await request(app).post('/test/uuid-1/fund');
    expect(res.status).toBe(400);
  });

  it('POST /:id/fund escrow deployment fails with AMOUNT_MISMATCH → 400', async () => {
    mockGetContractById.mockResolvedValue({ success: true, data: { id: 'c-1', employerId: 'user-1', status: 'pending', projectId: 'p-1', totalAmount: 100 } });
    mockGetProjectById.mockResolvedValue({ success: true, data: { milestones: [] } });
    mockGetContractWalletAddresses.mockResolvedValue({ success: true, data: { employerWallet: '0x1', freelancerWallet: '0x2' } });
    mockInitializeContractEscrow.mockResolvedValue(errorRes('AMOUNT_MISMATCH', 'Amount mismatch'));
    const res = await request(app).post('/test/uuid-1/fund').send({});
    expect(res.status).toBe(400);
  });

  it('POST /:id/cancel NOT_FOUND → 404', async () => {
    mockCancelPendingContract.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).post('/test/uuid-1/cancel');
    expect(res.status).toBe(404);
  });

  it('POST /:id/cancel UNAUTHORIZED → 403', async () => {
    mockCancelPendingContract.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/test/uuid-1/cancel');
    expect(res.status).toBe(403);
  });

  it('POST /:id/cancel other error → 400', async () => {
    mockCancelPendingContract.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/uuid-1/cancel');
    expect(res.status).toBe(400);
  });

  it('GET /:contractId/disputes NOT_FOUND → 404', async () => {
    mockGetDisputesByContract.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1/disputes');
    expect(res.status).toBe(404);
  });

  it('GET /:contractId/disputes UNAUTHORIZED → 403', async () => {
    mockGetDisputesByContract.mockResolvedValue(errorRes('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/test/uuid-1/disputes');
    expect(res.status).toBe(403);
  });

  it('GET /:contractId/disputes other error → 400', async () => {
    mockGetDisputesByContract.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/uuid-1/disputes');
    expect(res.status).toBe(400);
  });

  it('GET /:contractId/disputes throws → 500', async () => {
    mockGetDisputesByContract.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/test/uuid-1/disputes');
    expect(res.status).toBe(500);
  });
});

// ============================================================
// FILE UPLOAD ROUTES
// ============================================================
describe('File Upload Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(fileUploadRouter);
  });

  it('DELETE /:bucket/* with path containing ".." → 400', async () => {
    const res = await request(app).delete('/test/profile-images/user-1/..%2Fetc/passwd');
    expect(res.status).toBe(400);
  });

  it('DELETE /:bucket/* with path containing "\\" → 400', async () => {
    const res = await request(app).delete('/test/profile-images/user-1/foo%5Cbar');
    expect(res.status).toBe(400);
  });

  it('GET /signed-url/:bucket/* with path containing ".." → 400', async () => {
    const res = await request(app).get('/test/signed-url/profile-images/user-1/..%2Fetc/passwd');
    expect(res.status).toBe(400);
  });

  it('GET /signed-url/:bucket/* with path containing "\\" → 400', async () => {
    const res = await request(app).get('/test/signed-url/profile-images/user-1/foo%5Cbar');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// DISPUTE EVIDENCE ROUTES (requestId branches)
// ============================================================
describe('Dispute Evidence Routes - requestId branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(disputeEvidenceRouter);
  });

  it('POST /:disputeId/evidence without x-request-id header (defaults to unknown)', async () => {
    mockSubmitEvidence.mockResolvedValue({ success: true, data: { id: 'ev-1' } });
    const res = await request(app).post('/test/uuid-1/evidence').send({ evidenceType: 'document', description: 'test' });
    expect(res.status).toBe(200);
  });

  it('GET /:disputeId/evidence without x-request-id header', async () => {
    mockGetDisputeEvidence.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/uuid-1/evidence');
    expect(res.status).toBe(200);
  });

  it('DELETE /:disputeId/evidence/:evidenceId without x-request-id header', async () => {
    mockDeleteEvidence.mockResolvedValue({ success: true });
    const res = await request(app).delete('/test/uuid-1/evidence/uuid-2');
    expect(res.status).toBe(200);
  });

  it('POST /:disputeId/evidence/:evidenceId/verify without x-request-id header', async () => {
    mockVerifyEvidence.mockResolvedValue({ success: true, data: { verified: true } });
    const res = await request(app).post('/test/uuid-1/evidence/uuid-2/verify');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// NOTIFICATION ROUTES (branch gaps)
// ============================================================
describe('Notification Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(notificationRouter);
  });

  it('GET / with maxItemCount query param', async () => {
    mockGetNotificationsByUser.mockResolvedValue({ success: true, data: { items: [], hasMore: false } });
    const res = await request(app).get('/test?maxItemCount=10');
    expect(res.status).toBe(200);
  });

  it('GET / with continuationToken query param', async () => {
    mockGetNotificationsByUser.mockResolvedValue({ success: true, data: { items: [], hasMore: false } });
    const res = await request(app).get('/test?continuationToken=abc');
    expect(res.status).toBe(200);
  });

  it('PATCH /:id/read success', async () => {
    mockMarkNotificationRead.mockResolvedValue({ success: true, data: { id: 'n-1', isRead: true } });
    const res = await request(app).patch('/test/uuid-1/read');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// FREELANCER ROUTES (branch gaps)
// ============================================================
describe('Freelancer Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(freelancerRouter);
  });

  it('POST /profile service failure with PROFILE_EXISTS → 409', async () => {
    mockCreateProfile.mockResolvedValue(errorRes('PROFILE_EXISTS', 'Already exists'));
    const res = await request(app).post('/test/profile').send({ bio: 'A long enough bio here', hourlyRate: 50 });
    expect(res.status).toBe(409);
  });

  it('POST /profile service failure with other code → 400', async () => {
    mockCreateProfile.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/profile').send({ bio: 'A long enough bio here', hourlyRate: 50 });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile service failure with PROFILE_NOT_FOUND → 404', async () => {
    mockUpdateProfile.mockResolvedValue(errorRes('PROFILE_NOT_FOUND', 'Not found'));
    const res = await request(app).patch('/test/profile').send({ bio: 'Updated bio is long enough' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile service failure with other code → 400', async () => {
    mockUpdateProfile.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).patch('/test/profile').send({ bio: 'Updated bio is long enough' });
    expect(res.status).toBe(400);
  });

  it('DELETE /profile/skills/:name service failure with PROFILE_NOT_FOUND → 404', async () => {
    mockRemoveSkillFromProfile.mockResolvedValue(errorRes('PROFILE_NOT_FOUND', 'Not found'));
    const res = await request(app).delete('/test/profile/skills/React');
    expect(res.status).toBe(404);
  });

  it('DELETE /profile/skills/:name service failure with other code → 400', async () => {
    mockRemoveSkillFromProfile.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).delete('/test/profile/skills/React');
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/experience/:id service failure with PROFILE_NOT_FOUND → 404', async () => {
    mockUpdateExperience.mockResolvedValue(errorRes('PROFILE_NOT_FOUND', 'Not found'));
    const res = await request(app).patch('/test/profile/experience/uuid-1').send({ title: 'New Title' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile/experience/:id service failure with INVALID_DATE_RANGE → 400', async () => {
    mockUpdateExperience.mockResolvedValue(errorRes('INVALID_DATE_RANGE', 'Bad dates'));
    const res = await request(app).patch('/test/profile/experience/uuid-1').send({ title: 'New Title' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/experience/:id service failure with other code → 400', async () => {
    mockUpdateExperience.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).patch('/test/profile/experience/uuid-1').send({ title: 'New Title' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/experience/:id success → 200', async () => {
    mockUpdateExperience.mockResolvedValue({ success: true, data: { id: 'exp-1' } });
    const res = await request(app).patch('/test/profile/experience/uuid-1').send({ title: 'New Title' });
    expect(res.status).toBe(200);
  });

  it('DELETE /profile/experience/:id service failure with PROFILE_NOT_FOUND → 404', async () => {
    mockRemoveExperience.mockResolvedValue(errorRes('PROFILE_NOT_FOUND', 'Not found'));
    const res = await request(app).delete('/test/profile/experience/uuid-1');
    expect(res.status).toBe(404);
  });

  it('DELETE /profile/experience/:id service failure with other code → 400', async () => {
    mockRemoveExperience.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).delete('/test/profile/experience/uuid-1');
    expect(res.status).toBe(400);
  });

  it('DELETE /profile/experience/:id success → 200', async () => {
    mockRemoveExperience.mockResolvedValue({ success: true, data: { id: 'exp-1' } });
    const res = await request(app).delete('/test/profile/experience/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /:id success → 200', async () => {
    mockGetProfileByUserId.mockResolvedValue({ success: true, data: { id: 'fp-1', userId: 'u-1', experience: [] } });
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /:id failure → 404', async () => {
    mockGetProfileByUserId.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// REVIEW ROUTES (entry line coverage)
// ============================================================
describe('Review Routes - entry line coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(reviewRouter);
  });

  it('GET /:id handler entry', async () => {
    mockGetReviewById.mockResolvedValue({ success: true, data: { id: 'r-1' } });
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /user/:userId handler entry', async () => {
    mockGetUserReviews.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/user/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /project/:projectId handler entry', async () => {
    mockGetProjectReviews.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/project/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /can-review/:contractId handler entry', async () => {
    mockCanUserRate.mockResolvedValue({ success: true, data: { canRate: true } });
    const res = await request(app).get('/test/can-review/uuid-1?rateeId=uuid-2');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// REPUTATION ROUTES (branch gaps)
// ============================================================
describe('Reputation Routes - branch gaps', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(reputationRouter);
  });

  it('GET /:userId success', async () => {
    mockGetReputation.mockResolvedValue({ success: true, data: { userId: 'u-1', score: 4.5 } });
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /:userId/history success', async () => {
    mockGetWorkHistory.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/uuid-1/history');
    expect(res.status).toBe(200);
  });

  it('GET /:userId/score success', async () => {
    mockGetAggregatedScore.mockResolvedValue({ success: true, data: { score: 4.5 } });
    const res = await request(app).get('/test/uuid-1/score');
    expect(res.status).toBe(200);
  });

  it('GET /:userId/breakdown success', async () => {
    mockGetReputationBreakdown.mockResolvedValue({ success: true, data: { breakdown: {} } });
    const res = await request(app).get('/test/uuid-1/breakdown');
    expect(res.status).toBe(200);
  });

  it('GET /:userId/reputation-history success', async () => {
    mockGetReputationHistory.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/uuid-1/reputation-history');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// RUSH UPGRADE ROUTES (success coverage)
// ============================================================
describe('Rush Upgrade Routes - success coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(rushUpgradeRouter);
  });

  it('POST /contracts/:id/rush-upgrade success', async () => {
    mockRequestRushUpgrade.mockResolvedValue({ success: true, data: { id: 'req-1' } });
    const res = await request(app).post('/test/contracts/uuid-1/rush-upgrade').send({ proposedPercentage: 15 });
    expect(res.status).toBe(201);
  });

  it('POST /rush-upgrade-requests/:id/respond success', async () => {
    mockRespondToRushUpgrade.mockResolvedValue({ success: true, data: { id: 'req-1', status: 'accepted' } });
    const res = await request(app).post('/test/rush-upgrade-requests/uuid-1/respond').send({ action: 'accept' });
    expect(res.status).toBe(200);
  });

  it('POST /rush-upgrade-requests/:id/accept-counter success', async () => {
    mockAcceptCounterOffer.mockResolvedValue({ success: true, data: { id: 'req-1', accepted: true } });
    const res = await request(app).post('/test/rush-upgrade-requests/uuid-1/accept-counter');
    expect(res.status).toBe(200);
  });

  it('POST /rush-upgrade-requests/:id/decline-counter success', async () => {
    mockDeclineCounterOffer.mockResolvedValue({ success: true, data: { id: 'req-1', declined: true } });
    const res = await request(app).post('/test/rush-upgrade-requests/uuid-1/decline-counter');
    expect(res.status).toBe(200);
  });

  it('GET /contracts/:id/rush-upgrade-requests success', async () => {
    mockGetRushUpgradeRequestsByContract.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/contracts/uuid-1/rush-upgrade-requests');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// SAVED SEARCH ROUTES (success coverage)
// ============================================================
describe('Saved Search Routes - success coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(savedSearchRouter);
  });

  it('PATCH /:id success', async () => {
    mockUpdateSavedSearch.mockResolvedValue({ success: true, data: { id: 'ss-1' } });
    const res = await request(app).patch('/test/uuid-1').send({ name: 'new' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:id success', async () => {
    mockDeleteSavedSearch.mockResolvedValue({ success: true });
    const res = await request(app).delete('/test/uuid-1');
    expect(res.status).toBe(200);
  });

  it('POST /:id/execute success', async () => {
    mockExecuteSavedSearch.mockResolvedValue({ success: true, data: { results: [] } });
    const res = await request(app).post('/test/uuid-1/execute');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// TRANSACTION ROUTES (success coverage)
// ============================================================
describe('Transaction Routes - success coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(transactionRouter);
  });

  it('GET /:id success', async () => {
    mockGetTransactionById.mockResolvedValue({ success: true, data: { id: 'tx-1' } });
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(200);
  });

  it('GET /contract/:contractId success', async () => {
    mockGetContractTransactions.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/test/contract/uuid-1');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// SKILL ROUTES (remaining branch lines)
// ============================================================
describe('Skill Routes - remaining branch lines', () => {
  let app: any;

  function setup() {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/skills', skillRouter);
  }

  beforeEach(setup);

  it('POST /categories DUPLICATE_CATEGORY → 409', async () => {
    mockCreateCategory.mockResolvedValue(errorRes('DUPLICATE_CATEGORY', 'Exists'));
    const res = await request(app).post('/api/skills/categories').send({ name: 'Test', description: 'Test desc' });
    expect(res.status).toBe(409);
  });

  it('POST / DUPLICATE_SKILL → 409', async () => {
    mockCreateSkill.mockResolvedValue(errorRes('DUPLICATE_SKILL', 'Exists'));
    const res = await request(app).post('/api/skills/').send({ categoryId: 'cat-1', name: 'Test', description: 'Test desc' });
    expect(res.status).toBe(409);
  });

  it('POST /custom SKILL_EXISTS_GLOBALLY → 409', async () => {
    mockCreateUserCustomSkill.mockResolvedValue(errorRes('SKILL_EXISTS_GLOBALLY', 'Exists'));
    const res = await request(app).post('/api/skills/custom').send({ name: 'Custom', description: 'A custom skill description', yearsOfExperience: 5 });
    expect(res.status).toBe(409);
  });

  it('PUT /custom/:id SKILL_NOT_FOUND → 404', async () => {
    mockUpdateUserCustomSkill.mockResolvedValue(errorRes('SKILL_NOT_FOUND', 'Not found'));
    const res = await request(app).put('/api/skills/custom/skill-1').send({ name: 'Updated', description: 'Updated description with enough chars' });
    expect(res.status).toBe(404);
  });

  it('DELETE /custom/:id SKILL_NOT_FOUND → 404', async () => {
    mockDeleteUserCustomSkill.mockResolvedValue(errorRes('SKILL_NOT_FOUND', 'Not found'));
    const res = await request(app).delete('/api/skills/custom/skill-1');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// AUTH ROUTES - /oauth/register endpoint
// ============================================================
describe('Auth Routes - /oauth/register endpoint', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(authRouter);
  });

  it('POST /oauth/register without accessToken → 400', async () => {
    const res = await request(app).post('/test/oauth/register').send({ role: 'freelancer' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /oauth/register without valid role → 400', async () => {
    const res = await request(app).post('/test/oauth/register').send({ accessToken: 'token', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('POST /oauth/register with validation errors → 400', async () => {
    const res = await request(app).post('/test/oauth/register').send({});
    expect(res.status).toBe(400);
  });

  it('POST /oauth/register service returns auth error → 401', async () => {
    mockRegisterWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });
    const res = await request(app).post('/test/oauth/register').send({ accessToken: 'token', role: 'freelancer' });
    expect(res.status).toBe(401);
  });

  it('POST /oauth/register success → 201', async () => {
    mockRegisterWithAppwrite.mockResolvedValue({
      user: { id: 'u-1', email: 'test@test.com', role: 'freelancer' },
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    const res = await request(app).post('/test/oauth/register').send({ accessToken: 'token', role: 'freelancer' });
    expect(res.status).toBe(201);
  });

  it('POST /oauth/register throws → 500', async () => {
    mockRegisterWithAppwrite.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/test/oauth/register').send({ accessToken: 'token', role: 'freelancer' });
    expect(res.status).toBe(500);
  });
});

// ============================================================
// ADMIN ROUTES - Reviews query catch block
// ============================================================
describe('Admin Routes - reviews query catch block', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalUsers: 100 } });
    app = setupApp(adminRouter);
  });

  it('GET /stats handles pool.query rejection', async () => {
    mockPool.query.mockRejectedValue(new Error('DB error'));
    const res = await request(app).get('/test/stats');
    expect(res.status).toBe(200);
  });
});
