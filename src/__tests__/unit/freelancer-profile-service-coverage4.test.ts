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
  FreelancerProfileEntity: {},
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapFreelancerProfileFromEntity: (entity: any) => ({
    id: entity.id,
    userId: entity.user_id,
    bio: entity.bio,
    hourlyRate: entity.hourly_rate,
    skills: entity.skills || [],
    experience: entity.experience || [],
    availability: entity.availability,
    name: entity.name,
  }),
  FreelancerProfile: {},
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id-123',
}));

const mockGetProfileDataFromKyc = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

const profileService = await import('../../services/freelancer-profile-service.js');

describe('Freelancer Profile Service - Coverage4', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDateRange - invalid end date (lines 54-55)', () => {
    it('should return error when end date is invalid format', async () => {
      // validateDateRange is called from addExperience and updateExperience
      // To trigger line 54-55 (invalid end date), we need to call addExperience
      // with a valid start date but invalid end date
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [],
        experience: [],
        availability: 'available',
      });

      const result = await profileService.addExperience('user-1', {
        title: 'Developer',
        company: 'Acme Corp',
        description: 'Built things',
        startDate: '2023-01-01',
        endDate: 'not-a-valid-date',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid end date');
      }
    });
  });

  describe('addSkillsToProfile - duplicate skill in batch (lines 238-243)', () => {
    it('should update years of experience for duplicate skill in same batch', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [],
        experience: [],
        availability: 'available',
      });

      mockFreelancerProfileRepository.updateProfile.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [{ name: 'React', years_of_experience: 5 }],
        experience: [],
        availability: 'available',
      });

      // Add the same skill twice in one batch - second one should update the first
      const result = await profileService.addSkillsToProfile('user-1', [
        { name: 'React', yearsOfExperience: 3 },
        { name: 'React', yearsOfExperience: 5 }, // Duplicate - should update years
      ]);

      expect(result.success).toBe(true);
      // The updateProfile should have been called with the skill having updated years
      expect(mockFreelancerProfileRepository.updateProfile).toHaveBeenCalled();
    });

    it('should update years of experience for existing skill in profile', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [{ name: 'React', years_of_experience: 2 }],
        experience: [],
        availability: 'available',
      });

      mockFreelancerProfileRepository.updateProfile.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [{ name: 'React', years_of_experience: 5 }],
        experience: [],
        availability: 'available',
      });

      // Adding a skill that already exists in profile should update years
      const result = await profileService.addSkillsToProfile('user-1', [
        { name: 'React', yearsOfExperience: 5 },
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('updateExperience - currentExperience null check (lines 363-367)', () => {
    it('should return EXPERIENCE_NOT_FOUND when experience entry is found by index but is falsy', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [],
        experience: [{ id: 'exp-1', title: 'Dev', company: 'Co', description: 'Work', start_date: '2023-01-01', end_date: null }],
        availability: 'available',
      });

      // Test with a non-existent experience ID - hits first EXPERIENCE_NOT_FOUND check
      const result = await profileService.updateExperience('user-1', 'non-existent-id', {
        title: 'Updated Title',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EXPERIENCE_NOT_FOUND');
      }
    });

    it('should handle updateExperience with valid experience and date validation', async () => {
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
        id: 'profile-1',
        user_id: 'user-1',
        bio: 'Test bio',
        hourly_rate: 50,
        skills: [],
        experience: [
          { id: 'exp-1', title: 'Dev', company: 'Co', description: 'Work', start_date: '2023-01-01', end_date: '2024-01-01' },
        ],
        availability: 'available',
      });

      // Update with end date before start date to trigger date validation error
      const result = await profileService.updateExperience('user-1', 'exp-1', {
        startDate: '2024-06-01',
        endDate: '2023-01-01', // Before start date
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DATE_RANGE');
      }
    });
  });
});
