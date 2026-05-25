// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockUserRepository = {
  getUserById: jest.fn<any>(),
  updateUserName: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const mockFreelancerProfileRepository = {
  getProfileByUserId: jest.fn<any>(),
  createProfile: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

const mockEmployerProfileRepository = {
  getProfileByUserId: jest.fn<any>(),
  createProfile: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepository,
}));

const mockCreateKycVerification = jest.fn<any>();
const mockGetKycVerificationById = jest.fn<any>();
const mockGetKycVerificationByUserId = jest.fn<any>();
const mockGetKycVerificationBySessionId = jest.fn<any>();
const mockUpdateKycVerification = jest.fn<any>();
const mockGetKycVerificationsByStatus = jest.fn<any>();
const mockGetPendingReviews = jest.fn<any>();
const mockGetKycVerificationHistory = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  createKycVerification: mockCreateKycVerification,
  getKycVerificationById: mockGetKycVerificationById,
  getKycVerificationByUserId: mockGetKycVerificationByUserId,
  getKycVerificationBySessionId: mockGetKycVerificationBySessionId,
  updateKycVerification: mockUpdateKycVerification,
  getKycVerificationsByStatus: mockGetKycVerificationsByStatus,
  getPendingReviews: mockGetPendingReviews,
  getKycVerificationHistory: mockGetKycVerificationHistory,
}));

const mockCreateVerificationSession = jest.fn<any>();
const mockGetVerificationSession = jest.fn<any>();
const mockVerifyIdDocument = jest.fn<any>();
const mockCheckPassiveLiveness = jest.fn<any>();
const mockMatchFaces = jest.fn<any>();
const mockScreenAml = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/didit-client.ts'), () => ({
  createVerificationSession: mockCreateVerificationSession,
  getVerificationSession: mockGetVerificationSession,
  verifyIdDocument: mockVerifyIdDocument,
  checkPassiveLiveness: mockCheckPassiveLiveness,
  matchFaces: mockMatchFaces,
  screenAml: mockScreenAml,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/models/didit-kyc.ts'), () => ({}));

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

describe('Didit KYC Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateKycVerification', () => {
    it('should return USER_NOT_FOUND when user does not exist', async () => {
      mockUserRepository.getUserById.mockResolvedValue(null);
      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return ALREADY_VERIFIED when user is already approved', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue({ id: 'v-1', status: 'approved' });
      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should return RETRY_COOLDOWN when within cooldown period', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue({
        id: 'v-1', status: 'rejected', created_at: new Date().toISOString(),
      });
      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('RETRY_COOLDOWN');
    });

    it('should allow retry after cooldown period', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockGetKycVerificationByUserId.mockResolvedValue({
        id: 'v-1', status: 'rejected', created_at: oldDate,
      });
      mockCreateVerificationSession.mockResolvedValue({
        success: true,
        data: { session_id: 's-1', session_token: 'tok', url: 'http://url', workflow_id: 'wf-1' },
      });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'pending' });

      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(true);
    });

    it('should return DIDIT_API_ERROR when session creation fails', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockCreateVerificationSession.mockResolvedValue({
        success: false,
        error: { error: { code: 'API_ERROR', message: 'Failed' } },
      });
      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(false);
    });

    it('should create new verification when none exists', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockCreateVerificationSession.mockResolvedValue({
        success: true,
        data: { session_id: 's-1', session_token: 'tok', url: 'http://url', workflow_id: 'wf-1' },
      });
      mockCreateKycVerification.mockResolvedValue({ id: 'v-1', status: 'pending' });

      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(true);
    });

    it('should return DATABASE_ERROR when verification creation fails', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockCreateVerificationSession.mockResolvedValue({
        success: true,
        data: { session_id: 's-1', session_token: 'tok', url: 'http://url', workflow_id: 'wf-1' },
      });
      mockCreateKycVerification.mockResolvedValue(null);

      const result = await initiateKycVerification({ user_id: 'u-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('refreshVerificationStatus', () => {
    it('should return VERIFICATION_NOT_FOUND when not found', async () => {
      mockGetKycVerificationById.mockResolvedValue(null);
      const result = await refreshVerificationStatus('v-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_NOT_FOUND');
    });

    it('should return error when Didit session fetch fails', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1', didit_session_id: 's-1' });
      mockGetVerificationSession.mockResolvedValue({
        success: false,
        error: { error: { code: 'API_ERROR', message: 'Failed' } },
      });
      const result = await refreshVerificationStatus('v-1');
      expect(result.success).toBe(false);
    });

    it('should update status on success', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1', didit_session_id: 's-1' });
      mockGetVerificationSession.mockResolvedValue({
        success: true,
        data: { status: 'Completed' },
      });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      const result = await refreshVerificationStatus('v-1');
      expect(result.success).toBe(true);
    });

    it('should return UPDATE_FAILED when update fails', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1', didit_session_id: 's-1' });
      mockGetVerificationSession.mockResolvedValue({
        success: true,
        data: { status: 'In Progress' },
      });
      mockUpdateKycVerification.mockResolvedValue(null);
      const result = await refreshVerificationStatus('v-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('processWebhook', () => {
    it('should return VERIFICATION_NOT_FOUND when session not found', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue(null);
      const result = await processWebhook({ session_id: 's-1', status: 'Approved', timestamp: Date.now() / 1000 });
      expect(result.success).toBe(false);
    });

    it('should process Approved webhook with decision data', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'freelancer', name: 'Test' });
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockFreelancerProfileRepository.createProfile.mockResolvedValue({});

      const result = await processWebhook({
        session_id: 's-1',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: {
          id_verifications: [{ first_name: 'John', last_name: 'Doe', nationality: 'US', status: 'Approved', document_type: 'passport' }],
          liveness_checks: [{ status: 'Approved', score: 99 }],
          face_matches: [{ status: 'Approved', score: 95 }],
          ip_analyses: [{ ip_address: '1.2.3.4', ip_country_code: 'US', is_vpn_or_tor: false, is_data_center: false }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should process Declined webhook', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'rejected' });

      const result = await processWebhook({
        session_id: 's-1',
        status: 'Declined',
        timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ status: 'Declined' }] },
      });
      expect(result.success).toBe(true);
    });

    it('should process In Review webhook', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'completed' });

      const result = await processWebhook({
        session_id: 's-1',
        status: 'In Review',
        timestamp: Date.now() / 1000,
      });
      expect(result.success).toBe(true);
    });

    it('should return UPDATE_FAILED when update fails', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue(null);

      const result = await processWebhook({
        session_id: 's-1',
        status: 'Approved',
        timestamp: Date.now() / 1000,
      });
      expect(result.success).toBe(false);
    });

    it('should handle employer profile creation on approval', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'employer', name: 'Test' });
      mockUserRepository.updateUserName.mockResolvedValue(undefined);
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockEmployerProfileRepository.createProfile.mockResolvedValue({});

      const result = await processWebhook({
        session_id: 's-1',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ first_name: 'Jane', last_name: 'Doe', status: 'Approved' }] },
      });
      expect(result.success).toBe(true);
      expect(mockEmployerProfileRepository.createProfile).toHaveBeenCalled();
    });

    it('should update existing freelancer profile on approval', async () => {
      mockGetKycVerificationBySessionId.mockResolvedValue({ id: 'v-1', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'freelancer', name: 'Test' });
      mockUserRepository.updateUserName.mockResolvedValue(undefined);
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'fp-1' });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue({});

      const result = await processWebhook({
        session_id: 's-1',
        status: 'Approved',
        timestamp: Date.now() / 1000,
        decision: { id_verifications: [{ first_name: 'John', last_name: 'Doe', status: 'Approved' }] },
      });
      expect(result.success).toBe(true);
      expect(mockFreelancerProfileRepository.updateProfile).toHaveBeenCalled();
    });
  });

  describe('getProfileDataFromKyc', () => {
    it('should return NO_KYC when no verification found', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      const result = await getProfileDataFromKyc('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_KYC');
    });

    it('should return KYC_NOT_APPROVED when not approved', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({ id: 'v-1', status: 'pending' });
      const result = await getProfileDataFromKyc('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should return profile data when approved', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({
        id: 'v-1', status: 'approved', first_name: 'John', last_name: 'Doe',
        nationality: 'US', completed_at: '2025-01-01',
      });
      const result = await getProfileDataFromKyc('u-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John Doe');
        expect(result.data.kyc_verified).toBe(true);
      }
    });
  });

  describe('adminReviewVerification', () => {
    it('should return VERIFICATION_NOT_FOUND when not found', async () => {
      mockGetKycVerificationById.mockResolvedValue(null);
      const result = await adminReviewVerification('v-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
    });

    it('should return INVALID_STATUS when not completed', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1', status: 'pending' });
      const result = await adminReviewVerification('v-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should approve verification and sync profile', async () => {
      mockGetKycVerificationById.mockResolvedValue({
        id: 'v-1', status: 'completed', user_id: 'u-1',
        first_name: 'John', last_name: 'Doe', nationality: 'US',
      });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'freelancer', name: 'Test' });
      mockUserRepository.updateUserName.mockResolvedValue(undefined);
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'fp-1' });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue({});

      const result = await adminReviewVerification('v-1', 'admin-1', 'approved', 'Looks good');
      expect(result.success).toBe(true);
    });

    it('should reject verification', async () => {
      mockGetKycVerificationById.mockResolvedValue({
        id: 'v-1', status: 'completed', user_id: 'u-1',
      });
      mockUpdateKycVerification.mockResolvedValue({ id: 'v-1', status: 'rejected' });

      const result = await adminReviewVerification('v-1', 'admin-1', 'rejected', 'Suspicious');
      expect(result.success).toBe(true);
    });

    it('should return UPDATE_FAILED when update fails', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1', status: 'completed', user_id: 'u-1' });
      mockUpdateKycVerification.mockResolvedValue(null);

      const result = await adminReviewVerification('v-1', 'admin-1', 'approved');
      expect(result.success).toBe(false);
    });
  });

  describe('isUserVerified', () => {
    it('should return false when no verification exists', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      const result = await isUserVerified('u-1');
      expect(result).toBe(false);
    });

    it('should return false when not approved', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({ status: 'pending' });
      const result = await isUserVerified('u-1');
      expect(result).toBe(false);
    });

    it('should return false when expired', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({
        status: 'approved',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const result = await isUserVerified('u-1');
      expect(result).toBe(false);
    });

    it('should return true when approved and not expired', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({
        status: 'approved',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      const result = await isUserVerified('u-1');
      expect(result).toBe(true);
    });
  });

  describe('manualKycVerification', () => {
    it('should return USER_NOT_FOUND when user does not exist', async () => {
      mockUserRepository.getUserById.mockResolvedValue(null);
      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return ALREADY_VERIFIED when user is already verified', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue({ id: 'v-1', status: 'approved' });
      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should return ID_VERIFICATION_FAILED when ID check fails', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({ success: false });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ID_VERIFICATION_FAILED');
    });

    it('should return ID_DECLINED when ID is declined', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Declined' } },
      });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ID_DECLINED');
    });

    it('should return LIVENESS_CHECK_FAILED when liveness fails', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({ success: false });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('LIVENESS_CHECK_FAILED');
    });

    it('should return LIVENESS_DECLINED when liveness is declined', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({
        success: true,
        data: { passive_liveness: { status: 'Declined', score: 20 } },
      });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('LIVENESS_DECLINED');
    });

    it('should return FACE_MATCH_FAILED when face match fails', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({
        success: true,
        data: { passive_liveness: { status: 'Approved', score: 99 } },
      });
      mockMatchFaces.mockResolvedValue({ success: false });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FACE_MATCH_FAILED');
    });

    it('should return FACE_MISMATCH when face does not match', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({
        success: true,
        data: { passive_liveness: { status: 'Approved', score: 99 } },
      });
      mockMatchFaces.mockResolvedValue({
        success: true,
        data: { face_match: { status: 'Declined', score: 30 } },
      });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FACE_MISMATCH');
    });

    it('should complete manual verification successfully with AML clean', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'freelancer', name: 'Test' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe', nationality: 'US', date_of_birth: '1990-01-01', document_number: 'P123' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({
        success: true,
        data: { passive_liveness: { status: 'Approved', score: 99 } },
      });
      mockMatchFaces.mockResolvedValue({
        success: true,
        data: { face_match: { status: 'Approved', score: 95 } },
      });
      mockScreenAml.mockResolvedValue({
        success: true,
        data: { aml: { status: 'Approved', total_hits: 0 } },
      });
      mockCreateKycVerification.mockResolvedValue({ id: 'v-1', status: 'approved' });
      mockUserRepository.updateUserName.mockResolvedValue(undefined);
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockFreelancerProfileRepository.createProfile.mockResolvedValue({});

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(true);
    });

    it('should handle AML declined result', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1', role: 'freelancer', name: 'Test' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockResolvedValue({
        success: true,
        data: { id_verification: { status: 'Approved', first_name: 'John', last_name: 'Doe' } },
      });
      mockCheckPassiveLiveness.mockResolvedValue({
        success: true,
        data: { passive_liveness: { status: 'Approved', score: 99 } },
      });
      mockMatchFaces.mockResolvedValue({
        success: true,
        data: { face_match: { status: 'Approved', score: 95 } },
      });
      mockScreenAml.mockResolvedValue({
        success: true,
        data: { aml: { status: 'Declined', total_hits: 3 } },
      });
      mockCreateKycVerification.mockResolvedValue({ id: 'v-1', status: 'completed' });

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(true);
    });

    it('should handle unexpected error during manual verification', async () => {
      mockUserRepository.getUserById.mockResolvedValue({ id: 'u-1' });
      mockGetKycVerificationByUserId.mockResolvedValue(null);
      mockVerifyIdDocument.mockRejectedValue(new Error('Network error'));

      const result = await manualKycVerification({
        userId: 'u-1', adminUserId: 'admin-1',
        idFrontImage: Buffer.from('front'), selfieImage: Buffer.from('selfie'),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VERIFICATION_ERROR');
    });
  });

  describe('utility functions', () => {
    it('getKycStatus should return verification', async () => {
      mockGetKycVerificationByUserId.mockResolvedValue({ id: 'v-1' });
      const result = await getKycStatus('u-1');
      expect(result.success).toBe(true);
    });

    it('getKycById should return verification', async () => {
      mockGetKycVerificationById.mockResolvedValue({ id: 'v-1' });
      const result = await getKycById('v-1');
      expect(result.success).toBe(true);
    });

    it('getPendingAdminReviews should return verifications', async () => {
      mockGetPendingReviews.mockResolvedValue([]);
      const result = await getPendingAdminReviews();
      expect(result.success).toBe(true);
    });

    it('getVerificationsByStatus should return verifications', async () => {
      mockGetKycVerificationsByStatus.mockResolvedValue([]);
      const result = await getVerificationsByStatus('pending');
      expect(result.success).toBe(true);
    });

    it('getUserVerificationHistory should return verifications', async () => {
      mockGetKycVerificationHistory.mockResolvedValue([]);
      const result = await getUserVerificationHistory('u-1');
      expect(result.success).toBe(true);
    });
  });
});
