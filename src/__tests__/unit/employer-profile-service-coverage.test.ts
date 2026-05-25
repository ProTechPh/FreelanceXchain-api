// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockEmployerProfileRepository = {
  getProfileByUserId: jest.fn<any>(),
  createProfile: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapEmployerProfileFromEntity: (entity: any) => ({ ...entity }),
}));

const mockGetProfileDataFromKyc = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

const {
  createEmployerProfile,
  createEmployerProfileFromKyc,
  getEmployerProfileByUserId,
  updateEmployerProfile,
} = await import('../../services/employer-profile-service.js');

describe('Employer Profile Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEmployerProfile', () => {
    it('should return PROFILE_EXISTS when profile already exists', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p-1' });
      const result = await createEmployerProfile('u-1', {
        companyName: 'Test Co', description: 'A company', industry: 'Tech',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_EXISTS');
    });

    it('should create profile successfully', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockEmployerProfileRepository.createProfile.mockResolvedValue({
        id: 'generated-id', user_id: 'u-1', company_name: 'Test Co',
      });
      const result = await createEmployerProfile('u-1', {
        companyName: 'Test Co', description: 'A company', industry: 'Tech',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createEmployerProfileFromKyc', () => {
    it('should return PROFILE_EXISTS when profile already exists', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p-1' });
      const result = await createEmployerProfileFromKyc('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_EXISTS');
    });

    it('should return KYC_NOT_APPROVED when KYC fails', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: false,
        error: { code: 'NO_KYC', message: 'No KYC found' },
      });
      const result = await createEmployerProfileFromKyc('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should return KYC_NOT_APPROVED when KYC data is null', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({ success: true, data: null });
      const result = await createEmployerProfileFromKyc('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should create profile from KYC data with defaults', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: true,
        data: { name: 'John Doe', nationality: 'US', kyc_verified: true, kyc_verified_at: '2025-01-01' },
      });
      mockEmployerProfileRepository.createProfile.mockResolvedValue({
        id: 'generated-id', user_id: 'u-1', company_name: 'John Doe',
      });
      const result = await createEmployerProfileFromKyc('u-1');
      expect(result.success).toBe(true);
    });

    it('should create profile from KYC data with custom inputs', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: true,
        data: { name: 'John Doe', nationality: 'US', kyc_verified: true, kyc_verified_at: '2025-01-01' },
      });
      mockEmployerProfileRepository.createProfile.mockResolvedValue({
        id: 'generated-id', user_id: 'u-1', company_name: 'Custom Co',
      });
      const result = await createEmployerProfileFromKyc('u-1', {
        companyName: 'Custom Co', description: 'Custom desc', industry: 'Finance',
      });
      expect(result.success).toBe(true);
    });

    it('should handle KYC data without name', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: true,
        data: { name: null, nationality: null, kyc_verified: true, kyc_verified_at: '2025-01-01' },
      });
      mockEmployerProfileRepository.createProfile.mockResolvedValue({
        id: 'generated-id', user_id: 'u-1', company_name: 'My Company',
      });
      const result = await createEmployerProfileFromKyc('u-1');
      expect(result.success).toBe(true);
    });
  });

  describe('getEmployerProfileByUserId', () => {
    it('should return PROFILE_NOT_FOUND when not found', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      const result = await getEmployerProfileByUserId('u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return profile on success', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p-1', user_id: 'u-1' });
      const result = await getEmployerProfileByUserId('u-1');
      expect(result.success).toBe(true);
    });
  });

  describe('updateEmployerProfile', () => {
    it('should return PROFILE_NOT_FOUND when not found', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      const result = await updateEmployerProfile('u-1', { companyName: 'New Name' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p-1' });
      mockEmployerProfileRepository.updateProfile.mockResolvedValue(null);
      const result = await updateEmployerProfile('u-1', { companyName: 'New Name' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should update profile successfully', async () => {
      mockEmployerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p-1' });
      mockEmployerProfileRepository.updateProfile.mockResolvedValue({ id: 'p-1', company_name: 'New Name' });
      const result = await updateEmployerProfile('u-1', {
        companyName: 'New Name', description: 'New desc', industry: 'Finance',
      });
      expect(result.success).toBe(true);
    });
  });
});
