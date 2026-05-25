// @ts-nocheck
/**
 * Coverage completion tests - Matching Service uncovered lines 193, 261, 330
 * These are AI fallback paths when AI returns errors
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = {
  query: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
  query: jest.fn(),
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock AI client - make AI available but return errors to trigger fallback paths
const mockAnalyzeSkillMatch = jest.fn<any>();
const mockExtractSkills = jest.fn<any>();
const mockIsAIAvailable = jest.fn<any>();
const mockIsAIError = jest.fn<any>();
const mockGenerateContent = jest.fn<any>();
const mockParseJsonResponse = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkills,
  keywordMatchSkills: jest.fn(() => ({ overallScore: 50, matchedSkills: [], missingSkills: [], reasoning: 'Keyword match' })),
  keywordExtractSkills: jest.fn(() => []),
  isAIAvailable: mockIsAIAvailable,
  isAIError: mockIsAIError,
  generateContent: mockGenerateContent,
  parseJsonResponse: mockParseJsonResponse,
  SKILL_GAP_PROMPT: 'mock prompt {{freelancerSkills}} {{projectRequirements}}',
}));

// Mock repositories
const mockProjectRepo = {
  findProjectById: jest.fn<any>(),
  getById: jest.fn<any>(),
  getAll: jest.fn<any>(),
  getOpenProjects: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

const mockFreelancerProfileRepo = {
  getByUserId: jest.fn<any>(),
  getProfileByUserId: jest.fn<any>(),
  getAvailableProfiles: jest.fn<any>(),
  getAll: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepo,
}));

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: jest.fn().mockResolvedValue([
    { id: 's-1', name: 'React', categoryId: 'c-1' },
    { id: 's-2', name: 'TypeScript', categoryId: 'c-1' },
  ]),
}));

const mockGetReputation = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: mockGetReputation,
}));

const { getFreelancerRecommendations, extractSkillsFromText, analyzeSkillGaps } = await import('../../services/matching-service.js');

describe('Matching Service - AI Fallback Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReputation.mockResolvedValue({ success: true, data: { score: 4.5 } });
  });

  describe('getFreelancerRecommendations - AI error fallback (line 193)', () => {
    it('should fall back to keyword matching when AI returns error', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(true);
      mockAnalyzeSkillMatch.mockResolvedValue({ error: 'AI unavailable' });

      // Mock project
      mockProjectRepo.findProjectById.mockResolvedValue({
        id: 'p-1',
        required_skills: [{ skill_id: 's-1', skill_name: 'React', category_id: 'c-1' }],
        employer_id: 'emp-1',
      });

      // Mock freelancer profiles
      mockFreelancerProfileRepo.getAvailableProfiles.mockResolvedValue([
        {
          id: 'fp-1',
          user_id: 'user-1',
          skills: [{ name: 'React', years_of_experience: 3 }],
        },
      ]);

      const result = await getFreelancerRecommendations('p-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should use keyword matching when AI is not available', async () => {
      mockIsAIAvailable.mockReturnValue(false);

      mockProjectRepo.findProjectById.mockResolvedValue({
        id: 'p-1',
        required_skills: [{ skill_id: 's-1', skill_name: 'React', category_id: 'c-1' }],
        employer_id: 'emp-1',
      });

      mockFreelancerProfileRepo.getAvailableProfiles.mockResolvedValue([
        {
          id: 'fp-1',
          user_id: 'user-1',
          skills: [{ name: 'React', years_of_experience: 3 }],
        },
      ]);

      const result = await getFreelancerRecommendations('p-1');
      expect(result.success).toBe(true);
    });
  });

  describe('extractSkillsFromText - AI error fallback (line 261)', () => {
    it('should fall back to keyword extraction when AI returns error', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(true);
      // Return an object that the real isAIError would also recognize as an error
      mockExtractSkills.mockResolvedValue({
        code: 'AI_UNAVAILABLE',
        message: 'AI service down',
        retryable: false,
      });

      const result = await extractSkillsFromText('I know React and TypeScript');
      expect(result.success).toBe(true);
    });
  });

  describe('analyzeSkillGaps - AI parse failure (line 330)', () => {
    it('should handle null parseJsonResponse result', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(false);
      mockGenerateContent.mockResolvedValue('some non-json response');
      mockParseJsonResponse.mockReturnValue(null);

      mockFreelancerProfileRepo.getProfileByUserId.mockResolvedValue({
        id: 'fp-1',
        user_id: 'user-1',
        skills: [{ name: 'React', years_of_experience: 3 }],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toContain('Failed to parse');
      }
    });

    it('should handle AI not available', async () => {
      mockIsAIAvailable.mockReturnValue(false);

      mockFreelancerProfileRepo.getProfileByUserId.mockResolvedValue({
        id: 'fp-1',
        user_id: 'user-1',
        skills: [{ name: 'React', years_of_experience: 3 }],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toContain('unavailable');
      }
    });

    it('should handle AI returning non-string response', async () => {
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValue({ error: 'something' });

      mockFreelancerProfileRepo.getProfileByUserId.mockResolvedValue({
        id: 'fp-1',
        user_id: 'user-1',
        skills: [{ name: 'React', years_of_experience: 3 }],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reasoning).toContain('failed');
      }
    });
  });
});
