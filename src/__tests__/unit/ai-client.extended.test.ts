import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock config
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    llm: {
      apiKey: 'test-api-key',
      apiUrl: 'https://api.test.com',
      model: 'test-model',
    },
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFetch = jest.fn<(...args: any[]) => Promise<any>>();

describe('AI Client - Extended Tests', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: {
        llm: {
          apiKey: 'test-api-key',
          apiUrl: 'https://api.test.com',
          model: 'test-model',
        },
      },
    }));
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    jest.clearAllMocks();
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/ai-client.js');
  };

  describe('generateContent', () => {
    it('should return generated text on success', async () => {
      const { generateContent } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Generated response', role: 'assistant' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      } as any);

      const result = await generateContent('Test prompt');

      expect(typeof result).toBe('string');
      expect(result).toBe('Generated response');
    });

    it('should return AI error when API key is missing', async () => {
      jest.resetModules();
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          llm: {
            apiKey: '',
            apiUrl: 'https://api.test.com',
            model: 'test-model',
          },
        },
      }));
      const { generateContent } = await importModule();

      const result = await generateContent('Test prompt');

      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_UNAVAILABLE');
      }
    });

    it('should return AI error on HTTP 500', async () => {
      const { generateContent } = await importModule();
      jest.useFakeTimers();

      // Mock all retry attempts to return 500
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as any);

      const resultPromise = generateContent('Test prompt');
      
      // Advance through all retry delays
      await jest.advanceTimersByTimeAsync(15000);
      
      const result = await resultPromise;

      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_HTTP_500');
      }
      jest.useRealTimers();
    });

    it('should return AI error on HTTP 429 and not retry beyond max', async () => {
      const { generateContent } = await importModule();
      jest.useFakeTimers();

      // All 3 retries + initial = 4 calls, all return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      } as any);

      const resultPromise = generateContent('Test prompt');
      
      // Advance through all retry delays
      await jest.advanceTimersByTimeAsync(15000);
      
      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_HTTP_429');
      }
      jest.useRealTimers();
    });

    it('should retry on network error and eventually succeed', async () => {
      const { generateContent } = await importModule();
      jest.useFakeTimers();

      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Success after retry', role: 'assistant' }, finish_reason: 'stop' }],
          }),
        } as any);

      const resultPromise = generateContent('Test prompt');
      
      await jest.advanceTimersByTimeAsync(5000);
      
      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toBe('Success after retry');
      jest.useRealTimers();
    });

    it('should return AI error on abort error after retries', async () => {
      const { generateContent } = await importModule();
      jest.useFakeTimers();

      const abortError = new Error('Timeout');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const resultPromise = generateContent('Test prompt');
      
      await jest.advanceTimersByTimeAsync(15000);
      
      const result = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_NETWORK_ERROR');
      }
      jest.useRealTimers();
    });

    it('should return AI error on empty response', async () => {
      const { generateContent } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      } as any);

      const result = await generateContent('Test prompt');

      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_EMPTY_RESPONSE');
      }
    });

    it('should return AI error when choices are empty', async () => {
      const { generateContent } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      } as any);

      const result = await generateContent('Test prompt');

      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_EMPTY_RESPONSE');
      }
    });
  });

  describe('analyzeSkillMatch', () => {
    it('should return skill match result on success', async () => {
      const { analyzeSkillMatch } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 75, matchedSkills: ['JavaScript'], missingSkills: ['Python'], reasoning: 'Good match' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: '1', skillName: 'JavaScript' }, { skillId: '2', skillName: 'Python' }],
      });

      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        expect(result.matchScore).toBe(75);
        expect(result.matchedSkills).toContain('JavaScript');
        expect(result.missingSkills).toContain('Python');
      }
    });

    it('should return AI error when generateContent fails', async () => {
      const { analyzeSkillMatch } = await importModule();
      jest.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Error',
      } as any);

      const resultPromise = analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: '2', skillName: 'Python' }],
      });
      
      await jest.advanceTimersByTimeAsync(15000);
      
      const result = await resultPromise;

      expect(typeof result).toBe('object');
      if ('code' in result) {
        expect(result.code).toBe('AI_HTTP_500');
      }
      jest.useRealTimers();
    });

    it('should return parse error for invalid JSON response', async () => {
      const { analyzeSkillMatch } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'not valid json', role: 'assistant' },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: '2', skillName: 'Python' }],
      });

      expect(typeof result).toBe('object');
      if ('code' in result) {
        expect(result.code).toBe('AI_PARSE_ERROR');
      }
    });

    it('should validate matchedSkills against actual data', async () => {
      const { analyzeSkillMatch } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 100, matchedSkills: ['FakeSkill'], missingSkills: [], reasoning: 'Test' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: '1', skillName: 'JavaScript' }],
      });

      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        expect(result.matchScore).toBe(0);
        expect(result.matchedSkills).toHaveLength(0);
      }
    });

    it('should use calculated score when AI score differs by more than 40', async () => {
      const { analyzeSkillMatch } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 100, matchedSkills: ['JavaScript'], missingSkills: [], reasoning: 'Test' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: '1', skillName: 'JavaScript' }, { skillId: '2', skillName: 'Python' }],
      });

      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        // Calculated score is 50, AI said 100, diff > 40, so use calculated = 50
        expect(result.matchScore).toBe(50);
      }
    });

    it('should handle empty project requirements', async () => {
      const { analyzeSkillMatch } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 0, matchedSkills: [], missingSkills: [], reasoning: 'None' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: '1', skillName: 'JavaScript' }],
        projectRequirements: [],
      });

      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        expect(result.matchScore).toBe(0);
      }
    });
  });

  describe('extractSkills', () => {
    it('should return extracted skills on success', async () => {
      const { extractSkills } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
                { skillId: '1', skillName: 'JavaScript', confidence: 0.95 },
                { skillId: '2', skillName: 'TypeScript', confidence: 0.85 },
              ]),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await extractSkills({
        text: 'I know JavaScript and TypeScript',
        availableSkills: [
          { skillId: '1', skillName: 'JavaScript' },
          { skillId: '2', skillName: 'TypeScript' },
        ],
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]?.skillId).toBe('1');
      }
    });

    it('should return AI error when generateContent fails', async () => {
      const { extractSkills } = await importModule();
      jest.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as any);

      const resultPromise = extractSkills({
        text: 'test',
        availableSkills: [],
      });
      
      await jest.advanceTimersByTimeAsync(15000);
      
      const result = await resultPromise;

      expect(typeof result).toBe('object');
      if ('code' in result) {
        expect(result.code).toBe('AI_HTTP_503');
      }
      jest.useRealTimers();
    });

    it('should return parse error for non-array JSON response', async () => {
      const { extractSkills } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: JSON.stringify({ notAnArray: true }), role: 'assistant' },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await extractSkills({
        text: 'test',
        availableSkills: [],
      });

      expect(typeof result).toBe('object');
      if ('code' in result) {
        expect(result.code).toBe('AI_PARSE_ERROR');
      }
    });

    it('should filter out skills with missing fields', async () => {
      const { extractSkills } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
                { skillId: '1', skillName: 'JavaScript', confidence: 0.9 },
                { skillId: '', skillName: '', confidence: 0.5 },
                { skillId: '2', skillName: 'TypeScript' },
              ]),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await extractSkills({
        text: 'test',
        availableSkills: [],
      });

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
      }
    });

    it('should clamp confidence values to [0, 1]', async () => {
      const { extractSkills } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
                { skillId: '1', skillName: 'JavaScript', confidence: 1.5 },
                { skillId: '2', skillName: 'TypeScript', confidence: -0.5 },
              ]),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      } as any);

      const result = await extractSkills({
        text: 'test',
        availableSkills: [],
      });

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result[0]?.confidence).toBe(1);
        expect(result[1]?.confidence).toBe(0);
      }
    });
  });

  describe('buildApiUrl edge cases', () => {
    it('should use URL as-is when it already ends with endpoint', async () => {
      jest.resetModules();
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          llm: {
            apiKey: 'test-key',
            apiUrl: 'https://api.test.com/FreelanceXchain/AI/Recommendations',
            model: 'test-model',
          },
        },
      }));

      const { generateContent } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      } as any);

      await generateContent('test');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toBe('https://api.test.com/FreelanceXchain/AI/Recommendations');
    });

    it('should append endpoint when URL has trailing slashes', async () => {
      jest.resetModules();
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          llm: {
            apiKey: 'test-key',
            apiUrl: 'https://api.test.com///',
            model: 'test-model',
          },
        },
      }));

      const { generateContent } = await importModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      } as any);

      await generateContent('test');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toBe('https://api.test.com/FreelanceXchain/AI/Recommendations');
    });
  });

  describe('parseJsonResponse edge cases', () => {
    it('should handle JSON with preamble text', async () => {
      const { parseJsonResponse } = await importModule();
      const result = parseJsonResponse('Here is the result: {"key": "value"}', 'Test');
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle deeply nested objects', async () => {
      const { parseJsonResponse } = await importModule();
      const result = parseJsonResponse('{"a": {"b": {"c": 1}}}');
      expect(result).toEqual({ a: { b: { c: 1 } } });
    });

    it('should handle JSON arrays directly', async () => {
      const { parseJsonResponse } = await importModule();
      const result = parseJsonResponse('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('isAIError', () => {
    it('should return false for undefined', async () => {
      const { isAIError } = await importModule();
      expect(isAIError(undefined)).toBe(false);
    });

    it('should return false for number', async () => {
      const { isAIError } = await importModule();
      expect(isAIError(42)).toBe(false);
    });
  });
});
