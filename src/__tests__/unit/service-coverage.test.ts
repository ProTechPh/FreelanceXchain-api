// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

// Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

// Config/Env (for file-service)
const mockConfig = {
  appwrite: {
    endpoint: 'https://mock.appwrite.io/v1',
    projectId: 'mock-project',
  },
};
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: mockConfig,
}));

// Cache
const mockSkillCache = { get: jest.fn(), set: jest.fn() };
const mockPlatformMetricsCache = { get: jest.fn(), set: jest.fn() };
const mockSkillTrendsCache = { get: jest.fn(), set: jest.fn() };
jest.unstable_mockModule(resolveModule('src/utils/cache.ts'), () => ({
  skillCache: mockSkillCache,
  platformMetricsCache: mockPlatformMetricsCache,
  skillTrendsCache: mockSkillTrendsCache,
  LRUCache: jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn() })),
}));

// Notification repository
const mockNotificationRepo = {
  createNotification: jest.fn(),
  getNotificationById: jest.fn(),
  getNotificationsByUser: jest.fn(),
  getAllNotificationsByUser: jest.fn(),
  getUnreadNotificationsByUser: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
  deleteReadBefore: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

// Notification delivery service
const mockSendNotificationToUser = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
  notificationEmitter: { emitToUser: jest.fn() },
}));

// Milestone repository
const mockMilestoneRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  findByContract: jest.fn(),
  create: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepo,
}));

// Contract repository
const mockContractRepo = {
  getContractById: jest.fn(),
  updateContract: jest.fn(),
  findAllByFreelancer: jest.fn(),
  findAllByFreelancers: jest.fn(),
  countCompletedByFreelancer: jest.fn(),
  findActiveContracts: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

// Dispute repository
const mockDisputeRepo = {
  getDisputeById: jest.fn(),
  createDispute: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));

// Dispute evidence repository
const mockDisputeEvidenceRepo = {
  createEvidence: jest.fn(),
  findByDispute: jest.fn(),
  getEvidenceById: jest.fn(),
  updateEvidence: jest.fn(),
  deleteEvidence: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/dispute-evidence-repository.ts'), () => ({
  disputeEvidenceRepository: mockDisputeEvidenceRepo,
}));

// User repository
const mockUserRepo = {
  getUserById: jest.fn(),
  getUsersByIds: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

// Project repository
const mockProjectRepo = {
  findProjectById: jest.fn(),
  getAllOpenProjects: jest.fn(),
  searchProjects: jest.fn(),
  getProjectsBySkills: jest.fn(),
  getProjectsByBudgetRange: jest.fn(),
  listOpenProjects: jest.fn(),
  listAllProjects: jest.fn(),
  listRecentOpenProjects: jest.fn(),
  findByFilters: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

// Freelancer profile repository
const mockFreelancerProfileRepo = {
  getProfileByUserId: jest.fn(),
  getAvailableProfiles: jest.fn(),
  getById: jest.fn(),
  findByFilters: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepo,
}));

// AI client
const mockIsAIAvailable = jest.fn();
const mockAnalyzeSkillMatch = jest.fn();
const mockKeywordMatchSkills = jest.fn();
const mockParseJsonResponse = jest.fn();
const mockIsAIError = jest.fn();
const mockGenerateContent = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  isAIAvailable: mockIsAIAvailable,
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  keywordMatchSkills: mockKeywordMatchSkills,
  keywordExtractSkills: jest.fn().mockReturnValue([]),
  extractSkills: jest.fn().mockReturnValue([]),
  parseJsonResponse: mockParseJsonResponse,
  isAIError: mockIsAIError,
  generateContent: mockGenerateContent,
  SKILL_GAP_PROMPT: 'Test prompt {currentSkills}',
}));

// Reputation service
const mockGetReputation = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: mockGetReputation,
}));

// Skill repository
const mockSkillRepo = {
  findSkillById: jest.fn(),
  createSkill: jest.fn(),
  updateSkill: jest.fn(),
  getAllSkills: jest.fn(),
  getActiveSkills: jest.fn(),
  getSkillsByCategory: jest.fn(),
  getActiveSkillsByCategory: jest.fn(),
  searchSkillsByKeyword: jest.fn(),
  getSkillByNameInCategory: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepo,
  SkillEntity: jest.fn(),
}));

// Skill category repository
const mockSkillCategoryRepo = {
  getCategoryById: jest.fn(),
  getCategoryByName: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  getAllCategories: jest.fn(),
  getActiveCategories: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/skill-category-repository.ts'), () => ({
  skillCategoryRepository: mockSkillCategoryRepo,
  SkillCategoryEntity: jest.fn(),
}));

// Employer profile repository
const mockEmployerProfileRepo = {
  getProfileByUserId: jest.fn(),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
  getById: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepo,
}));

// Didit KYC service
const mockGetProfileDataFromKyc = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

// Message repository
const mockMessageRepo = {
  findConversation: jest.fn(),
  createConversation: jest.fn(),
  createMessage: jest.fn(),
  updateConversation: jest.fn(),
  getUserConversations: jest.fn(),
  getConversationMessages: jest.fn(),
  markMessagesAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
  getUnreadMessageCountForUser: jest.fn(),
  getUnreadMessageCountsForUsers: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/message-repository.ts'), () => ({
  messageRepository: mockMessageRepo,
}));

// User custom skill repository
const mockUserCustomSkillRepo = {
  getUserCustomSkills: jest.fn(),
  getUserCustomSkillById: jest.fn(),
  createUserCustomSkill: jest.fn(),
  updateUserCustomSkill: jest.fn(),
  deleteUserCustomSkill: jest.fn(),
  searchUserCustomSkills: jest.fn(),
};
const mockSkillSuggestionRepo = {
  getSkillSuggestionByName: jest.fn(),
  incrementSkillSuggestionCount: jest.fn(),
  createSkillSuggestion: jest.fn(),
  getPendingSkillSuggestions: jest.fn(),
  updateSkillSuggestionStatus: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-custom-skill-repository.ts'), () => ({
  userCustomSkillRepository: mockUserCustomSkillRepo,
  skillSuggestionRepository: mockSkillSuggestionRepo,
}));

// Node-cron (for scheduler-service)
const mockCronSchedule = jest.fn();
const mockCronGetTasks = jest.fn(() => new Map());
jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
    getTasks: mockCronGetTasks,
  },
}));

// Email delivery service (for scheduler-service)
const mockSendWeeklyDigestEmail = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendWeeklyDigestEmail: mockSendWeeklyDigestEmail,
}));

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

const mockDatabases = (globalThis as any).__mockDatabases;
const mockAppwriteStorage = (globalThis as any).mockAppwriteStorage;

function resetAllMocks() {
  jest.clearAllMocks();
  // Reset __mockDatabases to clean state
  mockDatabases.listDocuments.mockReset().mockResolvedValue({ documents: [], total: 0 });
  mockDatabases.getDocument.mockReset().mockResolvedValue({ $id: 'doc-id' });
  mockDatabases.createDocument.mockReset().mockResolvedValue({ $id: 'doc-id' });
  mockDatabases.updateDocument.mockReset().mockResolvedValue({ $id: 'doc-id' });
  mockDatabases.deleteDocument.mockReset().mockResolvedValue({});
  // Reset storage mocks
  mockAppwriteStorage.listFiles.mockReset().mockResolvedValue({ files: [], total: 0 });
  mockAppwriteStorage.getFile.mockReset().mockResolvedValue({ $id: 'file-id', name: 'test.txt' });
  mockAppwriteStorage.deleteFile.mockReset().mockResolvedValue({});
  // Reset cache mocks to return undefined (cache miss by default)
  mockSkillCache.get.mockReset().mockReturnValue(undefined);
  mockSkillCache.set.mockReset();
  mockPlatformMetricsCache.get.mockReset().mockReturnValue(undefined);
  mockPlatformMetricsCache.set.mockReset();
  mockSkillTrendsCache.get.mockReset().mockReturnValue(undefined);
  mockSkillTrendsCache.set.mockReset();
  // Reset default repo mocks
  mockNotificationRepo.createNotification.mockImplementation(async (entity: any) => ({
    ...entity,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  mockNotificationRepo.deleteReadBefore.mockReset().mockResolvedValue(0);
  mockUserRepo.getUserById.mockReset().mockResolvedValue(null);
  mockUserRepo.getUsersByIds.mockReset().mockResolvedValue(new Map());
  mockProjectRepo.listOpenProjects.mockReset().mockResolvedValue([]);
  mockProjectRepo.listAllProjects.mockReset().mockResolvedValue([]);
  mockProjectRepo.listRecentOpenProjects.mockReset().mockResolvedValue([]);
  mockProjectRepo.findByFilters.mockReset().mockResolvedValue([]);
  mockContractRepo.findAllByFreelancer.mockReset().mockResolvedValue([]);
  mockContractRepo.findAllByFreelancers.mockReset().mockResolvedValue(new Map());
  mockContractRepo.countCompletedByFreelancer.mockReset().mockResolvedValue(0);
  mockContractRepo.findActiveContracts.mockReset().mockResolvedValue([]);
  mockMessageRepo.getUnreadMessageCountForUser.mockReset().mockResolvedValue(0);
  mockMessageRepo.getUnreadMessageCountsForUsers.mockReset().mockResolvedValue(new Map());
  mockFreelancerProfileRepo.findByFilters.mockReset().mockResolvedValue([]);
  mockSendNotificationToUser.mockReset().mockReturnValue({ success: true });
  mockSendWeeklyDigestEmail.mockReset().mockResolvedValue(undefined);
}

const now = () => new Date().toISOString();

// ═══════════════════════════════════════════════════════════════
// TESTS: notification-service
// ═══════════════════════════════════════════════════════════════

describe('notification-service: getNotificationsByUser (lines 85-86)', () => {
  beforeEach(() => resetAllMocks());

  it('should return paginated notifications for a user', async () => {
    mockNotificationRepo.getNotificationsByUser.mockResolvedValueOnce({
      items: [
        { id: 'n1', user_id: 'user-1', type: 'message', title: 'Hello', message: 'World', data: {}, is_read: false, created_at: '2024-06-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' },
        { id: 'n2', user_id: 'user-1', type: 'alert', title: 'Alert', message: 'Test', data: {}, is_read: true, created_at: '2024-05-01T00:00:00.000Z', updated_at: '2024-05-01T00:00:00.000Z' },
      ],
      hasMore: true,
      total: 5,
    });

    const { getNotificationsByUser } = await import(resolveModule('src/services/notification-service.ts'));
    const result = await getNotificationsByUser('user-1', { limit: 2, offset: 0 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0].userId).toBe('user-1');
      expect(result.data.hasMore).toBe(true);
      expect(result.data.total).toBe(5);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: scheduler-service
// ═══════════════════════════════════════════════════════════════

describe('scheduler-service: per-user error in sendWeeklyDigests (line 158)', () => {
  beforeEach(() => resetAllMocks());

  it('should log error when sending weekly digest fails for a user', async () => {
    // listDocuments for EMAIL_PREFERENCES → returns one user
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'pref-1', user_id: 'user-1', weekly_digest: true }],
        total: 1,
      })
      .mockResolvedValue({ documents: [], total: 0 });

    // Batch user lookup returns the recipient
    mockUserRepo.getUsersByIds.mockResolvedValueOnce(
      new Map([['user-1', { id: 'user-1', email: 'user@test.com', full_name: 'Test User' }]])
    );

    // sendWeeklyDigestEmail throws
    mockSendWeeklyDigestEmail.mockRejectedValueOnce(new Error('Email service down'));

    const { initializeScheduler } = await import(resolveModule('src/services/scheduler-service.ts'));
    initializeScheduler();

    // The second cron.schedule call is the weekly digest callback
    const weeklyDigestCallback = mockCronSchedule.mock.calls[1][1];
    weeklyDigestCallback();

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to send weekly digest to user:',
      expect.any(Error),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: matching-service
// ═══════════════════════════════════════════════════════════════

describe('matching-service: keywordMatchSkills fallback (line 193)', () => {
  beforeEach(() => resetAllMocks());

  it('should fall back to keywordMatchSkills when AI returns error for freelancer recommendations', async () => {
    const projectId = 'proj-1';
    const freelancerSkills = [{ name: 'React', years_of_experience: 3 }];
    const projectSkills = [{ skill_id: 's1', skill_name: 'React', category_id: 'cat-1' }];

    mockProjectRepo.findProjectById.mockResolvedValueOnce({
      id: projectId,
      required_skills: projectSkills,
    });
    mockFreelancerProfileRepo.getAvailableProfiles.mockResolvedValueOnce([
      { user_id: 'fl-1', skills: freelancerSkills },
    ]);
    mockGetReputation.mockResolvedValueOnce({ success: true, data: { score: 80 } });

    // AI is available but returns an error
    mockIsAIAvailable.mockReturnValue(true);
    mockAnalyzeSkillMatch.mockResolvedValueOnce({ error: true, message: 'AI unavailable' });
    mockIsAIError.mockReturnValue(true);

    mockKeywordMatchSkills.mockReturnValue({
      matchScore: 100,
      matchedSkills: ['React'],
      missingSkills: [],
      reasoning: 'keyword match',
    });

    const { getFreelancerRecommendations } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await getFreelancerRecommendations(projectId);

    expect(result.success).toBe(true);
    expect(mockKeywordMatchSkills).toHaveBeenCalled();
    if (result.success) {
      expect(result.data[0].matchedSkills).toContain('React');
    }
  });
});

describe('matching-service: parseJsonResponse null guard (line 331)', () => {
  beforeEach(() => resetAllMocks());

  it('should return fallback analysis when parseJsonResponse returns null', async () => {
    mockFreelancerProfileRepo.getProfileByUserId.mockResolvedValueOnce({
      user_id: 'fl-1',
      skills: [{ name: 'React', years_of_experience: 3 }],
    });

    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateContent.mockResolvedValueOnce('invalid json response');
    mockParseJsonResponse.mockReturnValueOnce(null);

    const { analyzeSkillGaps } = await import(resolveModule('src/services/matching-service.ts'));
    const result = await analyzeSkillGaps('fl-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reasoning).toContain('Failed to parse');
      expect(result.data.recommendedSkills).toEqual([]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: search-service
// ═══════════════════════════════════════════════════════════════

describe('search-service: pageSize > MAX_PAGE_SIZE (line 47)', () => {
  beforeEach(() => resetAllMocks());

  it('should cap pageSize to MAX_PAGE_SIZE (100) when exceeded', async () => {
    mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
      items: [],
      hasMore: false,
      total: 0,
    });

    const { searchProjects } = await import(resolveModule('src/services/search-service.ts'));
    const result = await searchProjects({}, { pageSize: 500 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.pageSize).toBe(100);
    }
  });
});

describe('search-service: budget-only filter (line 96)', () => {
  beforeEach(() => resetAllMocks());

  it('should use getProjectsByBudgetRange when only budget filter is provided', async () => {
    mockProjectRepo.getProjectsByBudgetRange.mockResolvedValueOnce({
      items: [{ id: 'p1', budget: 1500, required_skills: [], title: 'Project', description: 'Desc', status: 'open' }],
      hasMore: false,
      total: 1,
    });

    const { searchProjects } = await import(resolveModule('src/services/search-service.ts'));
    const result = await searchProjects({ minBudget: 1000, maxBudget: 2000 });

    expect(result.success).toBe(true);
    expect(mockProjectRepo.getProjectsByBudgetRange).toHaveBeenCalledWith(1000, 2000, expect.any(Object));
  });
});

describe('search-service: multi-filter budget with default maxBudget (line 138)', () => {
  beforeEach(() => resetAllMocks());

  it('should use Number.MAX_SAFE_INTEGER when maxBudget is not set in multi-filter', async () => {
    // Multi-filter: keyword + budget (no skills) — keyword is the DB-level filter now
    const projects = [
      { id: 'p1', title: 'Node API', description: 'Build API', budget: 500, status: 'open', required_skills: [] },
      { id: 'p2', title: 'Node Frontend', description: 'Build UI', budget: 5000, status: 'open', required_skills: [] },
    ];
    mockProjectRepo.searchProjects.mockResolvedValueOnce({
      items: projects,
      hasMore: false,
      total: 2,
    });

    const { searchProjects } = await import(resolveModule('src/services/search-service.ts'));
    // keyword + minBudget only (no maxBudget) → triggers the ?? Number.MAX_SAFE_INTEGER path
    const result = await searchProjects({ keyword: 'Node', minBudget: 100 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
    expect(mockProjectRepo.searchProjects).toHaveBeenCalledWith('Node', expect.any(Object));
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: skill-service
// ═══════════════════════════════════════════════════════════════

describe('skill-service: cache hit in getAllCategories (line 85)', () => {
  beforeEach(() => resetAllMocks());

  it('should return cached categories without hitting the repository', async () => {
    const cachedCategories = [
      { id: 'cat-1', name: 'Frontend', description: 'Frontend skills', isActive: true },
      { id: 'cat-2', name: 'Backend', description: 'Backend skills', isActive: true },
    ];
    mockSkillCache.get.mockReturnValueOnce(cachedCategories);

    const { getAllCategories } = await import(resolveModule('src/services/skill-service.ts'));
    const result = await getAllCategories();

    expect(result).toEqual(cachedCategories);
    // Repository should NOT have been called
    expect(mockSkillCategoryRepo.getAllCategories).not.toHaveBeenCalled();
  });
});

describe('skill-service: updateSkill field mapping (lines 173-174)', () => {
  beforeEach(() => resetAllMocks());

  it('should map categoryId, name, and description to entity fields', async () => {
    mockSkillRepo.findSkillById.mockResolvedValueOnce({
      id: 'skill-1',
      category_id: 'cat-1',
      name: 'Old Name',
      description: 'Old Desc',
      is_active: true,
    });
    // Category exists
    mockSkillCategoryRepo.getCategoryById.mockResolvedValueOnce({ id: 'cat-2', name: 'Backend' });
    // No name conflict
    mockSkillRepo.getSkillByNameInCategory.mockResolvedValueOnce(null);
    mockSkillRepo.updateSkill.mockResolvedValueOnce({
      id: 'skill-1',
      category_id: 'cat-2',
      name: 'New Name',
      description: 'New Description',
      is_active: true,
    });

    const { updateSkill } = await import(resolveModule('src/services/skill-service.ts'));
    const result = await updateSkill('skill-1', {
      categoryId: 'cat-2',
      name: 'New Name',
      description: 'New Description',
    });

    expect(result.success).toBe(true);
    expect(mockSkillRepo.updateSkill).toHaveBeenCalledWith('skill-1', {
      category_id: 'cat-2',
      name: 'New Name',
      description: 'New Description',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: milestone-service
// ═══════════════════════════════════════════════════════════════

describe('milestone-service: unauthorized user in getMilestoneById (lines 32-34)', () => {
  beforeEach(() => resetAllMocks());

  it('should return UNAUTHORIZED when userId is not a party to the contract', async () => {
    mockMilestoneRepo.getById.mockResolvedValueOnce({
      id: 'ms-1',
      title: 'Design',
      status: 'pending',
      contract_id: 'c-1',
      revision_count: 0,
    });
    mockContractRepo.getContractById.mockResolvedValueOnce({
      id: 'c-1',
      employer_id: 'employer-1',
      freelancer_id: 'freelancer-1',
      status: 'active',
    });

    const { getMilestoneById } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await getMilestoneById('ms-1', 'unauthorized-user');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('milestone-service: non-active contract in submitMilestone (line 88)', () => {
  beforeEach(() => resetAllMocks());

  it('should reject submission when contract is not active', async () => {
    mockMilestoneRepo.getById.mockResolvedValueOnce({
      id: 'ms-1',
      title: 'Design',
      status: 'pending',
      contract_id: 'c-1',
      revision_count: 0,
    });
    mockContractRepo.getContractById.mockResolvedValueOnce({
      id: 'c-1',
      freelancer_id: 'fl-1',
      employer_id: 'em-1',
      status: 'completed',
    });

    const { submitMilestone } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await submitMilestone({
      milestoneId: 'ms-1',
      freelancerId: 'fl-1',
      deliverables: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
      expect(result.error.message).toContain('completed');
    }
  });
});

describe('milestone-service: max revisions in rejectMilestone (line 198)', () => {
  beforeEach(() => resetAllMocks());

  it('should reject when revision_count >= MAX_REVISIONS (5)', async () => {
    mockMilestoneRepo.getById.mockResolvedValueOnce({
      id: 'ms-1',
      title: 'Design',
      status: 'submitted',
      contract_id: 'c-1',
      revision_count: 5,
    });
    mockContractRepo.getContractById.mockResolvedValueOnce({
      id: 'c-1',
      freelancer_id: 'fl-1',
      employer_id: 'em-1',
      status: 'active',
    });

    const { rejectMilestone } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await rejectMilestone({
      milestoneId: 'ms-1',
      employerId: 'em-1',
      reason: 'Needs work',
      requestRevision: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MAX_REVISIONS_REACHED');
      expect(result.error.message).toContain('5');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: dispute-evidence-service
// ═══════════════════════════════════════════════════════════════

describe('dispute-evidence-service: contract not found in submitEvidence (line 35)', () => {
  beforeEach(() => resetAllMocks());

  it('should return DISPUTE_NOT_FOUND when contract does not exist for dispute', async () => {
    mockDisputeRepo.getDisputeById.mockResolvedValueOnce({
      id: 'disp-1',
      contract_id: 'c-1',
      status: 'open',
      resolution: null,
    });
    mockContractRepo.getContractById.mockResolvedValueOnce(null);

    const { submitEvidence } = await import(resolveModule('src/services/dispute-evidence-service.ts'));
    const result = await submitEvidence({
      disputeId: 'disp-1',
      submittedBy: 'user-1',
      evidenceType: 'text',
      description: 'Evidence text',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    }
  });
});

describe('dispute-evidence-service: contract not found in getDisputeEvidence (line 155)', () => {
  beforeEach(() => resetAllMocks());

  it('should return DISPUTE_NOT_FOUND when contract does not exist for evidence lookup', async () => {
    mockDisputeRepo.getDisputeById.mockResolvedValueOnce({
      id: 'disp-1',
      contract_id: 'c-1',
      status: 'open',
      resolution: null,
    });
    mockContractRepo.getContractById.mockResolvedValueOnce(null);

    const { getDisputeEvidence } = await import(resolveModule('src/services/dispute-evidence-service.ts'));
    const result = await getDisputeEvidence('disp-1', 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    }
  });
});

describe('dispute-evidence-service: dispute not found in verifyEvidence (line 274)', () => {
  beforeEach(() => resetAllMocks());

  it('should return EVIDENCE_NOT_FOUND when dispute does not exist during verification', async () => {
    mockDisputeEvidenceRepo.getEvidenceById.mockResolvedValueOnce({
      id: 'ev-1',
      dispute_id: 'disp-1',
      submitted_by: 'user-1',
      evidence_type: 'text',
      description: 'Evidence',
      created_at: now(),
      updated_at: now(),
    });
    mockDisputeRepo.getDisputeById.mockResolvedValueOnce(null);

    const { verifyEvidence } = await import(resolveModule('src/services/dispute-evidence-service.ts'));
    const result = await verifyEvidence({
      evidenceId: 'ev-1',
      verifiedBy: 'admin-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: employer-profile-service
// ═══════════════════════════════════════════════════════════════

describe('employer-profile-service: KYC data null (line 87)', () => {
  beforeEach(() => resetAllMocks());

  it('should return KYC_NOT_APPROVED when KYC data is null', async () => {
    mockEmployerProfileRepo.getProfileByUserId.mockResolvedValueOnce(null);
    mockGetProfileDataFromKyc.mockResolvedValueOnce({ success: true, data: null });

    const { createEmployerProfileFromKyc } = await import(resolveModule('src/services/employer-profile-service.ts'));
    const result = await createEmployerProfileFromKyc('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('KYC_NOT_APPROVED');
      expect(result.error.message).toContain('No KYC data');
    }
  });
});

describe('employer-profile-service: update fails (line 144)', () => {
  beforeEach(() => resetAllMocks());

  it('should return UPDATE_FAILED when updateProfile returns null', async () => {
    mockEmployerProfileRepo.getProfileByUserId.mockResolvedValueOnce({
      id: 'ep-1',
      user_id: 'user-1',
      company_name: 'Old Co',
      description: 'Old desc',
      industry: 'Tech',
    });
    mockEmployerProfileRepo.updateProfile.mockResolvedValueOnce(null);

    const { updateEmployerProfile } = await import(resolveModule('src/services/employer-profile-service.ts'));
    const result = await updateEmployerProfile('user-1', { companyName: 'New Co' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: file-service
// ═══════════════════════════════════════════════════════════════

describe('file-service: no permissions (line 34)', () => {
  beforeEach(() => resetAllMocks());

  it('should exclude files without $permissions from results', async () => {
    mockAppwriteStorage.listFiles.mockResolvedValueOnce({
      files: [
        { $id: 'file-1', name: 'no-perms.txt', sizeOriginal: 100, $createdAt: '2024-01-01', $updatedAt: '2024-01-01' },
      ],
      total: 1,
    });

    const { getUserFiles } = await import(resolveModule('src/services/file-service.ts'));
    const result = await getUserFiles('user-1', 'portfolio-images');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});

describe('file-service: outer catch in getUserFiles (lines 80-81)', () => {
  beforeEach(() => resetAllMocks());

  it('should return INTERNAL_ERROR when inner catch logger throws', async () => {
    // storage.listFiles throws → enters inner catch
    mockAppwriteStorage.listFiles.mockRejectedValueOnce(new Error('storage error'));
    // logger.error in inner catch throws → propagates to outer catch
    mockLogger.error.mockImplementationOnce(() => { throw new Error('logger exploded'); });

    const { getUserFiles } = await import(resolveModule('src/services/file-service.ts'));
    const result = await getUserFiles('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('file-service: outer catch in deleteFile (lines 131-132)', () => {
  beforeEach(() => resetAllMocks());

  it('should return INTERNAL_ERROR when deleteFile storage call fails after ownership check', async () => {
    // getFile succeeds with correct ownership
    mockAppwriteStorage.getFile.mockResolvedValueOnce({
      $id: 'file-1',
      name: 'test.txt',
      $permissions: ['write("user:user-1")'],
    });
    // deleteFile throws
    mockAppwriteStorage.deleteFile.mockRejectedValueOnce(new Error('delete failed'));

    const { deleteFile } = await import(resolveModule('src/services/file-service.ts'));
    const result = await deleteFile('user-1', 'portfolio-images', 'file-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('file-service: getUserFiles fails in getFileQuota (line 150)', () => {
  beforeEach(() => resetAllMocks());

  it('should propagate error when getUserFiles fails', async () => {
    // Make getUserFiles fail by triggering its outer catch
    mockAppwriteStorage.listFiles.mockRejectedValueOnce(new Error('storage error'));
    mockLogger.error.mockImplementationOnce(() => { throw new Error('logger exploded'); });

    const { getFileQuota } = await import(resolveModule('src/services/file-service.ts'));
    const result = await getFileQuota('user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: email-preference-service
// ═══════════════════════════════════════════════════════════════

// Note: email-preference update paths (lines 107-128) are covered by
// src/__tests__/unit/email-preference-service.test.ts (updateEmailPreferences tests)

// ═══════════════════════════════════════════════════════════════
// TESTS: message-service
// ═══════════════════════════════════════════════════════════════

describe('message-service: sendMessage catch (lines 143-144)', () => {
  beforeEach(() => resetAllMocks());

  it('should return INTERNAL_ERROR when findConversation throws unexpectedly', async () => {
    // resolveReceiverUserId succeeds
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2', name: 'User 2', email: 'u2@test.com' });
    // findConversation throws
    mockMessageRepo.findConversation.mockRejectedValueOnce(new Error('DB connection lost'));

    const { sendMessage } = await import(resolveModule('src/services/message-service.ts'));
    const result = await sendMessage({
      senderId: 'user-1',
      receiverId: 'user-2',
      content: 'Hello!',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('message-service: getConversations per-user error (lines 195-200)', () => {
  beforeEach(() => resetAllMocks());

  it('should skip conversation when getUserById throws for other user', async () => {
    mockMessageRepo.getUserConversations.mockResolvedValueOnce({
      items: [
        { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2', last_message_at: now(), last_message_preview: 'Hi', unread_count_1: 0, unread_count_2: 0 },
        { id: 'conv-2', participant1_id: 'user-1', participant2_id: 'user-3', last_message_at: now(), last_message_preview: 'Hey', unread_count_1: 0, unread_count_2: 0 },
      ],
      total: 2,
    });

    // First getUserById call throws (for user-2 in conv-1)
    mockUserRepo.getUserById
      .mockRejectedValueOnce(new Error('User lookup timeout'))
      // Second call succeeds (for user-3 in conv-2)
      .mockResolvedValueOnce({ id: 'user-3', name: 'User 3', email: 'u3@test.com' });

    const { getConversations } = await import(resolveModule('src/services/message-service.ts'));
    const result = await getConversations('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      // Only conv-2 should be included (conv-1 was skipped due to error)
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].otherUser.id).toBe('user-3');
    }
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error fetching user details for conversation',
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: user-custom-skill-service
// ═══════════════════════════════════════════════════════════════

describe('user-custom-skill-service: create catch block (line 118)', () => {
  beforeEach(() => resetAllMocks());

  it('should return CREATE_FAILED when repository throws during creation', async () => {
    // searchSkills → returns empty (no global match)
    mockSkillRepo.searchSkillsByKeyword.mockResolvedValueOnce([]);
    mockSkillCategoryRepo.getAllCategories.mockResolvedValueOnce([]);
    // getUserCustomSkills → returns empty (no duplicate)
    mockUserCustomSkillRepo.getUserCustomSkills.mockResolvedValueOnce([]);
    // createUserCustomSkill → throws
    mockUserCustomSkillRepo.createUserCustomSkill.mockRejectedValueOnce(new Error('DB write failed'));

    const { createUserCustomSkill } = await import(resolveModule('src/services/user-custom-skill-service.ts'));
    const result = await createUserCustomSkill('user-1', 'Test User', {
      name: 'Custom Skill',
      description: 'A custom skill',
      yearsOfExperience: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CREATE_FAILED');
      expect(result.error.details[0]).toContain('DB write failed');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS: analytics-service
// ═══════════════════════════════════════════════════════════════

describe('analytics-service: active user filtering in getPlatformMetrics (line 282)', () => {
  beforeEach(() => resetAllMocks());

  it('should count distinct active users from audit logs within 30 days', async () => {
    const recentDate = new Date().toISOString();
    const oldDate = '2020-01-01T00:00:00.000Z';

    mockDatabases.listDocuments
      // Call 1: USERS (total count)
      .mockResolvedValueOnce({ documents: [], total: 100 })
      // Call 2: PROJECTS (total count)
      .mockResolvedValueOnce({ documents: [], total: 50 })
      // Call 3: CONTRACTS (total count)
      .mockResolvedValueOnce({ documents: [], total: 30 })
      // Call 4: CONTRACTS (completed count)
      .mockResolvedValueOnce({ documents: [], total: 20 })
      // Call 5: AUDIT_LOG_ENTRIES
      .mockResolvedValueOnce({
        documents: [
          { user_id: 'user-a', created_at: recentDate },
          { user_id: 'user-b', created_at: recentDate },
          { user_id: 'user-a', created_at: recentDate },
          { user_id: 'user-c', created_at: oldDate },
          { user_id: null, created_at: recentDate },
        ],
        total: 5,
      })
      // Call 6: CONTRACTS (completed, for transaction volume)
      .mockResolvedValueOnce({
        documents: [{ total_amount: 5000 }, { total_amount: 3000 }],
        total: 2,
      });

    const { getPlatformMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getPlatformMetrics();

    expect(result.success).toBe(true);
    if (result.success) {
      // user-a (recent), user-b (recent) → 2 active; user-c is old, null is filtered
      expect(result.data.activeUsers).toBe(2);
      expect(result.data.totalTransactionVolume).toBe(8000);
    }
  });
});

describe('analytics-service: sort by month in calculateEarningsByMonth (line 526)', () => {
  beforeEach(() => resetAllMocks());

  it('should return earnings sorted by month ascending', async () => {
    const contracts = [
      { $id: 'c1', freelancer_id: 'user-1', status: 'completed', total_amount: 2000, created_at: '2024-03-15T00:00:00.000Z', project_id: 'p1' },
      { $id: 'c2', freelancer_id: 'user-1', status: 'completed', total_amount: 1000, created_at: '2024-01-10T00:00:00.000Z', project_id: 'p2' },
      { $id: 'c3', freelancer_id: 'user-1', status: 'completed', total_amount: 1500, created_at: '2024-02-20T00:00:00.000Z', project_id: 'p3' },
    ];

    mockDatabases.listDocuments
      // Call 1: CONTRACTS (for freelancer analytics)
      .mockResolvedValueOnce({ documents: contracts, total: 3 })
      // Call 2: REVIEWS
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // Call 3: PROPOSALS
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // Call 4: CONTRACTS (for calculateTopSkills)
      .mockResolvedValueOnce({ documents: contracts, total: 3 });

    // getDocument for each project in calculateTopSkills
    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'p1', required_skills: [{ skill_name: 'React' }] })
      .mockResolvedValueOnce({ $id: 'p2', required_skills: [{ skill_name: 'Vue' }] })
      .mockResolvedValueOnce({ $id: 'p3', required_skills: [{ skill_name: 'React' }] });

    const { getFreelancerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getFreelancerAnalytics('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      const months = result.data.earningsByMonth.map(e => e.month);
      // Should be sorted ascending: 2024-01, 2024-02, 2024-03
      expect(months).toEqual(['2024-01', '2024-02', '2024-03']);
      expect(result.data.earningsByMonth[0].amount).toBe(1000);
      expect(result.data.earningsByMonth[1].amount).toBe(1500);
      expect(result.data.earningsByMonth[2].amount).toBe(2000);
    }
  });
});

describe('analytics-service: sort by projectCount in calculateTopSkills (line 587)', () => {
  beforeEach(() => resetAllMocks());

  it('should return top skills sorted by projectCount descending', async () => {
    const contracts = [
      { $id: 'c1', freelancer_id: 'user-1', status: 'completed', total_amount: 1000, created_at: '2024-01-01T00:00:00.000Z', project_id: 'p1' },
      { $id: 'c2', freelancer_id: 'user-1', status: 'completed', total_amount: 1000, created_at: '2024-01-01T00:00:00.000Z', project_id: 'p2' },
      { $id: 'c3', freelancer_id: 'user-1', status: 'completed', total_amount: 1000, created_at: '2024-01-01T00:00:00.000Z', project_id: 'p3' },
    ];

    mockDatabases.listDocuments
      // Call 1: CONTRACTS (freelancer analytics)
      .mockResolvedValueOnce({ documents: contracts, total: 3 })
      // Call 2: REVIEWS
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // Call 3: PROPOSALS
      .mockResolvedValueOnce({ documents: [], total: 0 })
      // Call 4: CONTRACTS (calculateTopSkills)
      .mockResolvedValueOnce({ documents: contracts, total: 3 });

    // Projects: p1 has [React, Node], p2 has [React], p3 has [Python]
    // React appears 2x, Node 1x, Python 1x → React should be first
    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'p1', required_skills: [{ skill_name: 'React' }, { skill_name: 'Node.js' }] })
      .mockResolvedValueOnce({ $id: 'p2', required_skills: [{ skill_name: 'React' }] })
      .mockResolvedValueOnce({ $id: 'p3', required_skills: [{ skill_name: 'Python' }] });

    const { getFreelancerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getFreelancerAnalytics('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topSkills.length).toBeGreaterThanOrEqual(2);
      // React should be first (projectCount: 2)
      expect(result.data.topSkills[0].skill).toBe('React');
      expect(result.data.topSkills[0].projectCount).toBe(2);
      // Node.js and Python each have projectCount: 1
      const secondTier = result.data.topSkills.slice(1);
      expect(secondTier.every(s => s.projectCount === 1)).toBe(true);
    }
  });
});
