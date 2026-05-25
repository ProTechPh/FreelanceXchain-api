import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockGetProfileByUserId = jest.fn() as jest.Mock<any>;
const mockGetAvailableProfiles = jest.fn() as jest.Mock<any>;
const mockGetAllOpenProjects = jest.fn() as jest.Mock<any>;
const mockFindProjectById = jest.fn() as jest.Mock<any>;
const mockGetActiveSkills = jest.fn() as jest.Mock<any>;
const mockGetReputation = jest.fn() as jest.Mock<any>;
const mockAnalyzeSkillMatch = jest.fn() as jest.Mock<any>;
const mockExtractSkills = jest.fn() as jest.Mock<any>;
const mockIsAIAvailable = jest.fn(() => false);
const mockIsAIError = jest.fn((r: any) => false);
const mockKeywordMatchSkills = jest.fn() as jest.Mock<any>;
const mockKeywordExtractSkills = jest.fn() as jest.Mock<any>;
const mockGenerateContent = jest.fn() as jest.Mock<any>;
const mockParseJsonResponse = jest.fn() as jest.Mock<any>;
const mockLogger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: {
    getProfileByUserId: mockGetProfileByUserId,
    getAvailableProfiles: mockGetAvailableProfiles,
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: {
    getAllOpenProjects: mockGetAllOpenProjects,
    findProjectById: mockFindProjectById,
  },
}));

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: mockGetActiveSkills,
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: mockGetReputation,
}));

jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkills,
  isAIAvailable: mockIsAIAvailable,
  isAIError: mockIsAIError,
  keywordMatchSkills: mockKeywordMatchSkills,
  keywordExtractSkills: mockKeywordExtractSkills,
  generateContent: mockGenerateContent,
  parseJsonResponse: mockParseJsonResponse,
  SKILL_GAP_PROMPT: 'Analyze skill gaps for: {currentSkills}',
}));

const {
  getProjectRecommendations,
  getFreelancerRecommendations,
  extractSkillsFromText,
  analyzeSkillGaps,
  isMatchingError,
} = await import('../../services/matching-service.js');

function makeFreelancerProfile(overrides: Record<string, any> = {}) {
  return {
    user_id: 'freelancer-1',
    skills: [{ name: 'React', years_of_experience: 3 }],
    ...overrides,
  };
}

function makeProject(overrides: Record<string, any> = {}) {
  return {
    id: 'project-1',
    required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'cat1', years_of_experience: 2 }],
    ...overrides,
  };
}

function makeMatchResult(score = 80) {
  return {
    matchScore: score,
    matchedSkills: ['React'],
    missingSkills: [],
    reasoning: 'Good match',
  };
}

describe('Matching Service - Async Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAIAvailable.mockReturnValue(false);
    mockIsAIError.mockReturnValue(false);
    mockKeywordMatchSkills.mockReturnValue(makeMatchResult());
    mockKeywordExtractSkills.mockReturnValue([]);
    mockGetReputation.mockResolvedValue({ success: true, data: { score: 75 } });
  });

  describe('getProjectRecommendations', () => {
    it('should return PROFILE_NOT_FOUND when freelancer profile does not exist', async () => {
      mockGetProfileByUserId.mockResolvedValue(null);
      const result = await getProjectRecommendations('freelancer-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return empty array when no open projects exist', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockGetAllOpenProjects.mockResolvedValue({ items: [] });
      const result = await getProjectRecommendations('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(0);
    });

    it('should return ranked project recommendations using keyword matching', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockGetAllOpenProjects.mockResolvedValue({ items: [makeProject(), makeProject({ id: 'project-2' })] });
      mockKeywordMatchSkills
        .mockReturnValueOnce(makeMatchResult(90))
        .mockReturnValueOnce(makeMatchResult(60));

      const result = await getProjectRecommendations('freelancer-1', 5);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]?.matchScore).toBeGreaterThanOrEqual(result.data[1]?.matchScore ?? 0);
      }
    });

    it('should use AI when available and fall back on error', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(true);
      mockAnalyzeSkillMatch.mockResolvedValue({ error: 'AI failed' });
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockGetAllOpenProjects.mockResolvedValue({ items: [makeProject()] });

      const result = await getProjectRecommendations('freelancer-1');
      expect(result.success).toBe(true);
      expect(mockKeywordMatchSkills).toHaveBeenCalled();
    });

    it('should use AI match result when AI succeeds', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(false);
      const aiMatch = makeMatchResult(95);
      mockAnalyzeSkillMatch.mockResolvedValue(aiMatch);
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockGetAllOpenProjects.mockResolvedValue({ items: [makeProject()] });

      const result = await getProjectRecommendations('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data[0]?.matchScore).toBe(95);
    });
  });

  describe('getFreelancerRecommendations', () => {
    it('should return PROJECT_NOT_FOUND when project does not exist', async () => {
      mockFindProjectById.mockResolvedValue(null);
      const result = await getFreelancerRecommendations('project-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should return empty array when no freelancers are available', async () => {
      mockFindProjectById.mockResolvedValue(makeProject());
      mockGetAvailableProfiles.mockResolvedValue([]);
      const result = await getFreelancerRecommendations('project-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(0);
    });

    it('should return ranked freelancer recommendations', async () => {
      mockFindProjectById.mockResolvedValue(makeProject());
      mockGetAvailableProfiles.mockResolvedValue([
        makeFreelancerProfile({ user_id: 'fl-1' }),
        makeFreelancerProfile({ user_id: 'fl-2' }),
      ]);
      mockKeywordMatchSkills
        .mockReturnValueOnce(makeMatchResult(80))
        .mockReturnValueOnce(makeMatchResult(50));

      const result = await getFreelancerRecommendations('project-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(2);
        expect(result.data[0]?.combinedScore).toBeGreaterThanOrEqual(result.data[1]?.combinedScore ?? 0);
      }
    });

    it('should use default reputation score when getReputation fails', async () => {
      mockFindProjectById.mockResolvedValue(makeProject());
      mockGetAvailableProfiles.mockResolvedValue([makeFreelancerProfile()]);
      mockGetReputation.mockRejectedValue(new Error('reputation failed'));

      const result = await getFreelancerRecommendations('project-1');
      expect(result.success).toBe(true);
    });

    it('should use AI matching when available', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(false);
      mockAnalyzeSkillMatch.mockResolvedValue(makeMatchResult(88));
      mockFindProjectById.mockResolvedValue(makeProject());
      mockGetAvailableProfiles.mockResolvedValue([makeFreelancerProfile()]);

      const result = await getFreelancerRecommendations('project-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data[0]?.matchScore).toBe(88);
    });
  });

  describe('extractSkillsFromText', () => {
    it('should return INVALID_INPUT for empty text', async () => {
      const result = await extractSkillsFromText('');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_INPUT');
    });

    it('should return INVALID_INPUT for whitespace-only text', async () => {
      const result = await extractSkillsFromText('   ');
      expect(result.success).toBe(false);
    });

    it('should return empty array when no skills in taxonomy', async () => {
      mockGetActiveSkills.mockResolvedValue([]);
      const result = await extractSkillsFromText('I know React and TypeScript');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(0);
    });

    it('should use keyword extraction when AI unavailable', async () => {
      const skill = { id: 's1', name: 'React', categoryId: 'cat1' };
      mockGetActiveSkills.mockResolvedValue([skill]);
      mockKeywordExtractSkills.mockReturnValue([{ skillId: 's1', skillName: 'React', confidence: 0.9 }]);

      const result = await extractSkillsFromText('I use React daily');
      expect(result.success).toBe(true);
      expect(mockKeywordExtractSkills).toHaveBeenCalled();
    });

    it('should use AI extraction when available and fall back on error', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(true);
      mockExtractSkills.mockResolvedValue({ error: 'AI failed' });
      const skill = { id: 's1', name: 'React', categoryId: 'cat1' };
      mockGetActiveSkills.mockResolvedValue([skill]);
      mockKeywordExtractSkills.mockReturnValue([]);

      const result = await extractSkillsFromText('React developer');
      expect(result.success).toBe(true);
    });

    it('should filter extracted skills to only valid taxonomy IDs', async () => {
      const skill = { id: 's1', name: 'React', categoryId: 'cat1' };
      mockGetActiveSkills.mockResolvedValue([skill]);
      mockKeywordExtractSkills.mockReturnValue([
        { skillId: 's1', skillName: 'React', confidence: 0.9 },
        { skillId: 'invalid-id', skillName: 'Unknown', confidence: 0.3 },
      ]);

      const result = await extractSkillsFromText('React developer');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.every((s: any) => s.skillId === 's1')).toBe(true);
      }
    });
  });

  describe('analyzeSkillGaps', () => {
    it('should return PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockGetProfileByUserId.mockResolvedValue(null);
      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return basic analysis without AI when AI unavailable', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockIsAIAvailable.mockReturnValue(false);

      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentSkills).toContain('React');
        expect(result.data.reasoning).toContain('unavailable');
      }
    });

    it('should return basic analysis when AI returns non-string', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValue({ error: 'not a string' });

      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toContain('failed');
      }
    });

    it('should parse and return AI analysis on success', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValue('{"currentSkills":["React"],"recommendedSkills":["TypeScript"],"marketDemand":[{"skillName":"TypeScript","demandLevel":"high"}],"reasoning":"Good analysis"}');
      mockParseJsonResponse.mockReturnValue({
        currentSkills: ['React'],
        recommendedSkills: ['TypeScript'],
        marketDemand: [{ skillName: 'TypeScript', demandLevel: 'high' }],
        reasoning: 'Good analysis',
      });

      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recommendedSkills).toContain('TypeScript');
      }
    });

    it('should sanitize marketDemand items with invalid demandLevel', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValue('{}');
      mockParseJsonResponse.mockReturnValue({
        currentSkills: ['React'],
        recommendedSkills: [],
        marketDemand: [
          { skillName: 'TypeScript', demandLevel: 'extreme' },
          { skillName: '', demandLevel: 'high' },
        ],
        reasoning: 'Test',
      });

      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        const validItems = result.data.marketDemand.filter(m => m.skillName === 'TypeScript');
        expect(validItems[0]?.demandLevel).toBe('medium');
      }
    });

    it('should handle JSON parse failure gracefully', async () => {
      mockGetProfileByUserId.mockResolvedValue(makeFreelancerProfile());
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValue('valid-string-but-parse-throws');
      mockParseJsonResponse.mockImplementation(() => { throw new Error('parse error'); });

      const result = await analyzeSkillGaps('freelancer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toContain('parse');
      }
    });
  });

  describe('isMatchingError', () => {
    it('should return true for failure results', () => {
      const result = { success: false as const, error: { code: 'ERR', message: 'test' } };
      expect(isMatchingError(result)).toBe(true);
    });

    it('should return false for success results', () => {
      const result = { success: true as const, data: [] };
      expect(isMatchingError(result)).toBe(false);
    });
  });
});
