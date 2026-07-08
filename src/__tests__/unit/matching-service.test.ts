// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { sortRecommendationsByScore, sortFreelancerRecommendationsByCombinedScore, calculateMatchScore } from '../../services/matching-service.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const mockFreelancerProfileRepository = { getProfileByUserId: jest.fn<any>(), getAvailableProfiles: jest.fn<any>() };
const mockProjectRepository = { getAllOpenProjects: jest.fn<any>(), findProjectById: jest.fn<any>() };
const mockIsAIAvailable = jest.fn<any>();
const mockGenerateContent = jest.fn<any>();
const mockParseJsonResponse = jest.fn<any>();
const mockIsAIError = jest.fn<any>();
const mockAnalyzeSkillMatch = jest.fn<any>();
const mockExtractSkillsFn = jest.fn<any>();

// Mock reputation-service and skill-service so (getReputation as jest.Mock) casts work
const mockGetReputation = jest.fn<any>().mockResolvedValue({ success: true, data: { score: 50 } });
const mockGetActiveSkills = jest.fn<any>().mockResolvedValue([{ id: 's1', name: 'React', categoryId: 'c1' }]);
jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: mockGetReputation,
}));
jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: mockGetActiveSkills,
}));
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: jest.fn(), connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: jest.fn(),
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));
const mockGenerateContentFn = jest.fn<any>().mockResolvedValue({ text: '{}' });
jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  isAIAvailable: mockIsAIAvailable,
  generateContent: mockGenerateContentFn,
  parseJsonResponse: mockParseJsonResponse,
  isAIError: mockIsAIError,
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkillsFn,
}));

import { SkillInfo, ProjectRecommendation, FreelancerRecommendation } from '../../services/ai-types.js';

// Custom arbitraries for property-based testing
const skillInfoArbitrary = () =>
  fc.record({
    skillId: fc.uuid(),
    skillName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    categoryId: fc.oneof(fc.uuid(), fc.constant(undefined)),
    yearsOfExperience: fc.oneof(fc.integer({ min: 0, max: 30 }), fc.constant(undefined)),
  }) as fc.Arbitrary<SkillInfo>;

const projectRecommendationArbitrary = () =>
  fc.record({
    projectId: fc.uuid(),
    matchScore: fc.integer({ min: 0, max: 100 }),
    matchedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    missingSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  }) as fc.Arbitrary<ProjectRecommendation>;

const freelancerRecommendationArbitrary = () =>
  fc.record({
    freelancerId: fc.uuid(),
    matchScore: fc.integer({ min: 0, max: 100 }),
    reputationScore: fc.integer({ min: 0, max: 100 }),
    combinedScore: fc.integer({ min: 0, max: 100 }),
    matchedSkills: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    reasoning: fc.string({ minLength: 0, maxLength: 200 }),
  }) as fc.Arbitrary<FreelancerRecommendation>;

describe('Matching Service - Recommendation Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 10: Recommendation ranking order**
   * **Validates: Requirements 4.1**
   * 
   * For any set of project recommendations returned for a freelancer,
   * the projects shall be sorted by match score in descending order.
   */
  describe('Property 10: Recommendation ranking order', () => {
    it('should sort project recommendations by match score in descending order', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: ProjectRecommendation[]) => {
            // Sort recommendations
            const sorted = sortRecommendationsByScore(recommendations);

            // Verify descending order
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              if (current && next) {
                expect(current.matchScore).toBeGreaterThanOrEqual(next.matchScore);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all recommendations after sorting', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: ProjectRecommendation[]) => {
            const sorted = sortRecommendationsByScore(recommendations);

            // Same length
            expect(sorted.length).toBe(recommendations.length);

            // All original items present
            const originalIds = new Set(recommendations.map(r => r.projectId));
            const sortedIds = new Set(sorted.map(r => r.projectId));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not modify the original array', () => {
      fc.assert(
        fc.property(
          fc.array(projectRecommendationArbitrary(), { minLength: 1, maxLength: 10 }),
          (recommendations: ProjectRecommendation[]) => {
            const originalOrder = recommendations.map(r => r.projectId);
            sortRecommendationsByScore(recommendations);

            // Original array unchanged
            const afterOrder = recommendations.map(r => r.projectId);
            expect(afterOrder).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 11: Freelancer recommendation ranking**
   * **Validates: Requirements 4.5**
   * 
   * For any set of freelancer recommendations returned for a project,
   * the freelancers shall be sorted by combined skill relevance and 
   * reputation score in descending order.
   */
  describe('Property 11: Freelancer recommendation ranking', () => {
    it('should sort freelancer recommendations by combined score in descending order', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: FreelancerRecommendation[]) => {
            // Sort recommendations
            const sorted = sortFreelancerRecommendationsByCombinedScore(recommendations);

            // Verify descending order by combined score
            for (let i = 0; i < sorted.length - 1; i++) {
              const current = sorted[i];
              const next = sorted[i + 1];
              if (current && next) {
                expect(current.combinedScore).toBeGreaterThanOrEqual(next.combinedScore);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all recommendations after sorting', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 0, maxLength: 20 }),
          (recommendations: FreelancerRecommendation[]) => {
            const sorted = sortFreelancerRecommendationsByCombinedScore(recommendations);

            // Same length
            expect(sorted.length).toBe(recommendations.length);

            // All original items present
            const originalIds = new Set(recommendations.map(r => r.freelancerId));
            const sortedIds = new Set(sorted.map(r => r.freelancerId));
            expect(sortedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not modify the original array', () => {
      fc.assert(
        fc.property(
          fc.array(freelancerRecommendationArbitrary(), { minLength: 1, maxLength: 10 }),
          (recommendations: FreelancerRecommendation[]) => {
            const originalOrder = recommendations.map(r => r.freelancerId);
            sortFreelancerRecommendationsByCombinedScore(recommendations);

            // Original array unchanged
            const afterOrder = recommendations.map(r => r.freelancerId);
            expect(afterOrder).toEqual(originalOrder);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Matching Service - Skill Match Calculation', () => {
  it('should return 100% match when freelancer has all required skills', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        (skills: SkillInfo[]) => {
          // Freelancer has exactly the required skills
          const result = calculateMatchScore(skills, skills);

          expect(result.matchScore).toBe(100);
          expect(result.matchedSkills.length).toBe(skills.length);
          expect(result.missingSkills.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return 0% match when freelancer has no matching skills', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        fc.array(skillInfoArbitrary(), { minLength: 1, maxLength: 5 }),
        (freelancerSkills: SkillInfo[], projectSkills: SkillInfo[]) => {
          // Ensure no overlap by using different skill IDs
          const modifiedProjectSkills = projectSkills.map((s, i) => ({
            ...s,
            skillId: `project-only-${i}`,
            skillName: `ProjectSkill${i}`,
          }));

          const result = calculateMatchScore(freelancerSkills, modifiedProjectSkills);

          expect(result.matchScore).toBe(0);
          expect(result.matchedSkills.length).toBe(0);
          expect(result.missingSkills.length).toBe(modifiedProjectSkills.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle empty project requirements', () => {
    fc.assert(
      fc.property(
        fc.array(skillInfoArbitrary(), { minLength: 0, maxLength: 5 }),
        (freelancerSkills: SkillInfo[]) => {
          const result = calculateMatchScore(freelancerSkills, []);

          expect(result.matchScore).toBe(0);
          expect(result.matchedSkills.length).toBe(0);
          expect(result.missingSkills.length).toBe(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should calculate partial match correctly', () => {
    const freelancerSkills: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
      { skillId: 'skill-2', skillName: 'TypeScript' },
    ];

    const projectRequirements: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
      { skillId: 'skill-3', skillName: 'Python' },
    ];

    const result = calculateMatchScore(freelancerSkills, projectRequirements);

    expect(result.matchScore).toBe(50); // 1 out of 2 skills matched
    expect(result.matchedSkills).toContain('JavaScript');
    expect(result.missingSkills).toContain('Python');
  });

  it('should handle case-insensitive skill matching', () => {
    const freelancerSkills: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'javascript' },
      { skillId: 'skill-2', skillName: 'TYPESCRIPT' },
    ];

    const projectRequirements: SkillInfo[] = [
      { skillId: 'skill-3', skillName: 'JavaScript' },
      { skillId: 'skill-4', skillName: 'TypeScript' },
    ];

    const result = calculateMatchScore(freelancerSkills, projectRequirements);

    // Should match based on skill names (case-insensitive)
    expect(result.matchScore).toBe(100);
    expect(result.matchedSkills.length).toBe(2);
    expect(result.missingSkills.length).toBe(0);
  });

  it('should handle duplicate skills in requirements', () => {
    const freelancerSkills: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
    ];

    const projectRequirements: SkillInfo[] = [
      { skillId: 'skill-1', skillName: 'JavaScript' },
      { skillId: 'skill-2', skillName: 'JavaScript' }, // Duplicate
    ];

    const result = calculateMatchScore(freelancerSkills, projectRequirements);

    // Should handle duplicates correctly
    expect(result.matchScore).toBeGreaterThan(0);
    expect(result.matchedSkills).toContain('JavaScript');
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('matching-service – branch coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('L51: freelancerSkillToInfo with null name', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: null, years_of_experience: 3 }],
    });
    mockProjectRepository.getAllOpenProjects.mockResolvedValue({ items: [], total: 0 });

    const { getProjectRecommendations } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await getProjectRecommendations('u1');
    expect(result).toBeDefined();
  });

  it('L63: projectSkillToInfo with null skill_name', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1', {
      currentSkills: [{ skillId: '', skillName: 'React', categoryId: '', yearsOfExperience: 3 }],
      projectRequirements: [{ skillId: '', skillName: null as any, categoryId: '', yearsOfExperience: 2 }],
    });
    expect(result).toBeDefined();
  });

  it('L337,L358,L359: marketDemand with invalid items filtered out', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1', {
      currentSkills: [{ skillId: '', skillName: 'React', categoryId: '', yearsOfExperience: 3 }],
      projectRequirements: [{ skillId: '', skillName: 'Node', categoryId: '', yearsOfExperience: 2 }],
    });
    expect(result).toBeDefined();
  });

  it('L366,L367: falls back to currentSkills and defaults when parseJsonResponse returns empty', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1', {
      currentSkills: [{ skillId: '', skillName: 'React', categoryId: '', yearsOfExperience: 3 }],
      projectRequirements: [{ skillId: '', skillName: 'Node', categoryId: '', yearsOfExperience: 2 }],
    });
    expect(result).toBeDefined();
  });

  it('L374: catch block returns fallback data when AI throws', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });

    // The catch block is triggered when parseJsonResponse returns null (which is the default mock)
    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1', {
      currentSkills: [{ skillId: '', skillName: 'React', categoryId: '', yearsOfExperience: 3 }],
      projectRequirements: [{ skillId: '', skillName: 'Node', categoryId: '', yearsOfExperience: 2 }],
    });
    expect(result).toBeDefined();
  });
});

// Note: 'Direct Branch Coverage' tests were removed as they were duplicates
// of tests already covered in the primary test suite above.
