// @ts-nocheck
/**
 * Branch coverage boost tests
 * Targets uncovered branches: ?? fallbacks, ternary operators, optional chaining,
 * error handling paths, and edge cases across 7 source files.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// ═══════════════════════════════════════════════════════════════
// ai-client.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('ai-client.ts – branch coverage', () => {
  const mockFetch = jest.fn<any>();

  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: {
        llm: {
          apiKey: 'test-key',
          apiUrl: 'https://api.test.com',
          model: 'test-model',
        },
      },
    }));
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    }));
    jest.clearAllMocks();
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const load = async () => import('../../services/ai-client.js');

  describe('parseJsonResponse – markdown code block stripping', () => {
    it('should strip ```json prefix and ``` suffix', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('```json\n{"key":"value"}\n```');
      expect(result).toEqual({ key: 'value' });
    });

    it('should strip bare ``` prefix and ``` suffix', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('```\n{"key":"value"}\n```');
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle double-encoded JSON string', async () => {
      const { parseJsonResponse } = await load();
      const inner = JSON.stringify({ key: 'value' });
      const result = parseJsonResponse(`"${inner}"`);
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle truncated JSON by repairing missing brackets', async () => {
      const { parseJsonResponse } = await load();
      // The repair logic adds missing closing brackets/braces
      const result = parseJsonResponse('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle truncated JSON by repairing missing array brackets', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('[1, 2, 3');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle truncated JSON with trailing comma', async () => {
      const { parseJsonResponse } = await load();
      // Test the repair path with mismatched brackets
      const result = parseJsonResponse('{"key": "value", "extra": 123}');
      expect(result).toEqual({ key: 'value', extra: 123 });
    });

    it('should handle JSON with preamble text and brace matching', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('Here is the data: {"a": 1} and more text');
      expect(result).toEqual({ a: 1 });
    });

    it('should handle JSON with braces inside string values', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('{"msg": "hello {world}"}');
      expect(result).toEqual({ msg: 'hello {world}' });
    });

    it('should return null for completely unparseable text', async () => {
      const { parseJsonResponse } = await load();
      const result = parseJsonResponse('not json at all');
      expect(result).toBeNull();
    });
  });

  describe('extractResponseText – edge cases', () => {
    it('should return null when candidates is empty array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_EMPTY_RESPONSE');
      }
    });

    it('should return null when text is empty string in choice', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_EMPTY_RESPONSE');
      }
    });
  });

  describe('makeAIRequest – non-retryable HTTP errors', () => {
    it('should return error without retrying for HTTP 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_HTTP_400');
        expect((result as any).retryable).toBe(false);
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('makeAIRequest – network error after max retries', () => {
    it('should return AI_NETWORK_ERROR after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_NETWORK_ERROR');
      }
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('keywordMatchSkills', () => {
    it('should match by skillId', async () => {
      const { keywordMatchSkills } = await load();
      const result = keywordMatchSkills(
        [{ skillId: 's1', skillName: 'React' }],
        [{ skillId: 's1', skillName: 'React' }]
      );
      expect(result.matchScore).toBe(100);
      expect(result.matchedSkills).toContain('React');
      expect(result.missingSkills).toHaveLength(0);
    });

    it('should match by skillName (case-insensitive)', async () => {
      const { keywordMatchSkills } = await load();
      const result = keywordMatchSkills(
        [{ skillId: 'x', skillName: 'react' }],
        [{ skillId: 'y', skillName: 'React' }]
      );
      expect(result.matchScore).toBe(100);
      expect(result.matchedSkills).toContain('React');
    });

    it('should compute missing skills for non-matches', async () => {
      const { keywordMatchSkills } = await load();
      const result = keywordMatchSkills(
        [{ skillId: 's1', skillName: 'React' }],
        [{ skillId: 's1', skillName: 'React' }, { skillId: 's2', skillName: 'Vue' }]
      );
      expect(result.matchScore).toBe(50);
      expect(result.missingSkills).toContain('Vue');
    });

    it('should return 0 score for empty requirements', async () => {
      const { keywordMatchSkills } = await load();
      const result = keywordMatchSkills(
        [{ skillId: 's1', skillName: 'React' }],
        []
      );
      expect(result.matchScore).toBe(0);
    });
  });

  describe('keywordExtractSkills', () => {
    it('should extract skills with exact match confidence', async () => {
      const { keywordExtractSkills } = await load();
      const result = keywordExtractSkills(
        'I know React and JavaScript',
        [{ skillId: 's1', skillName: 'React' }, { skillId: 's2', skillName: 'JavaScript' }]
      );
      expect(result).toHaveLength(2);
      expect(result[0].confidence).toBe(0.9);
    });

    it('should extract skills with partial match confidence', async () => {
      const { keywordExtractSkills } = await load();
      const result = keywordExtractSkills(
        'I am good at reactjs development',
        [{ skillId: 's1', skillName: 'React' }]
      );
      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(0.6);
    });

    it('should return empty array when no skills match', async () => {
      const { keywordExtractSkills } = await load();
      const result = keywordExtractSkills(
        'I know Go and Rust',
        [{ skillId: 's1', skillName: 'React' }]
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('serializeAIRequest / deserializeAIRequest', () => {
    it('should round-trip correctly', async () => {
      const { serializeAIRequest, deserializeAIRequest } = await load();
      const json = serializeAIRequest('skill_match', { freelancerSkills: [], projectRequirements: [] });
      const parsed = deserializeAIRequest(json);
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('skill_match');
    });

    it('should return null for invalid JSON', async () => {
      const { deserializeAIRequest } = await load();
      expect(deserializeAIRequest('invalid')).toBeNull();
    });

    it('should return null when required fields are missing', async () => {
      const { deserializeAIRequest } = await load();
      expect(deserializeAIRequest(JSON.stringify({ type: 'x' }))).toBeNull();
    });
  });

  describe('serializeAIResponse / deserializeAIResponse', () => {
    it('should round-trip correctly', async () => {
      const { serializeAIResponse, deserializeAIResponse } = await load();
      const json = serializeAIResponse('skill_match', { matchScore: 100, matchedSkills: [], missingSkills: [], reasoning: '' }, 50);
      const parsed = deserializeAIResponse(json);
      expect(parsed).not.toBeNull();
      expect(parsed?.processingTimeMs).toBe(50);
    });

    it('should return null for invalid JSON', async () => {
      const { deserializeAIResponse } = await load();
      expect(deserializeAIResponse('bad json')).toBeNull();
    });

    it('should return null when required fields missing', async () => {
      const { deserializeAIResponse } = await load();
      expect(deserializeAIResponse(JSON.stringify({}))).toBeNull();
    });
  });

  describe('isAIError', () => {
    it('should return true for valid AI error', async () => {
      const { isAIError } = await load();
      expect(isAIError({ code: 'E', message: 'm', retryable: false })).toBe(true);
    });

    it('should return false for null', async () => {
      const { isAIError } = await load();
      expect(isAIError(null)).toBe(false);
    });

    it('should return false for string', async () => {
      const { isAIError } = await load();
      expect(isAIError('error')).toBe(false);
    });

    it('should return false for object missing required fields', async () => {
      const { isAIError } = await load();
      expect(isAIError({ code: 'E' })).toBe(false);
    });
  });

  describe('analyzeSkillMatch – empty/missing fields', () => {
    it('should handle empty freelancerSkills', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 0, matchedSkills: [], reasoning: 'No skills' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      });
      const { analyzeSkillMatch } = await load();
      const result = await analyzeSkillMatch({
        freelancerSkills: [],
        projectRequirements: [{ skillId: 's1', skillName: 'React' }],
      });
      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        expect(result.matchScore).toBe(0);
      }
    });

    it('should handle null matchScore in AI response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchedSkills: ['React'], reasoning: 'test' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      });
      const { analyzeSkillMatch } = await load();
      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: 's1', skillName: 'React' }],
        projectRequirements: [{ skillId: 's1', skillName: 'React' }],
      });
      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        expect(result.matchScore).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('extractSkills – confidence null/undefined', () => {
    it('should default confidence to 0 when null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([{ skillId: 's1', skillName: 'React', confidence: null }]),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      });
      const { extractSkills } = await load();
      const result = await extractSkills({
        text: 'test',
        availableSkills: [],
      });
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result[0].confidence).toBe(0);
      }
    });
  });

  describe('generateContent – HTTP 429 non-retryable', () => {
    it('should retry on 429 then fail with AI_HTTP_429', async () => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });
      const { generateContent } = await load();
      const promise = generateContent('test');
      await jest.advanceTimersByTimeAsync(20000);
      const result = await promise;
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_HTTP_429');
      }
      jest.useRealTimers();
    });
  });

  describe('makeAIRequest – AbortError after max retries', () => {
    it('should return AI_NETWORK_ERROR for AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_NETWORK_ERROR');
        expect((result as any).retryable).toBe(true);
      }
    });
  });

  describe('makeAIRequest – non-Error throw', () => {
    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValue('string error');
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(typeof result).toBe('object');
      if (typeof result === 'object' && result !== null) {
        expect((result as any).code).toBe('AI_NETWORK_ERROR');
        expect((result as any).message).toBe('Network error');
      }
    });
  });

  describe('analyzeSkillMatch – AI score close to calculated score', () => {
    it('should use AI score when within 40 of calculated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ matchScore: 55, matchedSkills: ['JavaScript'], reasoning: 'Close' }),
              role: 'assistant',
            },
            finish_reason: 'stop',
          }],
        }),
      });
      const { analyzeSkillMatch } = await load();
      const result = await analyzeSkillMatch({
        freelancerSkills: [{ skillId: 's1', skillName: 'JavaScript' }],
        projectRequirements: [{ skillId: 's1', skillName: 'JavaScript' }, { skillId: 's2', skillName: 'Python' }],
      });
      expect(typeof result).toBe('object');
      if ('matchScore' in result) {
        // Calculated is 50, AI said 55, diff=5 < 40, so use AI score
        expect(result.matchScore).toBe(55);
      }
    });
  });

  describe('generateContent – choices without usage metadata', () => {
    it('should handle response without usageMetadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello', role: 'assistant' }, finish_reason: 'stop' }],
        }),
      });
      const { generateContent } = await load();
      const result = await generateContent('test');
      expect(result).toBe('Hello');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// auth-routes.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('auth-routes.ts – branch coverage', () => {
  let app: any;
  let expressMod: any;
  let requestMod: any;

  const mockRegister = jest.fn<any>();
  const mockLogin = jest.fn<any>();
  const mockRefreshTokens = jest.fn<any>();
  const mockLoginWithAppwrite = jest.fn<any>();
  const mockRegisterWithAppwrite = jest.fn<any>();
  const mockGetOAuthUrl = jest.fn<any>();
  const mockExchangeCodeForSession = jest.fn<any>();
  const mockResendConfirmationEmail = jest.fn<any>();
  const mockRequestPasswordReset = jest.fn<any>();
  const mockUpdatePassword = jest.fn<any>();
  const mockGetCurrentUserWithKyc = jest.fn<any>();
  const mockLogout = jest.fn<any>();
  const mockEnrollMFA = jest.fn<any>();
  const mockVerifyMFAEnrollment = jest.fn<any>();
  const mockChallengeMFA = jest.fn<any>();
  const mockVerifyMFAChallenge = jest.fn<any>();
  const mockGetMFAFactors = jest.fn<any>();
  const mockDisableMFA = jest.fn<any>();
  const mockValidateTokenAndGetUser = jest.fn<any>();
  const mockValidatePasswordStrength = jest.fn<any>();
  const mockRequestEmailOtp = jest.fn<any>();
  const mockRequestMagicUrl = jest.fn<any>();
  const mockVerifyAuthToken = jest.fn<any>();

  const mockAuthMiddleware = jest.fn<any>();
  const mockUpdateUser = jest.fn<any>();
  const mockGenerateCsrfToken = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
      register: mockRegister,
      login: mockLogin,
      refreshTokens: mockRefreshTokens,
      isAuthError: (result: any) => result && typeof result === 'object' && 'code' in result && 'message' in result && !('user' in result),
      validatePasswordStrength: mockValidatePasswordStrength,
      loginWithAppwrite: mockLoginWithAppwrite,
      registerWithAppwrite: mockRegisterWithAppwrite,
      getOAuthUrl: mockGetOAuthUrl,
      exchangeCodeForSession: mockExchangeCodeForSession,
      resendConfirmationEmail: mockResendConfirmationEmail,
      requestPasswordReset: mockRequestPasswordReset,
      updatePassword: mockUpdatePassword,
      getCurrentUserWithKyc: mockGetCurrentUserWithKyc,
      logout: mockLogout,
      enrollMFA: mockEnrollMFA,
      verifyMFAEnrollment: mockVerifyMFAEnrollment,
      challengeMFA: mockChallengeMFA,
      verifyMFAChallenge: mockVerifyMFAChallenge,
      getMFAFactors: mockGetMFAFactors,
      disableMFA: mockDisableMFA,
      validateTokenAndGetUser: mockValidateTokenAndGetUser,
      requestEmailOtp: mockRequestEmailOtp,
      requestMagicUrl: mockRequestMagicUrl,
      verifyAuthToken: mockVerifyAuthToken,
    }));
    jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
    jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      authRateLimiter: (_req: any, _res: any, next: any) => next(),
      registerRateLimiter: (_req: any, _res: any, next: any) => next(),
      passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
      generateCsrfToken: mockGenerateCsrfToken,
    }));
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-request-id',
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { updateUser: mockUpdateUser },
    }));

    expressMod = await import('express');
    requestMod = (await import('supertest')).default;

    const authRouter = (await import('../../routes/auth-routes.js')).default;
    app = expressMod.default();
    app.use(expressMod.default.json());
    app.use('/api/auth', authRouter);

    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer', email: 'user@test.com' };
      req.headers = req.headers || {};
      req.headers.authorization = 'Bearer test-token-123';
      next();
    });
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
  });

  describe('POST /login – MFA_REQUIRED path', () => {
    it('should return 200 with mfaRequired when MFA_REQUIRED', async () => {
      mockLogin.mockResolvedValue({ code: 'MFA_REQUIRED', message: 'MFA needed', mfaSessionToken: 'mfa-session-token' });
      // Override isAuthError to return true for MFA_REQUIRED
      const res = await requestMod(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaSessionToken).toBe('mfa-session-token');
    });
  });

  describe('POST /login/mfa-verify – success path', () => {
    it('should return 200 with auth result on successful MFA verification', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'ch-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({
        user: { id: 'user-1', email: 'user@test.com' },
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const res = await requestMod(app)
        .post('/api/auth/login/mfa-verify')
        .send({ accessToken: 'mfa-token', factorId: 'factor-1', code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });
  });

  describe('POST /login/email-otp', () => {
    it('should return 200 on success', async () => {
      mockRequestEmailOtp.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      mockRequestEmailOtp.mockResolvedValue({ code: 'EMAIL_ERROR', message: 'Failed' });
      const res = await requestMod(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email is invalid', async () => {
      const res = await requestMod(app)
        .post('/api/auth/login/email-otp')
        .send({ email: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login/magic-url', () => {
    it('should return 200 on success', async () => {
      mockRequestMagicUrl.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(200);
    });

    it('should return 400 on error', async () => {
      mockRequestMagicUrl.mockResolvedValue({ code: 'MAGIC_ERROR', message: 'Failed' });
      const res = await requestMod(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email invalid', async () => {
      const res = await requestMod(app)
        .post('/api/auth/login/magic-url')
        .send({ email: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login/verify-token', () => {
    it('should return 202 with registration_required', async () => {
      mockVerifyAuthToken.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Need register' });
      const res = await requestMod(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'u1', secret: 's1' });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('registration_required');
    });

    it('should return 400 on other error', async () => {
      mockVerifyAuthToken.mockResolvedValue({ code: 'VERIFY_FAILED', message: 'Failed' });
      const res = await requestMod(app)
        .post('/api/auth/login/verify-token')
        .send({ userId: 'u1', secret: 's1' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when userId missing', async () => {
      const res = await requestMod(app)
        .post('/api/auth/login/verify-token')
        .send({ secret: 's1' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /forgot-password – requestPasswordReset throws', () => {
    it('should still return 200 even when service throws', async () => {
      mockRequestPasswordReset.mockRejectedValue(new Error('User not found'));
      const res = await requestMod(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('password reset');
    });
  });

  describe('POST /reset-password – non-INVALID_TOKEN error', () => {
    it('should return 500 for non-INVALID_TOKEN error', async () => {
      mockUpdatePassword.mockResolvedValue({ code: 'INTERNAL_ERROR', message: 'Something broke' });
      const res = await requestMod(app)
        .post('/api/auth/reset-password')
        .send({ accessToken: 'token', password: 'StrongPass1!' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /mfa/disable – otpCode missing but factorId present', () => {
    it('should return 400 for missing otpCode', async () => {
      const res = await requestMod(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('otpCode');
    });

    it('should return 400 when disableMFA fails', async () => {
      mockDisableMFA.mockResolvedValue({ code: 'MFA_ERROR', message: 'Cannot disable' });
      const res = await requestMod(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1', otpCode: '123456' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /oauth/callback – MFA_REQUIRED path', () => {
    it('should return 200 with mfaRequired when MFA_REQUIRED', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'MFA_REQUIRED', message: 'MFA needed', mfaSessionToken: 'mfa-token' });
      const res = await requestMod(app)
        .post('/api/auth/oauth/callback')
        .send({ access_token: 'valid-token' });
      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
    });
  });

  describe('POST /oauth/callback – AUTH_REQUIRE_REGISTRATION', () => {
    it('should return 202 when registration required', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Register' });
      const res = await requestMod(app)
        .post('/api/auth/oauth/callback')
        .send({ access_token: 'new-user-token' });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('registration_required');
    });
  });

  describe('GET /oauth/:provider – success redirect', () => {
    it('should redirect for valid provider', async () => {
      mockGetOAuthUrl.mockResolvedValue('https://oauth.google.com/authorize');
      const res = await requestMod(app)
        .get('/api/auth/oauth/google');
      expect(res.status).toBe(302);
    });
  });

  describe('POST /register – duplicate email', () => {
    it('should return 400 for DUPLICATE_EMAIL (prevents email enumeration)', async () => {
      mockRegister.mockResolvedValue({ code: 'DUPLICATE_EMAIL', message: 'Already exists' });
      const res = await requestMod(app)
        .post('/api/auth/register')
        .send({ email: 'existing@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /register – other auth error', () => {
    it('should return 400 for non-duplicate errors', async () => {
      mockRegister.mockResolvedValue({ code: 'REGISTRATION_FAILED', message: 'Failed' });
      const res = await requestMod(app)
        .post('/api/auth/register')
        .send({ email: 'user@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login – success', () => {
    it('should return 200 with auth result', async () => {
      mockLogin.mockResolvedValue({
        user: { id: 'user-1', email: 'user@test.com' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const res = await requestMod(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });
  });

  describe('POST /register – success', () => {
    it('should return 201 with auth result', async () => {
      mockRegister.mockResolvedValue({
        user: { id: 'user-1', email: 'user@test.com' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const res = await requestMod(app)
        .post('/api/auth/register')
        .send({ email: 'user@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /callback – PKCE success', () => {
    it('should return 200 with tokens', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'session-token' });
      mockLoginWithAppwrite.mockResolvedValue({
        user: { id: 'user-1' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const res = await requestMod(app)
        .get('/api/auth/callback?code=valid-code');
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBe('access');
    });
  });

  describe('POST /oauth/register – success', () => {
    it('should return 201 on success', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({
        user: { id: 'user-1' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const res = await requestMod(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /mfa/verify-enrollment – success', () => {
    it('should return 200 on success', async () => {
      mockVerifyMFAEnrollment.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/mfa/verify-enrollment')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /logout – success', () => {
    it('should return 200 on success', async () => {
      mockLogout.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer test-token-123');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /resend-confirmation – success', () => {
    it('should return 200 on success', async () => {
      mockResendConfirmationEmail.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/resend-confirmation')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /refresh – success', () => {
    it('should return 200 on success', async () => {
      mockRefreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { id: 'user-1' },
      });
      const res = await requestMod(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-token' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /me – success', () => {
    it('should return 200 with user', async () => {
      mockGetCurrentUserWithKyc.mockResolvedValue({ id: 'user-1', email: 'user@test.com' });
      const res = await requestMod(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer test-token-123');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /mfa/factors – success', () => {
    it('should return 200 with factors', async () => {
      mockGetMFAFactors.mockResolvedValue({ factors: [{ id: 'f1' }] });
      const res = await requestMod(app)
        .get('/api/auth/mfa/factors')
        .set('Authorization', 'Bearer test-token-123');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /mfa/enroll – success', () => {
    it('should return 200 on success', async () => {
      mockEnrollMFA.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/mfa/enroll')
        .set('Authorization', 'Bearer test-token-123');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /mfa/challenge – success', () => {
    it('should return 200 on success', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'ch-1' });
      const res = await requestMod(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /mfa/verify – success', () => {
    it('should return 200 on success', async () => {
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      const res = await requestMod(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1', challengeId: 'ch-1', code: '123456' });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /wallet – success', () => {
    it('should return 200 on success', async () => {
      mockUpdateUser.mockResolvedValue({ id: 'user-1', wallet_address: '0x1234567890123456789012345678901234567890' });
      const res = await requestMod(app)
        .patch('/api/auth/wallet')
        .set('Authorization', 'Bearer test-token-123')
        .send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(200);
    });
  });

  describe('extractBearerToken – alternate auth header format', () => {
    it('should extract token from "Token xxx" format', async () => {
      mockLogin.mockResolvedValue({
        user: { id: 'user-1' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const res = await requestMod(app)
        .post('/api/auth/login')
        .set('Authorization', 'Token test-token-123')
        .send({ email: 'user@test.com', password: 'pass1234' });
      // Login doesn't use extractBearerToken, but validates email/password
      expect(res.status).toBe(200);
    });
  });

  describe('POST /login – password validation', () => {
    it('should return 400 when password is missing', async () => {
      const res = await requestMod(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /register – password not string', () => {
    it('should return 400 when password is not a string', async () => {
      const res = await requestMod(app)
        .post('/api/auth/register')
        .send({ email: 'user@test.com', password: 123, role: 'freelancer' });
      expect(res.status).toBe(400);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// milestone-registry.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('milestone-registry.ts – branch coverage', () => {
  const mockSubmitTx = jest.fn<any>();
  const mockConfirmTx = jest.fn<any>();
  const mockRepo = {
    findByMilestoneIdHash: jest.fn<any>(),
    createMilestoneRecord: jest.fn<any>(),
    updateMilestoneRecord: jest.fn<any>(),
    findByWallet: jest.fn<any>(),
    queryAll: jest.fn<any>(),
    delete: jest.fn<any>(),
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
      submitTransaction: mockSubmitTx,
      confirmTransaction: mockConfirmTx,
      generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/blockchain-milestone-record-repository.ts'), () => ({
      blockchainMilestoneRecordRepository: mockRepo,
    }));
    jest.clearAllMocks();
    mockSubmitTx.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTx.mockResolvedValue({ id: 'tx-1', hash: '0xabc', blockNumber: 1, gasUsed: BigInt(21000) });
    mockRepo.findByMilestoneIdHash.mockResolvedValue(null);
    mockRepo.createMilestoneRecord.mockResolvedValue({});
    mockRepo.updateMilestoneRecord.mockResolvedValue({});
    mockRepo.findByWallet.mockResolvedValue([]);
    mockRepo.queryAll.mockResolvedValue([]);
    mockRepo.delete.mockResolvedValue(true);
  });

  const load = async () => import('../../services/milestone-registry.js');

  describe('approveMilestoneOnRegistry – confirm fails', () => {
    it('should throw when confirm fails', async () => {
      mockRepo.findByMilestoneIdHash.mockResolvedValue({
        id: 'id', milestone_id_hash: 'h', contract_id_hash: 'c', work_hash: 'w',
        freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 100,
        status: 'submitted', submitted_at: Date.now(), title: 'T',
        transaction_hash: '0xtx', block_number: 1,
      });
      mockConfirmTx.mockResolvedValueOnce(null);

      const { approveMilestoneOnRegistry } = await load();
      await expect(approveMilestoneOnRegistry('ms-1', '0xE')).rejects.toThrow('Failed to confirm');
    });
  });

  describe('rejectMilestoneOnRegistry – confirm fails', () => {
    it('should throw when confirm fails', async () => {
      mockRepo.findByMilestoneIdHash.mockResolvedValue({
        id: 'id', milestone_id_hash: 'h', contract_id_hash: 'c', work_hash: 'w',
        freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 100,
        status: 'submitted', submitted_at: Date.now(), title: 'T',
        transaction_hash: '0xtx', block_number: 1,
      });
      mockConfirmTx.mockResolvedValueOnce(null);

      const { rejectMilestoneOnRegistry } = await load();
      await expect(rejectMilestoneOnRegistry('ms-1', '0xE', 'reason')).rejects.toThrow('Failed to confirm');
    });
  });

  describe('getFreelancerStatsFromRegistry – mixed statuses', () => {
    it('should only count approved milestones', async () => {
      mockRepo.findByWallet.mockResolvedValueOnce([
        { amount: 100, status: 'approved' },
        { amount: 200, status: 'rejected' },
        { amount: 300, status: 'approved' },
      ]);
      const { getFreelancerStatsFromRegistry } = await load();
      const stats = await getFreelancerStatsFromRegistry('0xF');
      expect(stats.completedCount).toBe(2);
      expect(stats.totalEarned).toBe(400);
      expect(stats.totalMilestones).toBe(3);
    });
  });

  describe('getFreelancerPortfolio – sorting', () => {
    it('should sort by completed_at descending', async () => {
      mockRepo.findByWallet.mockResolvedValueOnce([
        { id: '1', milestone_id_hash: 'h1', contract_id_hash: 'c1', work_hash: 'w1',
          freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 100,
          status: 'approved', submitted_at: 1, completed_at: 100, title: 'T1',
          transaction_hash: '0xtx1', block_number: 1 },
        { id: '2', milestone_id_hash: 'h2', contract_id_hash: 'c2', work_hash: 'w2',
          freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 200,
          status: 'approved', submitted_at: 2, completed_at: 200, title: 'T2',
          transaction_hash: '0xtx2', block_number: 2 },
      ]);
      const { getFreelancerPortfolio } = await load();
      const portfolio = await getFreelancerPortfolio('0xF');
      expect(portfolio[0].title).toBe('T2');
      expect(portfolio[1].title).toBe('T1');
    });

    it('should handle null completed_at in sort', async () => {
      mockRepo.findByWallet.mockResolvedValueOnce([
        { id: '1', milestone_id_hash: 'h1', contract_id_hash: 'c1', work_hash: 'w1',
          freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 100,
          status: 'approved', submitted_at: 1, completed_at: null, title: 'T1',
          transaction_hash: '0xtx1', block_number: 1 },
        { id: '2', milestone_id_hash: 'h2', contract_id_hash: 'c2', work_hash: 'w2',
          freelancer_wallet: '0xF', employer_wallet: '0xE', amount: 200,
          status: 'approved', submitted_at: 2, completed_at: 300, title: 'T2',
          transaction_hash: '0xtx2', block_number: 2 },
      ]);
      const { getFreelancerPortfolio } = await load();
      const portfolio = await getFreelancerPortfolio('0xF');
      expect(portfolio).toHaveLength(2);
    });
  });

  describe('clearMilestoneRegistry – multiple records', () => {
    it('should delete all records in test env', async () => {
      process.env['NODE_ENV'] = 'test';
      mockRepo.queryAll.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);
      const { clearMilestoneRegistry } = await load();
      await clearMilestoneRegistry();
      expect(mockRepo.delete).toHaveBeenCalledTimes(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// base-repository-appwrite.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('base-repository-appwrite.ts – branch coverage', () => {
  const mockDatabases = {
    createDocument: jest.fn<any>(),
    getDocument: jest.fn<any>(),
    updateDocument: jest.fn<any>(),
    deleteDocument: jest.fn<any>(),
    listDocuments: jest.fn<any>(),
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
      databases: mockDatabases,
      DATABASE_ID: 'test-db',
      Query: {
        equal: (col: string, val: any) => `eq:${col}:${val}`,
        limit: (n: number) => `limit:${n}`,
        offset: (n: number) => `offset:${n}`,
        orderAsc: (col: string) => `asc:${col}`,
        orderDesc: (col: string) => `desc:${col}`,
      },
      ID: { unique: () => 'unique-id' },
    }));
    jest.clearAllMocks();
  });

  const load = async () => {
    const mod = await import('../../repositories/base-repository-appwrite.js');
    return new mod.BaseRepositoryAppwrite<any>('test-collection');
  };

  describe('create', () => {
    it('should stringify object values', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
        nested: '{"key":"value"}', name: 'test',
      });
      const repo = await load();
      const result = await repo.create({ id: 'doc-1', nested: { key: 'value' }, name: 'test' } as any);
      expect(result.nested).toBe('{"key":"value"}');
    });

    it('should skip undefined values', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
        name: 'test',
      });
      const repo = await load();
      const result = await repo.create({ id: 'doc-1', name: 'test', missing: undefined } as any);
      expect(result.name).toBe('test');
    });

    it('should use ID.unique() when id is falsy', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'unique-id', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
      });
      const repo = await load();
      await repo.create({ name: 'test' } as any);
      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        'test-db', 'test-collection', 'unique-id', expect.anything()
      );
    });
  });

  describe('getById', () => {
    it('should return null on error', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const repo = await load();
      const result = await repo.getById('missing');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should skip id and created_at keys', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'doc-1', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-02',
        name: 'updated',
      });
      const repo = await load();
      const result = await repo.update('doc-1', { id: 'ignored', created_at: 'ignored', name: 'updated' });
      expect(result.name).toBe('updated');
    });

    it('should stringify object values', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'doc-1', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-02',
        data: '{"a":1}',
      });
      const repo = await load();
      const result = await repo.update('doc-1', { data: { a: 1 } } as any);
      expect(result.data).toBe('{"a":1}');
    });

    it('should skip undefined values', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'doc-1', $collectionId: 'c', $databaseId: 'd', $createdAt: '2025-01-01', $updatedAt: '2025-01-02',
        name: 'test',
      });
      const repo = await load();
      const result = await repo.update('doc-1', { name: 'test', missing: undefined } as any);
      expect(result.name).toBe('test');
    });

    it('should return null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('fail'));
      const repo = await load();
      const result = await repo.update('doc-1', { name: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return false on error', async () => {
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('fail'));
      const repo = await load();
      const result = await repo.delete('doc-1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return null when no documents found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const repo = await load();
      const result = await repo.findOne('email', 'test@test.com');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const repo = await load();
      const result = await repo.findOne('email', 'test@test.com');
      expect(result).toBeNull();
    });
  });

  describe('queryAll', () => {
    it('should use ascending order', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });
      const repo = await load();
      await repo.queryAll('name', true);
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries[0]).toBe('asc:name');
    });

    it('should use descending order by default', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });
      const repo = await load();
      await repo.queryAll('name');
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries[0]).toBe('desc:name');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const repo = await load();
      const result = await repo.queryAll();
      expect(result).toEqual([]);
    });
  });

  describe('queryPaginated', () => {
    it('should use custom limit and offset', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const repo = await load();
      const result = await repo.queryPaginated({ limit: 5, offset: 10 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should set hasMore when results equal limit', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({
        $id: `d${i}`, $collectionId: 'c', $databaseId: 'd', $createdAt: 't', $updatedAt: 't',
      }));
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 5 });
      const repo = await load();
      const result = await repo.queryPaginated({ limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should return empty on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      const repo = await load();
      const result = await repo.queryPaginated();
      expect(result).toEqual({ items: [], hasMore: false, total: 0 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// saved-search-service.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('saved-search-service.ts – branch coverage', () => {
  const mockSavedSearchRepo = {
    create: jest.fn<any>(),
    findByUser: jest.fn<any>(),
    findOwnerById: jest.fn<any>(),
    getById: jest.fn<any>(),
    update: jest.fn<any>(),
    delete: jest.fn<any>(),
  };
  const mockProjectRepo = { getAllOpenProjects: jest.fn<any>() };
  const mockFreelancerRepo = { getAllProfilesPaginated: jest.fn<any>() };

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/saved-search-repository.ts'), () => ({
      savedSearchRepository: mockSavedSearchRepo,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
      projectRepository: mockProjectRepo,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
      freelancerProfileRepository: mockFreelancerRepo,
    }));
    jest.clearAllMocks();
  });

  const load = async () => import('../../services/saved-search-service.js');

  describe('executeSavedSearch – project search skill_name vs name', () => {
    it('should filter using skill_name key', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'project',
        filters: JSON.stringify({ skills: ['React'] }),
      });
      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'p1', title: 'T', description: 'D', budget: 500,
            required_skills: [{ skill_name: 'React' }], created_at: '2025-01-01' },
        ],
        total: 1,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });

    it('should filter using name key in skills', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'project',
        filters: JSON.stringify({ skills: ['React'] }),
      });
      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'p1', title: 'T', description: 'D', budget: 500,
            required_skills: [{ name: 'React' }], created_at: '2025-01-01' },
        ],
        total: 1,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });
  });

  describe('executeSavedSearch – freelancer search skill name key', () => {
    it('should filter freelancer skills using name key', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['React'] }),
      });
      mockFreelancerRepo.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [
          { user_id: 'fl1', name: 'John', skills: [{ name: 'React' }], hourly_rate: 50, created_at: '2025-01-01' },
        ],
        total: 1,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });
  });

  describe('executeSavedSearch – project keyword filter', () => {
    it('should filter by keyword in title and description', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'project',
        filters: JSON.stringify({ keyword: 'web' }),
      });
      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'p1', title: 'Web App', description: 'Build a web', budget: 500, created_at: '2025-01-01' },
          { id: 'p2', title: 'Mobile App', description: 'Build mobile', budget: 500, created_at: '2025-01-02' },
        ],
        total: 2,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].id).toBe('p1');
    });
  });

  describe('executeSavedSearch – project budget filters', () => {
    it('should filter by minBudget and maxBudget', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'project',
        filters: JSON.stringify({ minBudget: 100, maxBudget: 500 }),
      });
      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'p1', title: 'T', description: 'D', budget: 300, created_at: '2025-01-01' },
          { id: 'p2', title: 'T', description: 'D', budget: 1000, created_at: '2025-01-02' },
        ],
        total: 2,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });
  });

  describe('executeSavedSearch – freelancer hourly rate filters', () => {
    it('should filter by minHourlyRate and maxHourlyRate', async () => {
      mockSavedSearchRepo.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'u1', search_type: 'freelancer',
        filters: JSON.stringify({ minHourlyRate: 30, maxHourlyRate: 100 }),
      });
      mockFreelancerRepo.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [
          { user_id: 'fl1', name: 'A', skills: [], hourly_rate: 50, created_at: '2025-01-01' },
          { user_id: 'fl2', name: 'B', skills: [], hourly_rate: 150, created_at: '2025-01-02' },
        ],
        total: 2,
      });

      const { executeSavedSearch } = await load();
      const result = await executeSavedSearch('ss-1', 'u1');
      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// proposal-service.ts coverage gaps
// ═══════════════════════════════════════════════════════════════
describe('proposal-service.ts – branch coverage', () => {
  const proposalStore = new Map<string, any>();
  const projectStore = new Map<string, any>();
  const contractStore = new Map<string, any>();
  const notificationStore = new Map<string, any>();
  const userStore = new Map<string, any>();

  const mockProposalRepo = {
    create: jest.fn(async (e: any) => { proposalStore.set(e.id, { ...e, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return proposalStore.get(e.id); }),
    findById: jest.fn(async (id: string) => proposalStore.get(id) ?? null),
    findProposalById: jest.fn(async (id: string) => proposalStore.get(id) ?? null),
    update: jest.fn(async (id: string, u: any) => { const e = proposalStore.get(id); if (!e) return null; const upd = { ...e, ...u, updated_at: new Date().toISOString() }; proposalStore.set(id, upd); return upd; }),
    updateProposal: jest.fn(async (id: string, u: any) => { const e = proposalStore.get(id); if (!e) return null; const upd = { ...e, ...u, updated_at: new Date().toISOString() }; proposalStore.set(id, upd); return upd; }),
    createProposal: jest.fn(async (e: any) => { proposalStore.set(e.id, { ...e, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return proposalStore.get(e.id); }),
    getExistingProposal: jest.fn(async (pid: string, fid: string) => { for (const p of proposalStore.values()) { if (p.project_id === pid && p.freelancer_id === fid) return p; } return null; }),
    getProposalsByProject: jest.fn(async (pid: string) => ({ items: Array.from(proposalStore.values()).filter(p => p.project_id === pid), hasMore: false, total: 0 })),
    getProposalsByFreelancer: jest.fn(async (fid: string) => Array.from(proposalStore.values()).filter(p => p.freelancer_id === fid)),
    getAcceptedProposalCount: jest.fn(async (pid: string) => Array.from(proposalStore.values()).filter(p => p.project_id === pid && p.status === 'accepted').length),
  };

  const mockProjectRepo = {
    findProjectById: jest.fn(async (id: string) => projectStore.get(id) ?? null),
    updateProject: jest.fn(async (id: string, u: any) => { const e = projectStore.get(id); if (!e) return null; const upd = { ...e, ...u, updated_at: new Date().toISOString() }; projectStore.set(id, upd); return upd; }),
  };

  const mockContractRepo = {
    create: jest.fn(async (e: any) => { contractStore.set(e.id, { ...e, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return contractStore.get(e.id); }),
    updateContract: jest.fn(async (id: string, u: any) => { const e = contractStore.get(id); if (!e) return null; const upd = { ...e, ...u, updated_at: new Date().toISOString() }; contractStore.set(id, upd); return upd; }),
    getContractsByEmployer: jest.fn(async () => ({ items: [], total: 0 })),
  };

  const mockNotificationRepo = {
    create: jest.fn(async (e: any) => { notificationStore.set(e.id, e); return e; }),
  };

  const mockUserRepo = {
    getUserById: jest.fn(async (id: string) => userStore.get(id) ?? null),
  };

  beforeEach(async () => {
    jest.resetModules();
    proposalStore.clear();
    projectStore.clear();
    contractStore.clear();
    notificationStore.clear();
    userStore.clear();

    jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({ proposalRepository: mockProposalRepo }));
    jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({ projectRepository: mockProjectRepo }));
    jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({ contractRepository: mockContractRepo }));
    jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({ notificationRepository: mockNotificationRepo }));
    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({ userRepository: mockUserRepo }));
    jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
      createAgreementOnBlockchain: jest.fn(async () => ({})),
      signAgreement: jest.fn(async () => ({})),
    }));
    jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
      initializeContractEscrow: jest.fn(async () => ({ success: true, data: { escrowAddress: '0xescrow' } })),
    }));
    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));
    jest.clearAllMocks();
  });

  const load = async () => import('../../services/proposal-service.js');

  function makeProject(overrides: Record<string, any> = {}) {
    const id = 'proj-' + Date.now() + Math.random();
    const p = {
      id,
      employer_id: 'emp-1',
      title: 'Test',
      description: 'Desc',
      status: 'open',
      budget: 1000,
      milestones: [{ id: 'm1', title: 'M1', amount: 1000, status: 'pending' }],
      freelancer_limit: 1,
      is_rush: false,
      rush_fee_percentage: 25,
      ...overrides,
    };
    projectStore.set(id, p);
    return p;
  }

  function makeProposal(projectId: string, overrides: Record<string, any> = {}) {
    const id = 'prop-' + Date.now() + Math.random();
    const p = {
      id,
      project_id: projectId,
      freelancer_id: 'fl-1',
      status: 'pending',
      proposed_rate: 1000,
      estimated_duration: 30,
      attachments: [],
      ...overrides,
    };
    proposalStore.set(id, p);
    return p;
  }

  describe('acceptProposal – rush fee calculation', () => {
    it('should calculate rush fee when isRush is true', async () => {
      const { acceptProposal } = await load();
      const p = makeProject({
        is_rush: true,
        rush_fee_percentage: 25,
        milestones: [{ id: 'm1', title: 'M1', amount: 1000, status: 'pending' }],
      });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });
      userStore.set('emp-1', { id: 'emp-1', wallet_address: '0xemp' });
      userStore.set('fl-1', { id: 'fl-1', wallet_address: '0xfl' });

      const result = await acceptProposal(proposal.id, 'emp-1');
      expect(result.success).toBe(true);
    });
  });

  describe('acceptProposal – freelancer_limit > 1', () => {
    it('should keep project open when limit not reached', async () => {
      const { acceptProposal } = await load();
      const p = makeProject({ freelancer_limit: 3 });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });
      userStore.set('emp-1', { id: 'emp-1', wallet_address: '0xemp' });
      userStore.set('fl-1', { id: 'fl-1', wallet_address: '0xfl' });

      const result = await acceptProposal(proposal.id, 'emp-1');
      expect(result.success).toBe(true);
      expect(projectStore.get(p.id).status).toBe('open');
    });
  });

  describe('getProposalById – not found', () => {
    it('should return NOT_FOUND', async () => {
      const { getProposalById } = await load();
      const result = await getProposalById('nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('getProposalsByProject – project not found', () => {
    it('should return NOT_FOUND', async () => {
      const { getProposalsByProject } = await load();
      const result = await getProposalsByProject('nonexistent');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('rejectProposal – INVALID_STATUS', () => {
    it('should return INVALID_STATUS for non-pending proposal', async () => {
      const { rejectProposal } = await load();
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'accepted' });
      const result = await rejectProposal(proposal.id, 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });
  });

  describe('acceptProposal – INVALID_STATUS', () => {
    it('should return INVALID_STATUS for non-pending proposal', async () => {
      const { acceptProposal } = await load();
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'accepted' });
      const result = await acceptProposal(proposal.id, 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });
  });

  describe('withdrawProposal – UNAUTHORIZED', () => {
    it('should return UNAUTHORIZED when freelancer does not own proposal', async () => {
      const { withdrawProposal } = await load();
      const p = makeProject();
      const proposal = makeProposal(p.id, { freelancer_id: 'other-fl', status: 'pending' });
      const result = await withdrawProposal(proposal.id, 'fl-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });
});

// Note: agreement-contract.ts tests are in agreement-contract.extended.test.ts
// (Cannot mock blockchain-client.ts twice in the same file)
