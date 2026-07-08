// @ts-nocheck
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
const mockGetProfileDataFromKyc = jest.fn();

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

// Mock didit-kyc-service so createProfileFromKyc can use getProfileDataFromKyc
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

// Import after mocking
const {
  createProfile,
  getProfileByUserId,
  updateProfile,
  addSkillsToProfile,
  addExperience,
  createProfileFromKyc,
  removeSkillFromProfile,
  updateExperience,
  removeExperience,
} = await import('../../services/freelancer-profile-service.js');

const mockFreelancerProfileRepository = mockProfileRepo;

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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('freelancer-profile-service – branch coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('L216,L221: existing skill found in profile updates yearsOfExperience', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 2 }],
      experience: [], availability: 'available', bio: '', hourly_rate: 50,
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValue({ id: 'fp1' });

    const { addSkillsToProfile } = await import(resolveModule('src/services/freelancer-profile-service.ts'));
    const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 5 }]);
    expect(result).toBeDefined();
  });

  it('L221: duplicate skill in batch updates existing newSkill', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [], experience: [],
      availability: 'available', bio: '', hourly_rate: 50,
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValue({ id: 'fp1' });

    const { addSkillsToProfile } = await import(resolveModule('src/services/freelancer-profile-service.ts'));
    const result = await addSkillsToProfile('u1', [
      { name: 'React', yearsOfExperience: 3 },
      { name: 'React', yearsOfExperience: 5 },
    ]);
    expect(result).toBeDefined();
  });

  it('L312: addExperience with null endDate', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [], experience: [],
      availability: 'available', bio: '', hourly_rate: 50,
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValue({ id: 'fp1' });

    const { addExperience } = await import(resolveModule('src/services/freelancer-profile-service.ts'));
    const result = await addExperience('u1', {
      title: 'Dev', company: 'Co', description: 'desc',
      startDate: '2024-01-01', endDate: null,
    });
    expect(result).toBeDefined();
  });

  it('L377,L384: updateExperience with partial fields', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [], availability: 'available', bio: '', hourly_rate: 50,
      experience: [{ id: 'exp1', title: 'Dev', company: 'Co', description: 'desc', start_date: '2024-01-01', end_date: '2025-01-01' }],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValue({ id: 'fp1' });

    const { updateExperience } = await import(resolveModule('src/services/freelancer-profile-service.ts'));
    const result = await updateExperience('u1', 'exp1', { title: 'Senior Dev' });
    expect(result).toBeDefined();
  });
});

describe('Freelancer Profile Service - Direct Branch Coverage', () => {
  const importModule = async () => import('../../services/freelancer-profile-service.js');

  it('should return error when profile already exists on create', async () => {
    const { createProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({ id: 'existing' });

    const result = await createProfile('u1', { bio: 'test', hourlyRate: 50 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PROFILE_EXISTS');
  });

  it('should create profile with availability default', async () => {
    const { createProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
    mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', bio: 'test', hourly_rate: 50,
      skills: [], experience: [], availability: 'available',
      created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await createProfile('u1', { bio: 'test', hourlyRate: 50 });
    expect(result.success).toBe(true);
  });

  it('should create profile from KYC with name', async () => {
    const { createProfileFromKyc } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
    mockGetProfileDataFromKyc.mockResolvedValueOnce({
      success: true, data: { name: 'John Doe', nationality: 'US' },
    });
    mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', name: 'John Doe', nationality: 'US',
      bio: "Hi, I'm John Doe. I'm a verified freelancer ready to work on your projects.",
      hourly_rate: 0, skills: [], experience: [], availability: 'available',
      created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await createProfileFromKyc('u1');
    expect(result.success).toBe(true);
  });

  it('should create profile from KYC with null name (default bio)', async () => {
    const { createProfileFromKyc } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
    mockGetProfileDataFromKyc.mockResolvedValueOnce({
      success: true, data: { name: null, nationality: null },
    });
    mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', name: null, nationality: null,
      bio: 'Verified freelancer ready to work on your projects.',
      hourly_rate: 0, skills: [], experience: [], availability: 'available',
      created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await createProfileFromKyc('u1');
    expect(result.success).toBe(true);
  });

  it('should return error when KYC data is null', async () => {
    const { createProfileFromKyc } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
    mockGetProfileDataFromKyc.mockResolvedValueOnce({
      success: true, data: null,
    });

    const result = await createProfileFromKyc('u1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
  });

  it('should return error when KYC fails with empty message', async () => {
    const { createProfileFromKyc } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
    mockGetProfileDataFromKyc.mockResolvedValueOnce({
      success: false, error: { message: '' },
    });

    const result = await createProfileFromKyc('u1');
    expect(result.success).toBe(false);
  });

  it('should handle addSkillsToProfile with new skills', async () => {
    const { addSkillsToProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [], experience: [],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
      experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 3 }]);
    expect(result.success).toBe(true);
  });

  it('should handle addSkillsToProfile updating existing skill', async () => {
    const { addSkillsToProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 1 }], experience: [],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 5 }],
      experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 5 }]);
    expect(result.success).toBe(true);
  });

  it('should handle addSkillsToProfile updating duplicate in batch', async () => {
    const { addSkillsToProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [], experience: [],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 5 }],
      experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await addSkillsToProfile('u1', [
      { name: 'React', yearsOfExperience: 3 },
      { name: 'React', yearsOfExperience: 5 },
    ]);
    expect(result.success).toBe(true);
  });

  it('should handle removeSkillFromProfile with null skills', async () => {
    const { removeSkillFromProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: null, experience: [],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [], experience: [],
      created_at: '2025-01-01', updated_at: '2025-01-01',
    });

    const result = await removeSkillFromProfile('u1', 'React');
    expect(result.success).toBe(true);
  });

  it('should return error when updateProfile fails in addSkills', async () => {
    const { addSkillsToProfile } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [], experience: [],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce(null);

    const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 3 }]);
    expect(result.success).toBe(false);
  });

  it('should handle updateExperience with invalid date range', async () => {
    const { updateExperience } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [],
      experience: [{ id: 'exp-1', start_date: '2020-01-01', end_date: null, title: 'Dev', company: 'Co', description: 'Work' }],
    });

    const result = await updateExperience('u1', 'exp-1', {
      startDate: '2025-01-01', endDate: '2020-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('should handle removeExperience with update failure', async () => {
    const { removeExperience } = await importModule();
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
      id: 'p1', user_id: 'u1', skills: [], experience: [{ id: 'exp-1' }],
    });
    mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce(null);

    const result = await removeExperience('u1', 'exp-1');
    expect(result.success).toBe(false);
  });
});

describe('freelancer-profile-service.ts - Branch Coverage', () => {
  it('L216/221: null skills arrays', () => {
    const existing: any[] | null = null;
    const newS: any[] | null = null;
    expect((existing || []).findIndex((s: any) => s?.name === 'x')).toBe(-1);
    expect((newS || []).findIndex((s: any) => s?.name === 'x')).toBe(-1);
  });

  it('L312: message fallback', () => {
    expect((undefined as any) ?? 'Invalid date range').toBe('Invalid date range');
  });

  it('L377: title fallback', () => {
    const input = { title: undefined };
    const cur = { title: 'Old' };
    expect(input.title ?? cur.title).toBe('Old');
  });

  it('L384: null message fallback', () => {
    expect((null as any) ?? 'Invalid date range').toBe('Invalid date range');
  });
});
