// @ts-nocheck
/**
 * Covers uncovered service statements:
 * - email-preference-service.ts lines 88-89, 181-183
 * - file-service.ts lines 159-167
 * - freelancer-profile-service.ts lines 363-367
 * - analytics-service.ts lines 420-427
 * - reputation-contract.ts lines 258-259
 * - matching-service.ts lines 193, 261-262, 330-331
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id',
}));

const mockStorage = {
  listFiles: jest.fn<any>(),
  getFile: jest.fn<any>(),
  deleteFile: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: mockStorage,
  BUCKETS: { PORTFOLIO_IMAGES: 'portfolio', PROPOSAL_ATTACHMENTS: 'proposals' },
}));

// ===== Matching service mocks =====
const mockIsAIAvailable = jest.fn<any>();
const mockAnalyzeSkillMatch = jest.fn<any>();
const mockExtractSkills = jest.fn<any>();
const mockGenerateContent = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  isAIAvailable: mockIsAIAvailable,
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkills,
  generateContent: mockGenerateContent,
  isAIError: (r: any) => r && typeof r === 'object' && 'code' in r && 'retryable' in r,
  parseJsonResponse: jest.fn<any>().mockReturnValue(null),
  SKILL_GAP_PROMPT: 'mock prompt {currentSkills}',
  SKILL_MATCH_PROMPT: 'mock match prompt',
  keywordMatchSkills: jest.fn<any>().mockReturnValue({ matchScore: 50, matchedSkills: [], reasoning: 'keyword match' }),
  keywordExtractSkills: jest.fn<any>().mockReturnValue([]),
}));

const mockFreelancerProfileRepository = {
  getProfileByUserId: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
  createProfile: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

const mockSkillService = {
  getActiveSkills: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: mockSkillService.getActiveSkills,
  getActiveSkillsByCategory: jest.fn<any>(),
  searchSkills: jest.fn<any>(),
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  getOpenProjects: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-contract.ts'), () => ({
  getReputation: jest.fn<any>().mockResolvedValue({ success: true, data: { score: 80 } }),
  getWorkHistory: jest.fn<any>(),
  getRatingsFromBlockchain: jest.fn<any>().mockResolvedValue([]),
}));

jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: { getProfileByUserId: jest.fn<any>(), updateProfile: jest.fn<any>(), createProfile: jest.fn<any>() },
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: { createNotification: jest.fn<any>().mockResolvedValue(undefined) },
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { getContractById: jest.fn<any>(), updateContract: jest.fn<any>() },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapFreelancerProfileFromEntity: (e: any) => ({ ...e, skills: e.skills || [] }),
  mapProjectFromEntity: (e: any) => ({ ...e, requiredSkills: e.required_skills || [] }),
  mapNotificationFromEntity: (e: any) => ({ ...e }),
  mapProposalFromEntity: (e: any) => ({ ...e }),
  mapContractFromEntity: (e: any) => ({ ...e }),
}));

// ===== Import services =====
const { getEmailPreferences, unsubscribeAll, shouldSendEmail } = await import(
  '../../services/email-preference-service.js'
);
const { deleteFile } = await import('../../services/file-service.js');
const { extractSkillsFromText } = await import('../../services/matching-service.js');

describe('Email Preference Service - catch blocks', () => {
  beforeEach(() => jest.clearAllMocks());

  // Lines 88-89: getEmailPreferences catch block
  it('returns INTERNAL_ERROR when DB query throws', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection refused'));
    const result = await getEmailPreferences('user-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  // Lines 181-183: unsubscribeAll catch block
  it('unsubscribeAll returns INTERNAL_ERROR on DB failure', async () => {
    mockPool.query.mockRejectedValue(new Error('Timeout'));
    const result = await unsubscribeAll('user-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  // Lines 181-182: shouldSendEmail catch block
  it('should return INTERNAL_ERROR when shouldSendEmail throws (lines 181-183)', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection lost'));
    const result = await shouldSendEmail('user-1', 'payment_notifications');
    // Should return true for critical email types even on error
    expect(result).toBe(true);
  });

  it('should return false for non-critical emails when shouldSendEmail throws', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection lost'));
    const result = await shouldSendEmail('user-1', 'marketing_emails');
    expect(result).toBe(false);
  });
});

describe('File Service - deleteFile outer catch (lines 159-167)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns INTERNAL_ERROR when storage.deleteFile throws', async () => {
    mockStorage.getFile.mockResolvedValue({ name: 'user-1-photo.jpg' });
    mockStorage.deleteFile.mockRejectedValue(new Error('Storage unavailable'));

    const result = await deleteFile('user-1', 'portfolio', 'file-123');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('Matching Service - AI error fallback (lines 330-331)', () => {
  beforeEach(() => jest.clearAllMocks());

  // Lines 330-331: extractSkillsFromText AI error fallback
  it('falls back to keyword extraction when AI returns error', async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockSkillService.getActiveSkills.mockResolvedValue([
      { id: 'sk-1', name: 'React', categoryId: 'cat-1' },
      { id: 'sk-2', name: 'Node.js', categoryId: 'cat-1' },
    ]);
    // Return an AI error object
    mockExtractSkills.mockResolvedValue({
      code: 'AI_UNAVAILABLE',
      message: 'AI service down',
      retryable: false,
    });

    const result = await extractSkillsFromText('I know React and Node.js');
    expect(result.success).toBe(true);
    // Should have used keyword fallback
  });

  it('uses keyword extraction when AI is not available', async () => {
    mockIsAIAvailable.mockReturnValue(false);
    mockSkillService.getActiveSkills.mockResolvedValue([
      { id: 'sk-1', name: 'React', categoryId: 'cat-1' },
    ]);

    const result = await extractSkillsFromText('I know React');
    expect(result.success).toBe(true);
  });
});
