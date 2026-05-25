import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockGetUserById = jest.fn() as jest.Mock<any>;
const mockUpdateUserName = jest.fn() as jest.Mock<any>;
const mockGetKycByUserId = jest.fn() as jest.Mock<any>;
const mockGetKycById = jest.fn() as jest.Mock<any>;
const mockGetKycBySessionId = jest.fn() as jest.Mock<any>;
const mockUpdateKyc = jest.fn() as jest.Mock<any>;
const mockCreateKyc = jest.fn() as jest.Mock<any>;
const mockGetKycsByStatus = jest.fn() as jest.Mock<any>;
const mockGetPendingReviews = jest.fn() as jest.Mock<any>;
const mockGetKycHistory = jest.fn() as jest.Mock<any>;
const mockCreateSession = jest.fn() as jest.Mock<any>;
const mockGetSession = jest.fn() as jest.Mock<any>;
const mockVerifyId = jest.fn() as jest.Mock<any>;
const mockCheckLiveness = jest.fn() as jest.Mock<any>;
const mockMatchFaces = jest.fn() as jest.Mock<any>;
const mockScreenAml = jest.fn() as jest.Mock<any>;
const mockFreelancerGetProfile = jest.fn() as jest.Mock<any>;
const mockFreelancerCreateProfile = jest.fn() as jest.Mock<any>;
const mockFreelancerUpdateProfile = jest.fn() as jest.Mock<any>;
const mockEmployerGetProfile = jest.fn() as jest.Mock<any>;
const mockEmployerCreateProfile = jest.fn() as jest.Mock<any>;
const mockEmployerUpdateProfile = jest.fn() as jest.Mock<any>;
const mockLogger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: mockGetUserById, updateUserName: mockUpdateUserName },
}));
jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  createKycVerification: mockCreateKyc,
  getKycVerificationById: mockGetKycById,
  getKycVerificationByUserId: mockGetKycByUserId,
  getKycVerificationBySessionId: mockGetKycBySessionId,
  updateKycVerification: mockUpdateKyc,
  getKycVerificationsByStatus: mockGetKycsByStatus,
  getPendingReviews: mockGetPendingReviews,
  getKycVerificationHistory: mockGetKycHistory,
}));
jest.unstable_mockModule(resolveModule('src/services/didit-client.ts'), () => ({
  createVerificationSession: mockCreateSession,
  getVerificationSession: mockGetSession,
  verifyIdDocument: mockVerifyId,
  checkPassiveLiveness: mockCheckLiveness,
  matchFaces: mockMatchFaces,
  screenAml: mockScreenAml,
}));
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: {
    getProfileByUserId: mockFreelancerGetProfile,
    createProfile: mockFreelancerCreateProfile,
    updateProfile: mockFreelancerUpdateProfile,
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: {
    getProfileByUserId: mockEmployerGetProfile,
    createProfile: mockEmployerCreateProfile,
    updateProfile: mockEmployerUpdateProfile,
  },
}));

const {
  initiateKycVerification,
  getKycStatus,
  getKycById,
  refreshVerificationStatus,
  processWebhook,
  getProfileDataFromKyc,
  adminReviewVerification,
  getPendingAdminReviews,
  getVerificationsByStatus,
  getUserVerificationHistory,
  isUserVerified,
  manualKycVerification,
} = await import('../../services/didit-kyc-service.js');

function makeKyc(overrides: Record<string, any> = {}) {
  return {
    id: 'kyc-1',
    user_id: 'user-1',
    status: 'pending',
    didit_session_id: 'session-abc',
    didit_session_token: 'token-abc',
    didit_session_url: 'https://didit.me/session/abc',
    didit_workflow_id: 'wf-1',
    created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSession() {
  return {
    session_id: 'session-new',
    session_token: 'token-new',
    url: 'https://didit.me/session/new',
    workflow_id: 'wf-1',
    status: 'Not Started',
  };
}

describe('didit-kyc-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'freelancer' });
    mockGetKycByUserId.mockResolvedValue(null);
    mockCreateSession.mockResolvedValue({ success: true, data: makeSession() });
    mockCreateKyc.mockResolvedValue(makeKyc());
    mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'pending' }));
    mockFreelancerGetProfile.mockResolvedValue(null);
    mockFreelancerCreateProfile.mockResolvedValue({});
    mockFreelancerUpdateProfile.mockResolvedValue({});
    mockEmployerGetProfile.mockResolvedValue(null);
    mockEmployerCreateProfile.mockResolvedValue({});
    mockEmployerUpdateProfile.mockResolvedValue({});
    mockUpdateUserName.mockResolvedValue({});
    mockGetKycsByStatus.mockResolvedValue([]);
    mockGetPendingReviews.mockResolvedValue([]);
    mockGetKycHistory.mockResolvedValue([]);
  });

  describe('initiateKycVerification', () => {
    it('should return USER_NOT_FOUND when user does not exist', async () => {
      mockGetUserById.mockResolvedValue(null);
      const result = await initiateKycVerification({ user_id: 'ghost' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return ALREADY_VERIFIED when KYC is approved', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'approved' }));
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should return RETRY_COOLDOWN when existing KYC is within 24-hour window', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'rejected',
        created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      }));
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RETRY_COOLDOWN');
        expect(result.error.message).toContain('hour');
      }
    });

    it('should allow retry when 24-hour cooldown has passed', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'rejected',
        created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
      }));
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalled();
    });

    it('should return DIDIT_API_ERROR when session creation fails', async () => {
      mockCreateSession.mockResolvedValue({
        success: false,
        error: { error: { code: 'DIDIT_FAIL', message: 'API failed' } },
      });
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DIDIT_FAIL');
    });

    it('should return DATABASE_ERROR when KYC record creation returns null', async () => {
      mockCreateKyc.mockResolvedValue(null);
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });

    it('should create a new KYC record when no existing verification', async () => {
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(true);
      expect(mockCreateKyc).toHaveBeenCalledTimes(1);
    });

    it('should update existing KYC record when existing verification exists and cooldown passed', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'pending' }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'pending' }));
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalled();
      expect(mockCreateKyc).not.toHaveBeenCalled();
    });
  });

  describe('getKycStatus', () => {
    it('should return null when no verification exists', async () => {
      const result = await getKycStatus('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    });

    it('should return the verification when it exists', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'approved' }));
      const result = await getKycStatus('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data?.status).toBe('approved');
    });
  });

  describe('getKycById', () => {
    it('should return the verification by ID', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      const result = await getKycById('kyc-1');
      expect(result.success).toBe(true);
    });

    it('should return null when not found', async () => {
      mockGetKycById.mockResolvedValue(null);
      const result = await getKycById('nonexistent');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    });
  });

  describe('refreshVerificationStatus', () => {
    it('should return VERIFICATION_NOT_FOUND when not found', async () => {
      mockGetKycById.mockResolvedValue(null);
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_NOT_FOUND');
    });

    it('should return DIDIT_API_ERROR when session fetch fails', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({
        success: false,
        error: { error: { code: 'SESSION_ERROR', message: 'session not found' } },
      });
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('SESSION_ERROR');
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'In Progress' } });
      mockUpdateKyc.mockResolvedValue(null);
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should set completed_at when status is Completed', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'Completed' } });
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved', completed_at: new Date().toISOString() }));
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ completed_at: expect.any(String) })
      );
    });

    it('should map Not Started to pending', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'Not Started' } });
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'pending' }));
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(true);
    });
  });

  describe('processWebhook', () => {
    it('should return VERIFICATION_NOT_FOUND when session not found', async () => {
      mockGetKycBySessionId.mockResolvedValue(null);
      const result = await processWebhook({ session_id: 'session-x', status: 'Approved', timestamp: Date.now() / 1000 } as any);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_NOT_FOUND');
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(null);
      const result = await processWebhook({ session_id: 'session-abc', status: 'Declined', timestamp: Date.now() / 1000 } as any);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should process Approved webhook and trigger profile creation', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'John', last_name: 'Doe', nationality: 'US', status: 'Approved', document_type: 'passport', document_number: 'AB12345', date_of_birth: '1990-01-01', issuing_state_name: 'US' }],
          liveness_checks: [{ status: 'Approved', score: 0.99 }],
          face_matches: [{ status: 'Approved', score: 0.95 }],
          ip_analyses: [{ ip_address: '1.2.3.4', ip_country_code: 'US', is_vpn_or_tor: false, is_data_center: false }],
        },
      } as any);

      expect(result.success).toBe(true);
    });

    it('should process Declined webhook without profile creation', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'rejected' }));

      const result = await processWebhook({ session_id: 'session-abc', status: 'Declined', timestamp: Date.now() / 1000 } as any);
      expect(result.success).toBe(true);
      expect(mockFreelancerCreateProfile).not.toHaveBeenCalled();
    });

    it('should process In Review webhook (maps to completed)', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'completed', decision: 'review' }));

      const result = await processWebhook({ session_id: 'session-abc', status: 'In Review', timestamp: Date.now() / 1000 } as any);
      expect(result.success).toBe(true);
    });

    it('should handle approved webhook with employer role', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc({ user_id: 'employer-1' }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ user_id: 'employer-1', status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'employer-1', name: 'Boss', role: 'employer' });

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Approved', timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ first_name: 'Boss', last_name: 'Man', nationality: 'UK', status: 'Approved' }] },
      } as any);

      expect(result.success).toBe(true);
      expect(mockEmployerCreateProfile).toHaveBeenCalled();
    });

    it('should update existing freelancer profile when KYC approved', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });
      mockFreelancerGetProfile.mockResolvedValue({ id: 'profile-1', name: 'Old Name' });

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Approved', timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ first_name: 'John', last_name: 'Doe', nationality: 'US', status: 'Approved' }] },
      } as any);

      expect(result.success).toBe(true);
      expect(mockFreelancerUpdateProfile).toHaveBeenCalled();
    });
  });

  describe('getProfileDataFromKyc', () => {
    it('should return NO_KYC when no verification exists', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      const result = await getProfileDataFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_KYC');
    });

    it('should return KYC_NOT_APPROVED when status is not approved', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'pending' }));
      const result = await getProfileDataFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should return profile data when KYC is approved', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'approved',
        first_name: 'John',
        last_name: 'Doe',
        nationality: 'US',
        completed_at: new Date().toISOString(),
      }));
      const result = await getProfileDataFromKyc('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.name).toBe('John Doe');
        expect(result.data?.nationality).toBe('US');
        expect(result.data?.kyc_verified).toBe(true);
      }
    });

    it('should return null name when first/last names missing', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'approved',
        first_name: null,
        last_name: null,
      }));
      const result = await getProfileDataFromKyc('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data?.name).toBeNull();
    });
  });

  describe('adminReviewVerification', () => {
    it('should return VERIFICATION_NOT_FOUND when not found', async () => {
      mockGetKycById.mockResolvedValue(null);
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_NOT_FOUND');
    });

    it('should return INVALID_STATUS when verification is not completed', async () => {
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'pending' }));
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'completed' }));
      mockUpdateKyc.mockResolvedValue(null);
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should approve verification and set expiry', async () => {
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'completed', expires_at: null }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved', expires_at: new Date().toISOString() }));
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved', 'Looks good');
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith('kyc-1', expect.objectContaining({ status: 'approved', admin_notes: 'Looks good' }));
    });

    it('should reject verification without triggering profile sync', async () => {
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'completed' }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'rejected' }));
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'rejected');
      expect(result.success).toBe(true);
      expect(mockFreelancerCreateProfile).not.toHaveBeenCalled();
    });

    it('should not set expiry if already set on approval', async () => {
      const existingExpiry = new Date(Date.now() + 3600_000).toISOString();
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'completed', expires_at: existingExpiry }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved', expires_at: existingExpiry }));
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved');
      expect(result.success).toBe(true);
      const updateArgs = mockUpdateKyc.mock.calls[0] as any[];
      expect(updateArgs[1]).not.toHaveProperty('expires_at');
    });
  });

  describe('getPendingAdminReviews', () => {
    it('should return list of pending reviews', async () => {
      mockGetPendingReviews.mockResolvedValue([makeKyc({ status: 'completed' })]);
      const result = await getPendingAdminReviews();
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(1);
    });
  });

  describe('getVerificationsByStatus', () => {
    it('should return verifications for the given status', async () => {
      mockGetKycsByStatus.mockResolvedValue([makeKyc({ status: 'approved' })]);
      const result = await getVerificationsByStatus('approved');
      expect(result.success).toBe(true);
    });
  });

  describe('getUserVerificationHistory', () => {
    it('should return verification history', async () => {
      mockGetKycHistory.mockResolvedValue([makeKyc(), makeKyc({ id: 'kyc-2' })]);
      const result = await getUserVerificationHistory('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(2);
    });
  });

  describe('isUserVerified', () => {
    it('should return false when no verification exists', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      expect(await isUserVerified('user-1')).toBe(false);
    });

    it('should return false when status is not approved', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'pending' }));
      expect(await isUserVerified('user-1')).toBe(false);
    });

    it('should return false when verification is expired', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'approved',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }));
      expect(await isUserVerified('user-1')).toBe(false);
    });

    it('should return true when verification is approved and not expired', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({
        status: 'approved',
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      }));
      expect(await isUserVerified('user-1')).toBe(true);
    });

    it('should return true when approved with no expiry date', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'approved', expires_at: null }));
      expect(await isUserVerified('user-1')).toBe(true);
    });
  });

  describe('manualKycVerification', () => {
    const params = {
      userId: 'user-1',
      adminUserId: 'admin-1',
      idFrontImage: Buffer.from('front'),
      selfieImage: Buffer.from('selfie'),
    };

    const approvedIdResult = {
      success: true,
      data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe', nationality: 'US', document_type: 'passport', document_number: 'AB1' } },
    };
    const approvedLiveness = { success: true, data: { passive_liveness: { status: 'Approved', score: 0.99 } } };
    const approvedFaceMatch = { success: true, data: { face_match: { status: 'Approved', score: 0.95 } } };
    const approvedAml = { success: true, data: { aml: { status: 'No Match', total_hits: 0 } } };

    it('should return USER_NOT_FOUND when user does not exist', async () => {
      mockGetUserById.mockResolvedValue(null);
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return ALREADY_VERIFIED when user has approved KYC', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'approved' }));
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should return ID_VERIFICATION_FAILED when verifyIdDocument fails', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue({ success: false, error: { message: 'api err' } });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ID_VERIFICATION_FAILED');
    });

    it('should return ID_DECLINED when ID status is not Approved', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue({ success: true, data: { id_verification: { status: 'Declined' } } });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ID_DECLINED');
    });

    it('should return LIVENESS_CHECK_FAILED when liveness fails', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue({ success: false });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('LIVENESS_CHECK_FAILED');
    });

    it('should return LIVENESS_DECLINED when liveness status is not Approved', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue({ success: true, data: { passive_liveness: { status: 'Declined' } } });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('LIVENESS_DECLINED');
    });

    it('should return FACE_MATCH_FAILED when face match fails', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue({ success: false });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FACE_MATCH_FAILED');
    });

    it('should return FACE_MISMATCH when face match status is not Approved', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue({ success: true, data: { face_match: { status: 'Declined', score: 0.1 } } });
      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FACE_MISMATCH');
    });

    it('should complete manual KYC successfully with all checks passing', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue(approvedAml);
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
    });
  });
});
