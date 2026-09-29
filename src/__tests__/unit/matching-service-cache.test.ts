// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const redisGet = jest.fn<any>();
const redisSet = jest.fn<any>();
const redisDel = jest.fn<any>();
const redisKeys = jest.fn<any>();
const redis = { status: 'ready', get: redisGet, set: redisSet, del: redisDel, keys: redisKeys };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const getProfileByUserId = jest.fn<any>();
const getAvailableProfiles = jest.fn<any>();
const getAllOpenProjects = jest.fn<any>();
const findProjectById = jest.fn<any>();
const getReputation = jest.fn<any>();
const getProUserIdSet = jest.fn<any>();
const analyzeSkillMatch = jest.fn<any>();
const getActiveSkills = jest.fn<any>();

const keywordMatchSkills = jest.fn((freelancerSkills: any[], requirements: any[]) => {
  const available = new Set(freelancerSkills.map((skill) => skill.skillName.toLowerCase()));
  const matched = requirements.filter((skill) => available.has(skill.skillName.toLowerCase()));
  return {
    matchScore: requirements.length ? Math.round((matched.length / requirements.length) * 100) : 0,
    matchedSkills: matched.map((skill) => skill.skillName),
    missingSkills: requirements.filter((skill) => !available.has(skill.skillName.toLowerCase())).map((skill) => skill.skillName),
    reasoning: 'Keyword match',
  };
});

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({ redis }));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger }));
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: { getDocument: jest.fn() }, DATABASE_ID: 'db',
}));
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: { getProfileByUserId, getAvailableProfiles },
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { getAllOpenProjects, findProjectById },
}));
jest.unstable_mockModule(resolveModule('src/repositories/portfolio-repository.ts'), () => ({
  portfolioRepository: { findByFreelancer: jest.fn() },
}));
jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({ getReputation }));
jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({ getProUserIdSet }));
jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({ getActiveSkills }));
jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  analyzeSkillMatch,
  extractSkills: jest.fn(),
  keywordMatchSkills,
  keywordExtractSkills: jest.fn(() => []),
  isAIAvailable: jest.fn(() => false),
  isAIError: jest.fn(() => false),
  generateContent: jest.fn(),
  parseJsonResponse: jest.fn(),
  generateAIProposal: jest.fn(),
  fallbackGenerateProposal: jest.fn(),
  SKILL_GAP_PROMPT: '',
}));

const previousCacheFlag = process.env['ENABLE_MATCHING_CACHE_TEST'];
process.env['ENABLE_MATCHING_CACHE_TEST'] = 'true';

const matching = await import('../../services/matching-service.js');

const project = {
  id: 'project-1', employer_id: 'employer-1', title: 'Project', description: 'Build it', budget: 1000,
  required_skills: [{ skill_id: 'react', skill_name: 'React', category_id: 'frontend' }],
};

describe('matching service cache, invalidation, and bounded-pool paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    matching.localProjectRecCache.clear();
    matching.localFreelancerRecCache.clear();
    matching.localExtractSkillsCache.clear();
    redis.status = 'ready';
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
    redisKeys.mockResolvedValue([]);
    getProUserIdSet.mockResolvedValue(new Set());
    getReputation.mockResolvedValue({ success: true, data: { score: 4, averageRating: 4, totalRatings: 3 } });
  });

  afterAll(() => {
    if (previousCacheFlag === undefined) delete process.env['ENABLE_MATCHING_CACHE_TEST'];
    else process.env['ENABLE_MATCHING_CACHE_TEST'] = previousCacheFlag;
  });

  it('returns distributed cache hits for each public cached read', async () => {
    const projects = [{ projectId: 'cached-project', matchScore: 90 }];
    const freelancers = [{ freelancerId: 'cached-user', combinedScore: 80 }];
    const skills = [{ skillId: 'react', skillName: 'React', confidence: 1 }];
    redisGet
      .mockResolvedValueOnce(JSON.stringify(projects))
      .mockResolvedValueOnce(JSON.stringify(freelancers))
      .mockResolvedValueOnce(JSON.stringify(skills));

    await expect(matching.getProjectRecommendations('user-cache', 3))
      .resolves.toEqual({ success: true, data: projects });
    await expect(matching.getFreelancerRecommendations('project-cache', 3))
      .resolves.toEqual({ success: true, data: freelancers });
    await expect(matching.extractSkillsFromText('React developer'))
      .resolves.toEqual({ success: true, data: skills });

    expect(getProfileByUserId).not.toHaveBeenCalled();
    expect(findProjectById).not.toHaveBeenCalled();
    expect(getActiveSkills).not.toHaveBeenCalled();
  });

  it('uses local cache after a Redis read failure and logs Redis write failures', async () => {
    const cached = [{ projectId: 'local-project', matchScore: 75 }];
    matching.localProjectRecCache.set('matching:projects:user-local:2', cached);
    redisGet.mockRejectedValueOnce(new Error('read unavailable'));

    await expect(matching.getProjectRecommendations('user-local', 2))
      .resolves.toEqual({ success: true, data: cached });

    matching.localProjectRecCache.clear();
    redisSet.mockRejectedValueOnce(new Error('write unavailable'));
    getProfileByUserId.mockResolvedValue({ user_id: 'user-write', skills: [{ name: 'React', years_of_experience: 2 }] });
    getAllOpenProjects.mockResolvedValue({ items: [project] });
    await matching.getProjectRecommendations('user-write', 2);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Redis get failed'), expect.any(Object));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Redis set failed'), expect.any(Object));
  });

  it('prefilters a large pool and applies real reputation scores', async () => {
    findProjectById.mockResolvedValue(project);
    getAvailableProfiles.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({
      user_id: `freelancer-${index}`,
      skills: [{ name: index < 5 ? 'React' : 'Rust', years_of_experience: 2 }],
    })));

    const result = await matching.getFreelancerRecommendations('project-large', 2);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ matchScore: 100, reputationScore: 80, averageRating: 4, totalRatings: 3 });
    expect(getReputation).toHaveBeenCalledTimes(20);
  });

  it('falls back to keyword matches when AI recommendation calls throw', async () => {
    const aiClient = await import('../../services/ai-client.js');
    aiClient.isAIAvailable.mockReturnValue(true);
    analyzeSkillMatch.mockRejectedValue(new Error('AI unavailable'));
    getProfileByUserId.mockResolvedValue({ user_id: 'user-ai', skills: [{ name: 'React', years_of_experience: 2 }] });
    getAllOpenProjects.mockResolvedValue({ items: [project] });

    const projects = await matching.getProjectRecommendations('user-ai', 2);
    expect(projects.success).toBe(true);
    expect(projects.data[0].matchScore).toBe(100);

    findProjectById.mockResolvedValue(project);
    getAvailableProfiles.mockResolvedValue([{ user_id: 'candidate-ai', skills: [{ name: 'React', years_of_experience: 2 }] }]);
    const freelancers = await matching.getFreelancerRecommendations('project-ai', 2);
    expect(freelancers.success).toBe(true);
    expect(freelancers.data[0].matchScore).toBe(100);
  });

  it('deletes matching Redis keys for freelancer and project invalidation', async () => {
    redisKeys
      .mockResolvedValueOnce(['matching:projects:user-1:10'])
      .mockResolvedValueOnce(['matching:freelancers:project-1:10'])
      .mockResolvedValueOnce(['matching:projects:user-2:10']);

    await matching.invalidateFreelancerMatchingCache('user-1');
    await matching.invalidateProjectMatchingCache('project-1');

    expect(redisDel).toHaveBeenCalledWith('matching:skill-gaps:user-1');
    expect(redisDel).toHaveBeenCalledWith('matching:projects:user-1:10');
    expect(redisDel).toHaveBeenCalledWith('matching:freelancers:project-1:10');
    expect(redisDel).toHaveBeenCalledWith('matching:projects:user-2:10');
  });

  it('logs invalidation failures without rejecting', async () => {
    redisDel.mockRejectedValueOnce(new Error('freelancer invalidation failed'));
    await expect(matching.invalidateFreelancerMatchingCache('user-1')).resolves.toBeUndefined();

    redisKeys.mockRejectedValueOnce('project invalidation failed');
    await expect(matching.invalidateProjectMatchingCache('project-1')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('matching cache of user-1'), expect.any(Object),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('project matching cache of project-1'), expect.any(Object),
    );
  });
});
