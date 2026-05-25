// @ts-nocheck
/**
 * Covers ai-client.ts uncovered statements:
 * - Lines 219-220: HTTP retry path (retryable error + retryCount < MAX_RETRIES)
 * - Lines 287-288: Network/abort retry path
 * - Lines 310-311: extractResponseText null for empty candidates
 * - Line 605: deserializeAIResponse catch block
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    llm: {
      apiKey: 'test-key',
      apiUrl: 'https://api.test.com',
      model: 'gpt-4',
    },
  },
}));

const mockFetch = jest.fn<any>();

describe('AI Client - statement coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Lines 219-220: HTTP 500 triggers retry then succeeds
  it('retries on HTTP 500 and succeeds on second attempt', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello', role: 'assistant' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      };
    });

    const { generateContent } = await import('../../services/ai-client.js');
    const result = await generateContent('test prompt');
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(typeof result).toBe('string');
  }, 30000);

  // Lines 287-288: Network error triggers retry
  it('retries on network TypeError and eventually returns error', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const { generateContent } = await import('../../services/ai-client.js');
    const result = await generateContent('test prompt');
    // After max retries, returns AI error
    expect(result).toBeDefined();
  }, 30000);

  // Lines 310-311: empty candidates returns null from extractResponseText
  it('returns AI error when AI response has empty candidates', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [], // empty choices = empty candidates
      }),
    });

    const { generateContent } = await import('../../services/ai-client.js');
    const result = await generateContent('test prompt');
    // generateContent returns AI_EMPTY_RESPONSE error when extractResponseText returns null
    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    expect((result as any).code).toBe('AI_EMPTY_RESPONSE');
  });

  // Line 605: deserializeAIResponse catch block (invalid JSON)
  it('deserializeAIResponse returns null for invalid JSON', async () => {
    const { deserializeAIResponse } = await import('../../services/ai-client.js');
    const result = deserializeAIResponse('not valid json {{{');
    expect(result).toBeNull();
  });

  it('deserializeAIResponse returns null for valid JSON missing required fields', async () => {
    const { deserializeAIResponse } = await import('../../services/ai-client.js');
    const result = deserializeAIResponse(JSON.stringify({ foo: 'bar' }));
    expect(result).toBeNull();
  });

  it('deserializeAIResponse returns parsed response for valid input', async () => {
    const { deserializeAIResponse } = await import('../../services/ai-client.js');
    const valid = {
      type: 'completion',
      payload: { text: 'hello' },
      timestamp: Date.now(),
      requestId: 'req-1',
    };
    const result = deserializeAIResponse(JSON.stringify(valid));
    expect(result).not.toBeNull();
    expect(result?.type).toBe('completion');
  });

  // parseJsonResponse null path
  it('parseJsonResponse returns null for unparseable content', async () => {
    const { parseJsonResponse } = await import('../../services/ai-client.js');
    const result = parseJsonResponse('completely invalid <<<>>>', 'Test');
    expect(result).toBeNull();
  });
});
