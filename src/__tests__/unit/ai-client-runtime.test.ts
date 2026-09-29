// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const runtimeConfig = {
  llm: {
    apiKey: 'gemini-key',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    timeoutMs: 1_000,
  },
};
const redisGet = jest.fn<any>();
const redisSet = jest.fn<any>();
const redis = { status: 'ready', get: redisGet, set: redisSet };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const fetchMock = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({ config: runtimeConfig }));
jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({ redis }));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger }));

const previousNodeEnv = process.env['NODE_ENV'];
process.env['NODE_ENV'] = 'production';
global.fetch = fetchMock;

const ai = await import('../../services/ai-client.js');

const proposalRequest = {
  freelancerName: 'Ada', freelancerTitle: 'Engineer', freelancerBio: '',
  freelancerSkills: ['React'], reputationScore: 0, completedProjectsCount: 0,
  portfolioItems: [], projectTitle: 'Dashboard', projectDescription: 'Build it',
  projectSkills: ['React'], projectBudget: 2_400,
  projectMilestones: [{ title: 'Delivery', description: undefined, amount: undefined }],
};

describe('AI client production runtime paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ai.localSkillMatchCache.clear();
    ai.localSkillExtractCache.clear();
    redis.status = 'ready';
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    runtimeConfig.llm.apiKey = 'gemini-key';
    runtimeConfig.llm.apiUrl = 'https://generativelanguage.googleapis.com/v1beta';
    runtimeConfig.llm.model = 'gemini-2.0-flash';
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousNodeEnv;
  });

  it('builds a Gemini request and maps the Gemini response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }] }),
    });

    await expect(ai.generateContent('Hello Gemini')).resolves.toBe('Gemini response');

    expect(fetchMock.mock.calls[0][0]).toContain(
      '/models/gemini-2.0-flash:generateContent?key=gemini-key',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      contents: [{ parts: [{ text: 'Hello Gemini' }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
  });

  it('appends chat/completions for an OpenAI-compatible provider', async () => {
    runtimeConfig.llm.apiUrl = 'https://openrouter.ai/api/v1';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OpenRouter response' } }] }),
    });

    await expect(ai.generateContent('Hello OpenRouter')).resolves.toBe('OpenRouter response');

    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('returns a distributed skill-match cache hit without calling the model', async () => {
    const cached = { matchScore: 80, matchedSkills: ['React'], missingSkills: [], reasoning: 'Cached' };
    redisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await ai.analyzeSkillMatch({
      freelancerSkills: [{ skillId: '1', skillName: 'React' }],
      projectRequirements: [{ skillId: '2', skillName: 'React' }],
    });

    expect(result).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to local cache on Redis read failure and tolerates Redis write failure', async () => {
    redisSet.mockRejectedValueOnce(new Error('write unavailable'));
    const request = {
      freelancerSkills: [{ skillId: '1', skillName: 'React' }],
      projectRequirements: [{ skillId: '2', skillName: 'React' }],
    };

    const first = await ai.analyzeSkillMatch(request);
    redisGet.mockRejectedValueOnce(new Error('read unavailable'));
    const second = await ai.analyzeSkillMatch(request);

    expect(second).toEqual(first);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis AI set failed'), expect.any(Object),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis AI get failed'), expect.any(Object),
    );
  });

  it('returns an extracted-skills cache hit', async () => {
    const cached = [{ skillId: 'react', skillName: 'React', confidence: 0.9 }];
    redisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await ai.extractSkills({
      text: 'React developer',
      availableSkills: [{ skillId: 'react', skillName: 'React' }],
    });

    expect(result).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns transport and parse errors for non-trivial skill matching requests', async () => {
    const transportRequest = {
      freelancerSkills: [{ skillId: '1', skillName: 'React' }, { skillId: '2', skillName: 'Node.js' }],
      projectRequirements: [{ skillId: '3', skillName: 'React' }, { skillId: '4', skillName: 'Python' }],
    };
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' });

    const transportResult = await ai.analyzeSkillMatch(transportRequest);

    expect(transportResult).toMatchObject({ code: 'AI_HTTP_503', retryable: true });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
    });
    const parseResult = await ai.analyzeSkillMatch({
      freelancerSkills: [{ skillId: '5', skillName: 'Vue' }, { skillId: '6', skillName: 'Go' }],
      projectRequirements: [{ skillId: '7', skillName: 'Vue' }, { skillId: '8', skillName: 'Rust' }],
    });

    expect(parseResult).toMatchObject({ code: 'AI_PARSE_ERROR', retryable: false });
  });

  it('uses the deterministic proposal when AI is unavailable', async () => {
    runtimeConfig.llm.apiKey = '';

    const result = await ai.generateAIProposal(proposalRequest);

    expect(result.coverLetter).toContain('Dear Employer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the deterministic proposal for AI transport and parse failures', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
      });

    const transportFallback = await ai.generateAIProposal(proposalRequest);
    const parseFallback = await ai.generateAIProposal(proposalRequest);

    expect(transportFallback.coverLetter).toContain('Dear Employer');
    expect(parseFallback.coverLetter).toContain('Dear Employer');
  });

  it('maps project milestones when the AI omits a milestone plan', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ coverLetter: 'Custom proposal', proposedRate: 2500, estimatedDuration: 8 }) }] },
          finishReason: 'stop',
        }],
      }),
    });

    const result = await ai.generateAIProposal({
      ...proposalRequest,
      portfolioItems: [{
        title: 'Prior dashboard', description: 'A production analytics app',
        skills: ['React'], projectUrl: 'https://example.com/dashboard',
      }],
    });

    expect(result.proposedMilestones).toEqual([
      { title: 'Delivery', description: '', amount: 0, durationDays: 7 },
    ]);
  });
});
