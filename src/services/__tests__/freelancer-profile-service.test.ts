import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { FreelancerProfileEntity } from '../../repositories/freelancer-profile-repository.js';
import { SkillEntity } from '../../repositories/skill-repository.js';
import { generateId } from '../../utils/id.js';

// In-memory stores for testing - using entity types with snake_case
let profileStore: Map<string, FreelancerProfileEntity> = new Map();
let skillStore: Map<string, SkillEntity> = new Map();

// Mock the freelancer profile repository
jest.unstable_mockModule('../../repositories/freelancer-profile-repository.js', () => ({
  freelancerProfileRepository: {
    getProfileByUserId: jest.fn(async (userId: string) => {
      for (const profile of profileStore.values()) {
        if (profile.user_id === userId) return profile;
      }
      return null;
    }),
    createProfile: jest.fn(async (profile: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'>) => {
      const now = new Date().toISOString();
      const entity: FreelancerProfileEntity = { ...profile, created_at: now, updated_at: now };
      profileStore.set(profile.id, entity);
      return entity;
    }),
    updateProfile: jest.fn(async (id: string, updates: Partial<FreelancerProfileEntity>) => {
      const existing = profileStore.get(id);
      if (!existing) return null;
      const updated: FreelancerProfileEntity = { ...existing, ...updates, updated_at: new Date().toISOString() };
      profileStore.set(id, updated);
      return updated;
    }),
  },
  FreelancerProfileRepository: jest.fn(),
  FreelancerProfileEntity: {} as FreelancerProfileEntity,
}));

// Mock the skill repository
jest.unstable_mockModule('../../repositories/skill-repository.js', () => ({
  skillRepository: {
    findSkillById: jest.fn(async (id: string) => {
      return skillStore.get(id) ?? null;
    }),
    getSkillById: jest.fn(async (id: string) => {
      return skillStore.get(id) ?? null;
    }),
  },
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
} = await import('../freelancer-profile-service.js');

// Helper to create test skills in the store
function createTestSkill(overrides: Partial<SkillEntity> = {}): SkillEntity {
  const now = new Date().toISOString();
  const skill: SkillEntity = {
    id: generateId(),
    category_id: 'cat-1',
    name: 'Test Skill',
    description: 'A test skill',
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  skillStore.set(skill.id, skill);
  return skill;
}

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

// Date arbitraries for work experience
const validPastDateArbitrary = () =>
  fc.date({
    min: new Date('2000-01-01'),
    max: new Date('2024-12-31'),
  }).map(d => d.toISOString().split('T')[0]);

const validDateRangeArbitrary = () =>
  fc.tuple(
    fc.date({ min: new Date('2000-01-01'), max: new Date('2020-12-31') }),
    fc.date({ min: new Date('2021-01-01'), max: new Date('2024-12-31') })
  ).map(([start, end]) => ({
    startDate: start.toISOString().split('T')[0] as string,
    endDate: end.toISOString().split('T')[0] as string,
  }));

const invalidDateRangeArbitrary = () =>
  fc.tuple(
    fc.date({ min: new Date('2021-01-01'), max: new Date('2024-12-31') }),
    fc.date({ min: new Date('2000-01-01'), max: new Date('2020-12-31') })
  ).map(([start, end]) => ({
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
    profileStore.clear();
    skillStore.clear();
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
          // Clear store for each test case
          profileStore.clear();

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
          // Clear store for each test case
          profileStore.clear();

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


describe('Freelancer Profile Service - Skill Taxonomy Properties', () => {
  beforeEach(() => {
    profileStore.clear();
    skillStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 5: Skill taxonomy validation**
   * **Validates: Requirements 2.2, 3.2**
   * 
   * For any set of skill IDs submitted for a profile, only skills that exist
   * in the active skill taxonomy shall be associated, and invalid skill IDs
   * shall be rejected.
   */
  it('Property 5: Skill taxonomy validation - valid skills are accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        fc.integer({ min: 1, max: 5 }),
        validYearsOfExperienceArbitrary(),
        async (userId, profileInput, skillCount, yearsExp) => {
          // Clear stores
          profileStore.clear();
          skillStore.clear();

          // Create test skills
          const testSkills: SkillEntity[] = [];
          for (let i = 0; i < skillCount; i++) {
            testSkills.push(createTestSkill({ name: `Skill ${i}` }));
          }

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Add valid skills
          const skillInputs = testSkills.map(s => ({
            skillId: s.id,
            yearsOfExperience: yearsExp,
          }));

          const addResult = await addSkillsToProfile(userId, skillInputs);

          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Verify all skills were added
          expect(addResult.data.skills.length).toBe(skillCount);
          for (const testSkill of testSkills) {
            const found = addResult.data.skills.find(s => s.skillId === testSkill.id);
            expect(found).toBeDefined();
            expect(found?.skillName).toBe(testSkill.name);
            expect(found?.yearsOfExperience).toBe(yearsExp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Invalid skill IDs are rejected
   */
  it('Property 5: Skill taxonomy validation - invalid skills are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        fc.uuid(),
        validYearsOfExperienceArbitrary(),
        async (userId, profileInput, invalidSkillId, yearsExp) => {
          // Clear stores
          profileStore.clear();
          skillStore.clear();

          // Create profile (no skills in store)
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Try to add invalid skill
          const addResult = await addSkillsToProfile(userId, [
            { skillId: invalidSkillId, yearsOfExperience: yearsExp },
          ]);

          expect(addResult.success).toBe(false);
          if (addResult.success) return;

          expect(addResult.error.code).toBe('INVALID_SKILL');
          expect(addResult.error.details).toContain(invalidSkillId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Inactive skills are rejected
   */
  it('Property 5: Skill taxonomy validation - inactive skills are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validProfileInputArbitrary(),
        validYearsOfExperienceArbitrary(),
        async (userId, profileInput, yearsExp) => {
          // Clear stores
          profileStore.clear();
          skillStore.clear();

          // Create an inactive skill
          const inactiveSkill = createTestSkill({ is_active: false, name: 'Deprecated Skill' });

          // Create profile
          const createResult = await createProfile(userId, profileInput);
          expect(createResult.success).toBe(true);

          // Try to add inactive skill
          const addResult = await addSkillsToProfile(userId, [
            { skillId: inactiveSkill.id, yearsOfExperience: yearsExp },
          ]);

          expect(addResult.success).toBe(false);
          if (addResult.success) return;

          expect(addResult.error.code).toBe('INVALID_SKILL');
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Freelancer Profile Service - Work Experience Properties', () => {
  beforeEach(() => {
    profileStore.clear();
    skillStore.clear();
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
          // Clear stores
          profileStore.clear();

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
          // Clear stores
          profileStore.clear();

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
          // Clear stores
          profileStore.clear();

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
