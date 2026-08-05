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

    it('should return a database error when the lookup fails', async () => {
      mockGetKycByUserId.mockRejectedValueOnce(new Error('select failed'));
      const result = await getKycStatus('user-1');
      expect(result).toEqual({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Unable to load KYC verification status',
        },
      });
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

    // BLF-7.1: Prevent admin self-review
    it('should return SELF_REVIEW_FORBIDDEN when admin reviews own KYC', async () => {
      mockGetKycById.mockResolvedValue(makeKyc({ status: 'completed', user_id: 'admin-1' }));
      const result = await adminReviewVerification('kyc-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('SELF_REVIEW_FORBIDDEN');
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

    it('should mark as needing review when AML screening finds hits', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue({ success: true, data: { aml: { status: 'Declined', total_hits: 1 } } });
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'completed', decision: 'review' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('completed');
      }
    });

    it('should update existing verification in manual KYC flow', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'pending' }));
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue(approvedAml);
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalled();
      expect(mockCreateKyc).not.toHaveBeenCalled();
    });

    it('should handle errors in manual KYC verification', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockRejectedValue(new Error('API crash'));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_ERROR');
    });

    it('should handle errors with non-Error thrown in manual KYC', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockRejectedValue('string error');

      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_ERROR');
    });
  });

  describe('processWebhook - deduplication', () => {
    it('should ignore duplicate webhook events', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      // First call with event_id
      await processWebhook({
        session_id: 'session-abc', status: 'Approved', timestamp: Date.now() / 1000,
        event_id: 'evt-dedup-1',
      } as any);

      // Second call with same event_id - should be deduplicated
      const result = await processWebhook({
        session_id: 'session-abc', status: 'Declined', timestamp: Date.now() / 1000,
        event_id: 'evt-dedup-1',
      } as any);

      expect(result.success).toBe(true);
      // updateKyc should only have been called once (for the first call)
      expect(mockUpdateKyc).toHaveBeenCalledTimes(1);
    });
  });

  describe('processWebhook - employer profile paths', () => {
    it('should update existing employer profile when KYC approved', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc({ user_id: 'employer-1' }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ user_id: 'employer-1', status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'employer-1', name: 'Boss', role: 'employer' });
      mockEmployerGetProfile.mockResolvedValue({ id: 'profile-1', name: 'Old Name' });

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Approved', timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ first_name: 'Boss', last_name: 'Man', nationality: 'UK', status: 'Approved' }] },
      } as any);

      expect(result.success).toBe(true);
      expect(mockEmployerUpdateProfile).toHaveBeenCalled();
    });
  });

  describe('refreshVerificationStatus - additional status mappings', () => {
    it('should map Kyc Expired to expired status', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'Kyc Expired' } });
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(true);
    });

    it('should map Abandoned to expired status', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'Abandoned' } });
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(true);
    });

    it('should map Expired to expired status', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({ success: true, data: { status: 'Expired' } });
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Coverage gap tests — each test targets a specific uncovered line
// ═══════════════════════════════════════════════════════════════

describe('didit-kyc-service - Coverage Gaps', () => {
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

  describe('cleanupProcessedEvents (L229-232) and dedup cleanup trigger (L253-254)', () => {
    it('L229-232,253-254: should trigger cleanup when event map exceeds 1000 entries', async () => {
      // Send 1001 unique webhook events to fill the map beyond the threshold
      // The 1001st event will trigger cleanupProcessedEvents()
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      for (let i = 0; i < 1001; i++) {
        await processWebhook({
          session_id: 'session-abc',
          status: 'Approved',
          timestamp: Date.now() / 1000,
          event_id: `evt-cleanup-${i}`,
        } as any);
      }

      // The cleanup should have been triggered on the 1001st event
      // Verify the function still works correctly after cleanup
      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        event_id: 'evt-cleanup-after',
      } as any);
      expect(result.success).toBe(true);
    });

    it('L232: should delete stale entries whose timestamps exceed the TTL', async () => {
      // Control Date.now to simulate old and new timestamps
      const baseTime = 1700000000000;
      let currentTime = baseTime;
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      try {
        // Seed the map with entries at the old time (below the 1000 threshold)
        // Use a unique prefix so these don't collide with other tests
        const stalePrefix = `evt-stale-${baseTime}`;
        for (let i = 0; i < 5; i++) {
          await processWebhook({
            session_id: 'session-abc',
            status: 'Approved',
            timestamp: currentTime / 1000,
            event_id: `${stalePrefix}-${i}`,
          } as any);
        }

        // Advance time by 25 hours (past the 24-hour TTL)
        currentTime = baseTime + 25 * 60 * 60 * 1000;

        // Add enough new entries to push the map over the 1000 threshold
        // The exact count depends on how many entries already exist from prior tests.
        // We add events in batches until cleanup fires.
        for (let i = 0; i < 1000; i++) {
          await processWebhook({
            session_id: 'session-abc',
            status: 'Approved',
            timestamp: currentTime / 1000,
            event_id: `evt-fresh-${baseTime}-${i}`,
          } as any);
        }

        // After cleanup, the stale entries should have been deleted.
        // Verify by re-processing one stale event_id — if it was deleted,
        // it should NOT be deduplicated and updateKyc should be called again.
        mockUpdateKyc.mockClear();
        mockGetKycBySessionId.mockResolvedValue(makeKyc());

        const result = await processWebhook({
          session_id: 'session-abc',
          status: 'Approved',
          timestamp: currentTime / 1000,
          event_id: `${stalePrefix}-0`,
        } as any);

        expect(result.success).toBe(true);
        // If the stale entry was deleted, updateKyc gets called for this "new" event
        expect(mockUpdateKyc).toHaveBeenCalled();
      } finally {
        dateSpy.mockRestore();
      }
    });
  });

  describe('processWebhook dedup - verification not found on duplicate (L243-250)', () => {
    it('L243-250: should fall through when duplicate event has no existing verification', async () => {
      // First call with event_id — stores it in the map
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        event_id: 'evt-dup-no-ver',
      } as any);

      // Second call with same event_id but verification not found
      // Use mockResolvedValue (not mockResolvedValueOnce) so BOTH getKycVerificationBySessionId
      // calls return null: the dedup check at L246 AND the main lookup at L258
      mockGetKycBySessionId.mockResolvedValue(null);

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Declined',
        timestamp: Date.now() / 1000,
        event_id: 'evt-dup-no-ver',
      } as any);

      // Should return VERIFICATION_NOT_FOUND since the verification lookup returns null
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_NOT_FOUND');
    });
  });

  describe('employer profile update in syncKycNameToUserAndProfiles (L428)', () => {
    it('L428: should update existing employer profile with KYC name', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc({ user_id: 'employer-1' }));
      mockUpdateKyc.mockResolvedValue(makeKyc({ user_id: 'employer-1', status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'employer-1', name: 'Boss', role: 'employer' });
      mockEmployerGetProfile.mockResolvedValue({ id: 'profile-1', name: 'Old Name' });

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Approved', timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'Boss', last_name: 'Man', nationality: 'UK', status: 'Approved' }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockEmployerUpdateProfile).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({ name: 'Boss Man', nationality: 'UK' }),
      );
    });
  });

  describe('mapDiditStatusToKycStatus - Expired/Abandoned/Kyc Expired (L633)', () => {
    it('L633: should map Expired status to expired via processWebhook', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Expired', timestamp: Date.now() / 1000,
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'expired' }),
      );
    });

    it('L633: should map Abandoned status to expired via processWebhook', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Abandoned', timestamp: Date.now() / 1000,
      } as any);

      expect(result.success).toBe(true);
    });

    it('L633: should map Kyc Expired status to expired via processWebhook', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'expired' }));

      const result = await processWebhook({
        session_id: 'session-abc', status: 'Kyc Expired', timestamp: Date.now() / 1000,
      } as any);

      expect(result.success).toBe(true);
    });
  });

  describe('manualKycVerification AML screening (L755-756)', () => {
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

    it('L755-756: should set amlClean=false when AML status is Declined', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue({ success: true, data: { aml: { status: 'Declined', total_hits: 2 } } });
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'completed', decision: 'review' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('completed');
      }
    });
  });

  describe('manualKycVerification existing verification update (L794)', () => {
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

    it('L794: should update existing verification when one exists', async () => {
      mockGetKycByUserId.mockResolvedValue(makeKyc({ status: 'pending' }));
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue(approvedAml);
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalled();
      expect(mockCreateKyc).not.toHaveBeenCalled();
    });
  });

  describe('manualKycVerification catch block (L829-830)', () => {
    const params = {
      userId: 'user-1',
      adminUserId: 'admin-1',
      idFrontImage: Buffer.from('front'),
      selfieImage: Buffer.from('selfie'),
    };

    it('L829-830: should catch errors and return VERIFICATION_ERROR', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockRejectedValue(new Error('API crash'));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_ERROR');
    });

    it('L829-830: should handle non-Error thrown values', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockRejectedValue('string error');

      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_ERROR');
    });
  });

  describe('initiateKycVerification - fallback DIDIT_API_ERROR (L117-118)', () => {
    it('L117-118: should use fallback code/message when error has no nested error object', async () => {
      mockCreateSession.mockResolvedValue({
        success: false,
        error: {},
      });
      const result = await initiateKycVerification({ user_id: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('DIDIT_API_ERROR');
        expect(result.error.message).toBe('Failed to create Didit verification session');
      }
    });
  });

  describe('refreshVerificationStatus - fallback DIDIT_API_ERROR (L197-198)', () => {
    it('L197-198: should use fallback code/message when session fetch error has no nested error', async () => {
      mockGetKycById.mockResolvedValue(makeKyc());
      mockGetSession.mockResolvedValue({
        success: false,
        error: {},
      });
      const result = await refreshVerificationStatus('kyc-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('DIDIT_API_ERROR');
        expect(result.error.message).toBe('Failed to fetch session details from Didit');
      }
    });
  });

  describe('processWebhook - timestamp fallback (L276)', () => {
    it('L276: should use new Date() when payload.timestamp is falsy', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'rejected' }));

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Declined',
        timestamp: 0,
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ completed_at: expect.any(String) }),
      );
    });
  });

  describe('processWebhook - id_verifications null fields (L295-297)', () => {
    it('L295-297: should handle null first_name, last_name, and use issuing_state_name as nationality fallback', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{
            first_name: null,
            last_name: null,
            nationality: null,
            issuing_state_name: 'US',
            status: 'Approved',
            document_type: 'passport',
            document_number: 'AB123',
            date_of_birth: '1990-01-01',
          }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          first_name: null,
          last_name: null,
          nationality: 'US', // Falls back to issuing_state_name
        }),
      );
    });
  });

  describe('processWebhook - null liveness/face scores (L313,320)', () => {
    it('L313: should handle null liveness score', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'John', last_name: 'Doe', status: 'Approved' }],
          liveness_checks: [{ status: 'Approved', score: null }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ liveness_confidence_score: null }),
      );
    });

    it('L320: should handle null face match score', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'John', last_name: 'Doe', status: 'Approved' }],
          face_matches: [{ status: 'Approved', score: undefined }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ face_similarity_score: null }),
      );
    });
  });

  describe('processWebhook - null IP analysis fields (L326-329)', () => {
    it('L326-329: should handle null IP analysis fields', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'User', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'John', last_name: 'Doe', status: 'Approved' }],
          ip_analyses: [{
            ip_address: null,
            ip_country_code: null,
            is_vpn_or_tor: null,
            is_data_center: null,
          }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ip_address: null,
          ip_country_code: null,
          is_vpn: null,
          is_proxy: null,
        }),
      );
    });
  });

  describe('manualKycVerification - date_of_birth in AML (L748)', () => {
    const params = {
      userId: 'user-1',
      adminUserId: 'admin-1',
      idFrontImage: Buffer.from('front'),
      selfieImage: Buffer.from('selfie'),
    };

    const idResultWithDob = {
      success: true,
      data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe', nationality: 'US', document_type: 'passport', document_number: 'AB1', date_of_birth: '1990-01-01' } },
    };
    const approvedLiveness = { success: true, data: { passive_liveness: { status: 'Approved', score: 0.99 } } };
    const approvedFaceMatch = { success: true, data: { face_match: { status: 'Approved', score: 0.95 } } };
    const approvedAml = { success: true, data: { aml: { status: 'No Match', total_hits: 0 } } };

    it('L748: should pass date_of_birth to AML params when present', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(idResultWithDob);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue(approvedAml);
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      expect(mockScreenAml).toHaveBeenCalledWith(
        expect.objectContaining({ date_of_birth: '1990-01-01' }),
      );
    });
  });

  describe('manualKycVerification - null field fallbacks (L772-783)', () => {
    const params = {
      userId: 'user-1',
      adminUserId: 'admin-1',
      idFrontImage: Buffer.from('front'),
      selfieImage: Buffer.from('selfie'),
    };

    it('L772-783: should use null fallbacks and default score when ID data has missing fields', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: null, last_name: null, nationality: null, document_type: null, document_number: null, date_of_birth: null, issuing_state: null } },
      });
      mockCheckLiveness.mockResolvedValue({ success: true, data: { passive_liveness: { status: 'Approved', score: null } } });
      mockMatchFaces.mockResolvedValue({ success: true, data: { face_match: { status: 'Approved', score: null } } });
      mockScreenAml.mockResolvedValue({ success: true, data: { aml: { status: 'No Match', total_hits: 0 } } });
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      expect(mockCreateKyc).toHaveBeenCalledWith(
        expect.objectContaining({
          document_number: null,
          issuing_country: null,
          first_name: null,
          last_name: null,
          date_of_birth: null,
          nationality: null,
          liveness_confidence_score: '100',
          face_similarity_score: '100',
        }),
      );
    });
  });

  describe('manualKycVerification - database error (L802)', () => {
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

    it('L802: should return DATABASE_ERROR when createKycVerification returns null', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue(approvedIdResult);
      mockCheckLiveness.mockResolvedValue(approvedLiveness);
      mockMatchFaces.mockResolvedValue(approvedFaceMatch);
      mockScreenAml.mockResolvedValue(approvedAml);
      mockCreateKyc.mockResolvedValue(null);

      const result = await manualKycVerification(params);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('manualKycVerification - null names in sync (L814-816)', () => {
    const params = {
      userId: 'user-1',
      adminUserId: 'admin-1',
      idFrontImage: Buffer.from('front'),
      selfieImage: Buffer.from('selfie'),
    };

    it('L814-816: should sync with null names when ID verification has no names', async () => {
      mockGetKycByUserId.mockResolvedValue(null);
      mockVerifyId.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: null, last_name: null, nationality: null } },
      });
      mockCheckLiveness.mockResolvedValue({ success: true, data: { passive_liveness: { status: 'Approved', score: 0.99 } } });
      mockMatchFaces.mockResolvedValue({ success: true, data: { face_match: { status: 'Approved', score: 0.95 } } });
      mockScreenAml.mockResolvedValue({ success: true, data: { aml: { status: 'No Match', total_hits: 0 } } });
      mockCreateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));

      const result = await manualKycVerification(params);
      expect(result.success).toBe(true);
      // syncKycNameToUserAndProfiles should be called with null names
      expect(mockGetUserById).toHaveBeenCalledWith('user-1');
    });
  });
});

describe('didit-kyc-service - Additional Branch Coverage', () => {
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

  describe('L382: syncKycNameToUserAndProfiles fullName fallback', () => {
    it('L382: should use user.name when firstName and lastName are both null', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'Existing Name', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{
            first_name: null,
            last_name: null,
            nationality: 'US',
            status: 'Approved',
          }],
        },
      } as any);

      expect(result.success).toBe(true);
      // fullName = [null, null].filter(Boolean).join(' ') || 'Existing Name' || 'User'
      expect(mockUpdateUserName).toHaveBeenCalledWith('user-1', 'Existing Name');
    });

    it('L382: should use "User" when firstName, lastName, and user.name are all falsy', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: null, role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{
            first_name: null,
            last_name: null,
            nationality: 'US',
            status: 'Approved',
          }],
        },
      } as any);

      expect(result.success).toBe(true);
    });

    it('L382: should construct fullName from firstName and lastName', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      mockGetUserById.mockResolvedValue({ id: 'user-1', name: 'Old Name', role: 'freelancer' });

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{
            first_name: 'Jane',
            last_name: 'Smith',
            nationality: 'UK',
            status: 'Approved',
          }],
        },
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateUserName).toHaveBeenCalledWith('user-1', 'Jane Smith');
    });
  });

  describe('L616: mapDiditStatusToKycStatus switch - Cancelled/default', () => {
    it('L634: should map Cancelled status to pending via processWebhook', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'pending' }));

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Cancelled',
        timestamp: Date.now() / 1000,
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('L634: should map unknown status to pending (default case)', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'pending' }));

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'SomeUnknownStatus',
        timestamp: Date.now() / 1000,
      } as any);

      expect(result.success).toBe(true);
      expect(mockUpdateKyc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'pending' }),
      );
    });
  });

  describe('L375: syncKycNameToUserAndProfiles user not found branch', () => {
    it('should handle processWebhook when user is not found during name sync', async () => {
      mockGetKycBySessionId.mockResolvedValue(makeKyc());
      mockUpdateKyc.mockResolvedValue(makeKyc({ status: 'approved' }));
      // getUserById returns null to trigger line 375 branch
      mockGetUserById.mockResolvedValue(null);

      const result = await processWebhook({
        session_id: 'session-abc',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{
            first_name: 'Jane',
            last_name: 'Smith',
            nationality: 'US',
            status: 'Approved',
          }],
        },
      } as any);

      // Should still succeed even if user not found during name sync
      expect(result.success).toBe(true);
    });
  });
});
