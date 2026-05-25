// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockFreelancerProfileRepository = {
  getProfileByUserId: jest.fn<any>(),
  createProfile: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

const mockGetProfileDataFromKyc = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

const {
  createProfile,
  createProfileFromKyc,
  getProfileByUserId,
  updateProfile,
  addSkillsToProfile,
  removeSkillFromProfile,
  addExperience,
  updateExperience,
  removeExperience,
} = await import('../../services/freelancer-profile-service.js');

describe('Freelancer Profile Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 49-50: createProfile - profile already exists
  describe('createProfile', () => {
    it('should return PROFILE_EXISTS when profile already exists', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'existing' });

      const result = await createProfile('user-1', { bio: 'test bio', hourlyRate: 50 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_EXISTS');
      }
    });
  });

  // Lines 54-55: createProfileFromKyc - profile already exists
  describe('createProfileFromKyc', () => {
    it('should return PROFILE_EXISTS when profile already exists', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'existing' });

      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_EXISTS');
      }
    });

    it('should return KYC_NOT_APPROVED when KYC fails', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: false,
        error: { message: 'KYC not approved' },
      });

      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('KYC_NOT_APPROVED');
      }
    });

    it('should return KYC_NOT_APPROVED when KYC data is null', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: true,
        data: null,
      });

      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('KYC_NOT_APPROVED');
      }
    });
  });

  // Lines 76-80: getProfileByUserId - not found
  describe('getProfileByUserId', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await getProfileByUserId('user-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });

  // Lines 159-163: updateProfile - profile not found
  describe('updateProfile', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await updateProfile('user-1', { bio: 'new bio' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({ id: 'p1', user_id: 'user-1' });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue(null);

      const result = await updateProfile('user-1', { bio: 'new bio' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  // Lines 173-177: addSkillsToProfile - profile not found
  describe('addSkillsToProfile', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await addSkillsToProfile('user-1', [{ name: 'JS', yearsOfExperience: 3 }]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue(null);

      const result = await addSkillsToProfile('user-1', [{ name: 'JS', yearsOfExperience: 3 }]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  // Lines 186-190: removeSkillFromProfile - profile not found
  describe('removeSkillFromProfile', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await removeSkillFromProfile('user-1', 'JavaScript');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'JavaScript', years_of_experience: 3 }], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue(null);

      const result = await removeSkillFromProfile('user-1', 'JavaScript');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  // Lines 204-208: addExperience - profile not found
  describe('addExperience', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await addExperience('user-1', {
        title: 'Dev', company: 'Co', description: 'Work', startDate: '2020-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValue(null);

      const result = await addExperience('user-1', {
        title: 'Dev', company: 'Co', description: 'Work', startDate: '2020-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
      }
    });
  });

  // Lines 252-256: updateExperience - profile not found
  describe('updateExperience', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await updateExperience('user-1', 'exp-1', { title: 'New Title' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });

    it('should return EXPERIENCE_NOT_FOUND when experience does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [], experience: [{ id: 'other-exp' }],
      });

      const result = await updateExperience('user-1', 'exp-1', { title: 'New Title' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EXPERIENCE_NOT_FOUND');
      }
    });
  });

  // Lines 302-306: removeExperience - profile not found
  describe('removeExperience', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue(null);

      const result = await removeExperience('user-1', 'exp-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });

  // Lines 331-335, 363-367: addExperience invalid date range
  describe('addExperience - date validation', () => {
    it('should return INVALID_DATE_RANGE for invalid start date', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [], experience: [],
      });

      const result = await addExperience('user-1', {
        title: 'Dev', company: 'Co', description: 'Work', startDate: 'not-a-date',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DATE_RANGE');
      }
    });

    it('should return INVALID_DATE_RANGE when start > end', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'p1', user_id: 'user-1', skills: [], experience: [],
      });

      const result = await addExperience('user-1', {
        title: 'Dev', company: 'Co', description: 'Work', startDate: '2025-01-01', endDate: '2020-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DATE_RANGE');
      }
    });
  });
});
