import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { FreelancerProfileEntity } from '../../repositories/freelancer-profile-repository.js';
import { SkillEntity } from '../../repositories/skill-repository.js';
import { createInMemoryStore, createMockFreelancerProfileRepository, createMockSkillRepository } from '../helpers/mock-repository-factory.js';
import { createTestUser } from '../helpers/test-data-factory.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Create mocks using shared factories
const profileStore = createInMemoryStore();
const skillStore = createInMemoryStore();
const mockProfileRepo = createMockFreelancerProfileRepository(profileStore as any);
const mockSkillRepo = createMockSkillRepository(skillStore);

// Mock the freelancer profile repository
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockProfileRepo,
  FreelancerProfileRepository: jest.fn(),
  FreelancerProfileEntity: {} as FreelancerProfileEntity,
}));

// Mock the skill repository
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepo,
  SkillRepository: jest.fn(),
  SkillEntity: {} as SkillEntity,
}));

// Import after mocking
const {
  createProfile,
  getProfileByUserId,
  updateProfile,
  addSkillsToProfile,
  addExperience,
} = await import('../../services/freelancer-profile-service.js');

// Custom arbitraries for property-based testing
const validBioArbitrary = () =>
  fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10);

const validHourlyRateArbitrary = () =>
  fc.integer({ min: 1, max: 1000 });

const validAvailabilityArbitrary = () =>
  fc.constantFrom<'available' | 'busy' | 'unavailable'>('available', 'busy', 'unavailable');

const validProfileInputArbitrary = () =>
  fc.record({
    bio: validBioArbitrary(),
    hourlyRate: validHourlyRateArbitrary(),
    availability: validAvailabilityArbitrary(),
  });

const validYearsOfExperienceArbitrary = () =>
  fc.integer({ min: 0, max: 50 });

const validPastDateArbitrary = () =>
  fc.date({
    min: new Date('2000-01-01'),
    max: new Date('2024-12-31'),
  })
    .filter(d => !isNaN(d.getTime()))
    .map(d => d.toISOString().split('T')[0]);

const validDateRangeArbitrary = () =>
  fc.tuple(
    fc.date({ min: new Date('2000-01-01'), max: new Date('2020-12-31') }),
    fc.date({ min: new Date('2021-01-01'), max: new Date('2024-12-31') })
  )
    .filter(([start, end]) => !isNaN(start.getTime()) && !isNaN(end.getTime()))
    .map(([start, end]) => ({
      startDate: start.toISOString().split('T')[0] as string,
      endDate: end.toISOString().split('T')[0] as string,
    }));

const invalidDateRangeArbitrary = () =>
  fc.tuple(
    fc.date({ min: new Date('2021-01-01'), max: new Date('2024-12-31') }),
    fc.date({ min: new Date('2000-01-01'), max: new Date('2020-12-31') })
  )
    .filter(([start, end]) => !isNaN(start.getTime()) && !isNaN(end.getTime()))
    .map(([start, end]) => ({
      startDate: start.toISOString().split('T')[0] as string,
      endDate: end.toISOString().split('T')[0] as string,
    }));

const validExperienceInputArbitrary = () =>
  fc.record({
    title: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
    company: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
    description: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10),
  });

describe('Freelancer Profile Service - Profile Properties', () => {
  beforeEach(() => {
    mockProfileRepo.clear();
    mockSkillRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 4: Profile data persistence**
   * **Validates: Requirements 2.1, 2.3, 2.4**
   * 
   * For any valid profile data submitted by a freelancer, creating and then
   * retrieving the profile shall return equivalent data including all submitted fields.
   */
  it('Property 4: Profile data persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        async (userId, profileInput) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          // Retrieve profile
          const getResult = await getProfileByUserId(userId);
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;

          // Verify data persistence
          expect(getResult.data.userId).toBe(userId);
          expect(getResult.data.bio).toBe(profileInput.bio);
          expect(getResult.data.hourlyRate).toBe(profileInput.hourlyRate);
          expect(getResult.data.availability).toBe(profileInput.availability);
          expect(getResult.data.skills).toEqual([]);
          expect(getResult.data.experience).toEqual([]);
          expect(getResult.data.createdAt).toBeDefined();
          expect(getResult.data.updatedAt).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4 (extended): Profile update persistence
   * For any valid profile update, the changes shall be persisted and retrievable.
   */
  it('Property 4 (extended): Profile update persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        validProfileInputArbitrary(),
        async (userId, initialInput, updateInput) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, initialInput);
          expect(createResult.success).toBe(true);

          // Update profile
          const updateResult = await updateProfile(userId, {
            bio: updateInput.bio,
            hourlyRate: updateInput.hourlyRate,
            availability: updateInput.availability,
          });
          expect(updateResult.success).toBe(true);
          if (!updateResult.success) return;

          // Retrieve and verify
          const getResult = await getProfileByUserId(userId);
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;

          expect(getResult.data.bio).toBe(updateInput.bio);
          expect(getResult.data.hourlyRate).toBe(updateInput.hourlyRate);
          expect(getResult.data.availability).toBe(updateInput.availability);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Freelancer Profile Service - Skill Properties', () => {
  beforeEach(() => {
    mockProfileRepo.clear();
    mockSkillRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 5: Skill management**
   * **Validates: Requirements 2.2, 3.2**
   * 
   * For any set of skills submitted for a profile, skills are stored as free-form
   * text with years of experience. AI will handle skill matching.
   */
  it('Property 5: Skills are stored with name and years of experience', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1),
            yearsOfExperience: validYearsOfExperienceArbitrary(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (userId, profileInput, skillInputs) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Add skills
          const addResult = await addSkillsToProfile(userId, skillInputs);
          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Deduplicate by name (case-insensitive) to match service behavior
          const uniqueSkills = Array.from(
            new Map(
              skillInputs.map(s => [s.name.trim().toLowerCase(), s])
            ).values()
          );

          // Verify all unique skills were added
          expect(addResult.data.skills.length).toBe(uniqueSkills.length);
          for (const input of uniqueSkills) {
            const found = addResult.data.skills.find(
              s => s.name.toLowerCase() === input.name.trim().toLowerCase()
            );
            expect(found).toBeDefined();
            expect(found?.yearsOfExperience).toBe(input.yearsOfExperience);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Duplicate skills update years of experience
   */
  it('Property 5: Duplicate skills update years of experience', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2),
        validYearsOfExperienceArbitrary(),
        validYearsOfExperienceArbitrary(),
        async (userId, profileInput, skillName, yearsExp1, yearsExp2) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Add skill first time
          await addSkillsToProfile(userId, [{ name: skillName, yearsOfExperience: yearsExp1 }]);

          // Add same skill again with different years (exact same name)
          const addResult = await addSkillsToProfile(userId, [{ name: skillName, yearsOfExperience: yearsExp2 }]);
          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Should only have one skill (updated)
          expect(addResult.data.skills.length).toBe(1);
          expect(addResult.data.skills[0]?.yearsOfExperience).toBe(yearsExp2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Freelancer Profile Service - Work Experience Properties', () => {
  beforeEach(() => {
    mockProfileRepo.clear();
    mockSkillRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 6: Work experience date validation**
   * **Validates: Requirements 2.5**
   * 
   * For any work experience entry, the start date must be before or equal to
   * the end date (if end date is provided), and entries with invalid date
   * ranges shall be rejected.
   */
  it('Property 6: Work experience date validation - valid date ranges accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        validExperienceInputArbitrary(),
        validDateRangeArbitrary(),
        async (userId, profileInput, expInput, dateRange) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Add experience with valid date range
          const addResult = await addExperience(userId, {
            ...expInput,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          });
          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Verify experience was added
          expect(addResult.data.experience.length).toBe(1);
          const exp = addResult.data.experience[0];
          expect(exp?.title).toBe(expInput.title);
          expect(exp?.company).toBe(expInput.company);
          expect(exp?.startDate).toBe(dateRange.startDate);
          expect(exp?.endDate).toBe(dateRange.endDate);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Invalid date ranges are rejected
   */
  it('Property 6: Work experience date validation - invalid date ranges rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        validExperienceInputArbitrary(),
        invalidDateRangeArbitrary(),
        async (userId, profileInput, expInput, dateRange) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Try to add experience with invalid date range (start > end)
          const addResult = await addExperience(userId, {
            ...expInput,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          });

          expect(addResult.success).toBe(false);
          if (addResult.success) return;
          expect(addResult.error.code).toBe('INVALID_DATE_RANGE');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Null end date is valid (current position)
   */
  it('Property 6: Work experience date validation - null end date accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        validExperienceInputArbitrary(),
        validPastDateArbitrary(),
        async (userId, profileInput, expInput, startDate) => {
          mockProfileRepo.clear();

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Add experience with null end date (current position)
          const addResult = await addExperience(userId, {
            ...expInput,
            startDate: startDate as string,
            endDate: null,
          });
          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Verify experience was added with null end date
          expect(addResult.data.experience.length).toBe(1);
          expect(addResult.data.experience[0]?.endDate).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
