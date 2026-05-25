import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { createInMemoryStore, createMockFreelancerProfileRepository } from '../helpers/mock-repository-factory.js';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const profileStore = createInMemoryStore();
const mockProfileRepo = createMockFreelancerProfileRepository(profileStore as any);

const mockGetProfileDataFromKyc = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockProfileRepo,
  FreelancerProfileRepository: jest.fn(),
  FreelancerProfileEntity: {},
}));
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: {
    findSkillById: jest.fn() as jest.Mock<any>,
    getSkillById: jest.fn() as jest.Mock<any>,
    getSkillByNameInCategory: jest.fn() as jest.Mock<any>,
    createSkill: jest.fn() as jest.Mock<any>,
    updateSkill: jest.fn() as jest.Mock<any>,
    getAllSkills: jest.fn() as jest.Mock<any>,
    getActiveSkills: jest.fn() as jest.Mock<any>,
    searchSkillsByKeyword: jest.fn() as jest.Mock<any>,
  },
  SkillRepository: jest.fn(),
  SkillEntity: {},
}));
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

const {
  createProfileFromKyc,
  removeSkillFromProfile,
  updateExperience,
  removeExperience,
} = await import('../../services/freelancer-profile-service.js');

function makeProfileEntity(userId = 'user-1') {
  return {
    id: 'profile-1',
    user_id: userId,
    name: 'John Doe',
    nationality: 'US',
    bio: 'Hello I am a freelancer',
    hourly_rate: 50,
    skills: [{ name: 'React', category: 'Frontend', years_of_experience: 2 }],
    experience: [
      {
        id: 'exp-1',
        title: 'Developer',
        company: 'Acme',
        description: 'Built stuff',
        start_date: '2020-01-01',
        end_date: '2022-01-01',
      },
    ],
    availability: 'available' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('FreelancerProfileService - Extra Coverage', () => {
  beforeEach(() => {
    profileStore.clear();
    jest.clearAllMocks();
    mockGetProfileDataFromKyc.mockResolvedValue({
      success: true,
      data: { name: 'John Doe', nationality: 'US', kyc_verified: true, kyc_verified_at: new Date().toISOString() },
    });
  });

  describe('createProfileFromKyc', () => {
    it('should return PROFILE_EXISTS when profile already exists', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_EXISTS');
    });

    it('should return KYC_NOT_APPROVED when KYC fails', async () => {
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: false,
        error: { code: 'KYC_NOT_APPROVED', message: 'Not approved' },
      });
      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should return KYC_NOT_APPROVED when KYC data is null', async () => {
      mockGetProfileDataFromKyc.mockResolvedValue({ success: true, data: null });
      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should create profile with KYC data', async () => {
      const result = await createProfileFromKyc('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John Doe');
        expect(result.data.nationality).toBe('US');
      }
    });

    it('should use provided bio over KYC default', async () => {
      const result = await createProfileFromKyc('user-1', { bio: 'Custom bio text here' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.bio).toBe('Custom bio text here');
    });

    it('should use generic default bio when KYC has no name', async () => {
      mockGetProfileDataFromKyc.mockResolvedValue({
        success: true,
        data: { name: null, nationality: null, kyc_verified: true, kyc_verified_at: null },
      });
      const result = await createProfileFromKyc('user-noname');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.bio).toContain('Verified freelancer');
    });
  });

  describe('removeSkillFromProfile', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      const result = await removeSkillFromProfile('nonexistent', 'React');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should remove the skill and return updated profile', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await removeSkillFromProfile('user-1', 'React');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skills.some(s => s.name === 'React')).toBe(false);
      }
    });

    it('should be case-insensitive when removing skill', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await removeSkillFromProfile('user-1', 'REACT');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skills.some(s => s.name === 'React')).toBe(false);
      }
    });

    it('should return UPDATE_FAILED when repository returns null', async () => {
      profileStore.set('user-1', makeProfileEntity());
      mockProfileRepo.updateProfile.mockResolvedValueOnce(null);
      const result = await removeSkillFromProfile('user-1', 'React');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('updateExperience', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      const result = await updateExperience('nonexistent', 'exp-1', { title: 'New Title' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return EXPERIENCE_NOT_FOUND when experience does not exist', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await updateExperience('user-1', 'nonexistent-exp', { title: 'New' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('EXPERIENCE_NOT_FOUND');
    });

    it('should update experience successfully', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await updateExperience('user-1', 'exp-1', { title: 'Senior Developer' });
      expect(result.success).toBe(true);
      if (result.success) {
        const exp = result.data.experience.find(e => e.id === 'exp-1');
        expect(exp?.title).toBe('Senior Developer');
      }
    });

    it('should return INVALID_DATE_RANGE when end date is before start date', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await updateExperience('user-1', 'exp-1', {
        startDate: '2022-01-01',
        endDate: '2020-01-01',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_DATE_RANGE');
    });

    it('should return UPDATE_FAILED when repository returns null', async () => {
      profileStore.set('user-1', makeProfileEntity());
      mockProfileRepo.updateProfile.mockResolvedValueOnce(null);
      const result = await updateExperience('user-1', 'exp-1', { title: 'Updated' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('removeExperience', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      const result = await removeExperience('nonexistent', 'exp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should succeed even when experience id not found (silently filters)', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await removeExperience('user-1', 'nonexistent-exp');
      expect(result.success).toBe(true);
    });

    it('should remove experience successfully', async () => {
      profileStore.set('user-1', makeProfileEntity());
      const result = await removeExperience('user-1', 'exp-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.experience.find(e => e.id === 'exp-1')).toBeUndefined();
      }
    });

    it('should return UPDATE_FAILED when repository returns null', async () => {
      profileStore.set('user-1', makeProfileEntity());
      mockProfileRepo.updateProfile.mockResolvedValueOnce(null);
      const result = await removeExperience('user-1', 'exp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});
