// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';

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
// Load real ai-client first to capture pure functions before mocking
const realAiClient = await import(resolveModule('src/services/ai-client.ts'));

const mockGenerateContentFn = jest.fn<any>().mockResolvedValue({ text: '{}' });
jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  isAIAvailable: mockIsAIAvailable,
  generateContent: mockGenerateContentFn,
  parseJsonResponse: mockParseJsonResponse,
  isAIError: mockIsAIError,
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkillsFn,
  keywordMatchSkills: realAiClient.keywordMatchSkills,
  keywordExtractSkills: realAiClient.keywordExtractSkills,
  SKILL_MATCH_PROMPT: '',
  SKILL_EXTRACTION_PROMPT: '',
  SKILL_GAP_PROMPT: '',
  serializeAIRequest: jest.fn(),
  deserializeAIRequest: jest.fn(),
  serializeAIResponse: jest.fn(),
  deserializeAIResponse: jest.fn(),
}));

import { SkillInfo, ProjectRecommendation, FreelancerRecommendation } from '../../services/ai-types.js';

// Dynamic import — loads matching-service.ts AFTER all mocks are registered.
// No static import because ESM hoists static imports before jest.unstable_mockModule,
// causing ai-client.ts to load with real implementations instead of mocks.
const {
  sortRecommendationsByScore,
  sortFreelancerRecommendationsByCombinedScore,
  calculateMatchScore,
} = await import(resolveModule('src/services/matching-service.ts'));

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
            const sorted = sortRecommendationsByScore(recommendations);

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

            expect(sorted.length).toBe(recommendations.length);

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
            const sorted = sortFreelancerRecommendationsByCombinedScore(recommendations);

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

            expect(sorted.length).toBe(recommendations.length);

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
// Branch coverage for matching-service.ts
// ═══════════════════════════════════════════════════════════════

describe('matching-service – branch coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('L51: freelancerSkillToInfo with null name falls back to empty string', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: null, years_of_experience: 3 }],
    });
    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: [{
        id: 'p1',
        required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1', years_of_experience: 2 }],
      }],
      total: 1,
    });
    mockIsAIAvailable.mockReturnValue(false);

    const { getProjectRecommendations } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await getProjectRecommendations('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
    }
  });

  it('L63,L65: projectSkillToInfo with null skill_name and missing years_of_experience', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: [{
        id: 'p1',
        required_skills: [{ skill_id: 's1', skill_name: null, category_id: 'c1' }],
      }],
      total: 1,
    });
    mockIsAIAvailable.mockReturnValue(false);

    const { getProjectRecommendations } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await getProjectRecommendations('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
    }
  });

  it('L337: analyzeSkillGaps with null marketDemand defaults to empty array', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContentFn.mockResolvedValue('{}');
    mockParseJsonResponse.mockReturnValue({
      currentSkills: ['React'],
      recommendedSkills: ['Node'],
      marketDemand: null,
      reasoning: 'test',
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.marketDemand).toEqual([]);
    }
  });

  it('L337,L358-L374: analyzeSkillGaps filters invalid marketDemand items and applies defaults', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContentFn.mockResolvedValue('response');
    mockParseJsonResponse.mockReturnValue({
      currentSkills: null,
      recommendedSkills: null,
      marketDemand: [
        { skillName: 'Node', demandLevel: 'high' },
        null,
        { skillName: '', demandLevel: 'invalid' },
        { skillName: 'Python' },
      ],
      reasoning: null,
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React']);
      expect(result.data.recommendedSkills).toEqual([]);
      expect(result.data.marketDemand).toEqual([
        { skillName: 'Node', demandLevel: 'high' },
        { skillName: 'Python', demandLevel: 'medium' },
      ]);
      expect(result.data.reasoning).toBe('Analysis completed.');
    }
  });

  it('analyzeSkillGaps with valid AI response fields uses them directly', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContentFn.mockResolvedValue('{}');
    mockParseJsonResponse.mockReturnValue({
      currentSkills: ['React', 'Node'],
      recommendedSkills: ['Python'],
      marketDemand: [{ skillName: 'Go', demandLevel: 'high' }],
      reasoning: 'Custom reasoning',
    });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React', 'Node']);
      expect(result.data.recommendedSkills).toEqual(['Python']);
      expect(result.data.marketDemand).toEqual([{ skillName: 'Go', demandLevel: 'high' }]);
      expect(result.data.reasoning).toBe('Custom reasoning');
    }
  });

  it('L374: analyzeSkillGaps catch block when parseJsonResponse returns null', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContentFn.mockResolvedValue('bad response');
    mockParseJsonResponse.mockReturnValue(null);

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React']);
      expect(result.data.recommendedSkills).toEqual([]);
      expect(result.data.marketDemand).toEqual([]);
      expect(result.data.reasoning).toContain('Failed to parse');
    }
  });

  it('analyzeSkillGaps with AI returning non-string response', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContentFn.mockResolvedValue({ text: '{}' });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React']);
      expect(result.data.reasoning).toContain('AI analysis failed');
    }
  });
});

describe('matching-service - extractSkillsFromText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveSkills.mockResolvedValue([{ id: 's1', name: 'React', categoryId: 'c1' }]);
    mockGetReputation.mockResolvedValue({ success: true, data: { score: 50 } });
    mockGenerateContent.mockResolvedValue({ text: '{}' });
  });

  it('AI success path: assigns aiResult (line 262)', async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockExtractSkillsFn.mockResolvedValue([
      { skillId: 's1', skillName: 'React', confidence: 0.95 },
    ]);
    mockIsAIError.mockReturnValue(false);

    const { extractSkillsFromText } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await extractSkillsFromText('I am a React developer');

    expect(result.success).toBe(true);
    expect(mockIsAIAvailable).toHaveBeenCalled();
    expect(mockExtractSkillsFn).toHaveBeenCalledWith({
      text: 'I am a React developer',
      availableSkills: [{ skillId: 's1', skillName: 'React', categoryId: 'c1' }],
    });
    if (result.success) {
      expect(result.data).toEqual([{ skillId: 's1', skillName: 'React', confidence: 0.95 }]);
    }
  });

  it('AI error path: falls back to keyword extraction', async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockExtractSkillsFn.mockResolvedValue({ error: 'AI service unavailable' });
    mockIsAIError.mockReturnValue(true);

    const { extractSkillsFromText } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await extractSkillsFromText('I am a React developer');

    expect(result.success).toBe(true);
  });

  it('AI unavailable path: uses keyword extraction', async () => {
    mockIsAIAvailable.mockReturnValue(false);

    const { extractSkillsFromText } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await extractSkillsFromText('I am a React developer');

    expect(result.success).toBe(true);
  });

  it('empty text returns INVALID_INPUT', async () => {
    const { extractSkillsFromText } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await extractSkillsFromText('');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('no available skills returns empty data', async () => {
    mockGetActiveSkills.mockResolvedValue([]);
    const { extractSkillsFromText } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await extractSkillsFromText('React developer');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });
});


// ═══════════════════════════════════════════════════════════════
// Branch coverage: matching-service.ts line 374
// typeof response === 'string' ternary in catch block
// ═══════════════════════════════════════════════════════════════

describe('matching-service - line 374 branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveSkills.mockResolvedValue([{ id: 's1', name: 'React', categoryId: 'c1' }]);
    mockGetReputation.mockResolvedValue({ success: true, data: { score: 50 } });
  });

  it('should handle catch block when response is a string (typeof response === \'string\' true branch)', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    // Return a string that will cause parseJsonResponse to return null
    mockGenerateContentFn.mockResolvedValue('invalid json response that cannot be parsed');
    mockParseJsonResponse.mockReturnValue(null);

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React']);
      expect(result.data.recommendedSkills).toEqual([]);
      expect(result.data.marketDemand).toEqual([]);
      expect(result.data.reasoning).toContain('Failed to parse');
    }
  });

  it('should handle non-string response from generateContent (typeof response !== \'string\' early return)', async () => {
    mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValue({
      id: 'fp1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
    });
    mockIsAIAvailable.mockReturnValue(true);
    // Return a non-string value (object) — the typeof check at line 313 returns early
    mockGenerateContentFn.mockResolvedValue({ text: '{}' });

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('u1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentSkills).toEqual(['React']);
      expect(result.data.recommendedSkills).toEqual([]);
      expect(result.data.marketDemand).toEqual([]);
      expect(result.data.reasoning).toContain('AI analysis failed');
    }
  });
});
