// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { ai: { provider: 'openai' } },
}));

jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  analyzeSkillMatch: jest.fn(),
  extractSkills: jest.fn().mockResolvedValue([{ skillId: 'skill-1', skillName: 'React' }]),
  keywordMatchSkills: jest.fn(),
  keywordExtractSkills: jest.fn(),
  isAIAvailable: jest.fn().mockReturnValue(true),
  isAIError: jest.fn().mockReturnValue(false),
  generateContent: jest.fn(),
  parseJsonResponse: jest.fn(),
  SKILL_GAP_PROMPT: 'test prompt',
}));

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: jest.fn().mockResolvedValue([{ id: 'skill-1', name: 'React', categoryId: 'cat-1' }]),
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: { getAllSkills: jest.fn().mockResolvedValue([]) },
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { findProjectsBySkills: jest.fn().mockResolvedValue([]) },
}));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: { getAvailableProfiles: jest.fn().mockResolvedValue([]) },
}));

const { extractSkillsFromText } = await import('../../services/matching-service.js');

describe('Matching Service - AI success path (line 262)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use AI result when AI returns success', async () => {
    const result = await extractSkillsFromText('Looking for a React developer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });
});
