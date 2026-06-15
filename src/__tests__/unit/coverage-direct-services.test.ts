// @ts-nocheck
/**
 * Direct Service Coverage Tests
 * Tests service functions directly (not through routes) by mocking only
 * dependencies (repositories, external APIs), not the services themselves.
 * This ensures the real service code paths execute for branch coverage.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// ==================== Core Infrastructure Mocks ====================
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/config/collections.ts'), () => ({
  COLLECTIONS: {
    USERS: 'users',
    PROJECTS: 'projects',
    CONTRACTS: 'contracts',
    REVIEWS: 'reviews',
    PROPOSALS: 'proposals',
    NOTIFICATIONS: 'notifications',
    MESSAGES: 'messages',
    CONVERSATIONS: 'conversations',
    DISPUTES: 'disputes',
    AUDIT_LOG_ENTRIES: 'audit_log_entries',
    EMAIL_PREFERENCES: 'email_preferences',
    SAVED_SEARCHES: 'saved_searches',
  },
}));

const mockDatabases = {
  listDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0 }),
  getDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  createDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  updateDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  deleteDocument: jest.fn().mockResolvedValue({}),
};
(globalThis as any).__mockDatabases = mockDatabases;

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  DATABASE_ID: 'freelancexchain',
  databases: mockDatabases,
  storage: {
    deleteFile: jest.fn().mockResolvedValue({}),
    listFiles: jest.fn().mockResolvedValue({ files: [], total: 0 }),
    getFile: jest.fn().mockResolvedValue({ $id: 'f1', name: 'test' }),
  },
  BUCKETS: {
    PORTFOLIO_IMAGES: 'portfolio-images',
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    MILESTONE_DELIVERABLES: 'milestone-deliverables',
  },
  Query: {
    equal: jest.fn(),
    notEqual: jest.fn(),
    orderDesc: jest.fn(),
    orderAsc: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id-' + Math.random().toString(36).slice(2, 8),
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    llm: {
      apiKey: process.env['LLM_API_KEY'] || '',
      apiUrl: process.env['LLM_API_URL'] || 'https://api.example.com',
      model: 'test-model',
    },
  },
}));

// ==================== Entity Mapper Mocks ====================
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapContractFromEntity: (e: any) => ({
    id: e.id || 'c1',
    projectId: e.project_id || 'p1',
    freelancerId: e.freelancer_id || 'f1',
    employerId: e.employer_id || 'e1',
    status: e.status || 'active',
    title: e.title || 'Contract',
    totalAmount: e.total_amount || 1000,
    rushFee: e.rush_fee || 0,
    baseAmount: e.base_amount || 1000,
  }),
  mapProjectFromEntity: (e: any) => ({
    id: e.id || 'p1',
    title: e.title || 'Project',
    description: e.description || '',
    milestones: (e.milestones || []).map((m: any) => ({
      id: m.id,
      title: m.title || 'Milestone',
      status: m.status,
      amount: m.amount || 0,
    })),
  }),
  mapMilestoneFromEntity: (e: any) => ({
    id: e.id || 'm1',
    title: e.title || 'Milestone',
    status: e.status,
    amount: e.amount || 0,
  }),
  mapDisputeFromEntity: (e: any) => ({
    id: e.id || 'd1',
    contractId: e.contract_id || 'c1',
    milestoneId: e.milestone_id || 'm1',
    initiatorId: e.initiator_id || 'i1',
    reason: e.reason || 'reason',
    evidence: e.evidence || [],
    status: e.status || 'open',
    resolution: e.resolution || null,
  }),
  mapFreelancerProfileFromEntity: (e: any) => ({
    id: e.id || 'p1',
    userId: e.user_id || 'u1',
    name: e.name || null,
    nationality: e.nationality || null,
    bio: e.bio || '',
    hourlyRate: e.hourly_rate || 0,
    skills: e.skills || [],
    experience: e.experience || [],
    availability: e.availability || 'available',
    createdAt: new Date(e.created_at || '2025-01-01'),
    updatedAt: new Date(e.updated_at || '2025-01-01'),
  }),
}));

// ==================== Repository Mocks ====================
const mockProjectRepository = {
  getAllOpenProjects: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  findProjectById: jest.fn(),
  updateProject: jest.fn().mockResolvedValue({}),
  searchProjects: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getById: jest.fn(),
  createProject: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockFreelancerProfileRepository = {
  getProfileByUserId: jest.fn(),
  getAvailableProfiles: jest.fn().mockResolvedValue([]),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
  searchBySkills: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  searchByKeyword: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getAllProfilesPaginated: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

const mockSkillRepository = { getAllSkills: jest.fn().mockResolvedValue([]) };
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  extractFileIdFromUrl: jest.fn().mockReturnValue('file-id-123'),
}));

const mockContractRepository = {
  getContractById: jest.fn(),
  updateContract: jest.fn().mockResolvedValue({}),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockMilestoneRepository = {
  getById: jest.fn(),
  update: jest.fn(),
  findByContract: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
}));

const mockDisputeRepository = {
  getDisputeById: jest.fn(),
  getDisputeByMilestone: jest.fn(),
  createDispute: jest.fn(),
  updateDispute: jest.fn(),
  getAllDisputesByContract: jest.fn(),
  getDisputesByStatus: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getDisputesByInitiator: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getAllDisputes: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getDisputesByUserId: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
};
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-evidence-repository.ts'), () => ({
  disputeEvidenceRepository: { createEvidence: jest.fn() },
}));

const mockUserRepository = {
  getUserById: jest.fn().mockResolvedValue(null),
  getUsersByRole: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const mockSavedSearchRepository = {
  create: jest.fn(),
  findByUser: jest.fn().mockResolvedValue([]),
  findOwnerById: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  delete: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/saved-search-repository.ts'), () => ({
  savedSearchRepository: mockSavedSearchRepository,
}));

const mockPortfolioRepository = {
  create: jest.fn(),
  findOwnerById: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  delete: jest.fn(),
  findByFreelancer: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule(resolveModule('src/repositories/portfolio-repository.ts'), () => ({
  portfolioRepository: mockPortfolioRepository,
}));

const mockFavoriteRepository = {
  findByUserAndTarget: jest.fn(),
  create: jest.fn(),
  removeByUserAndTarget: jest.fn(),
  findByUser: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule(resolveModule('src/repositories/favorites-repository.ts'), () => ({
  favoriteRepository: mockFavoriteRepository,
}));

// ==================== Service Mocks (only external services, NOT the services under test) ====================
const mockGetProfileDataFromKyc = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

const mockCreateNotification = jest.fn().mockResolvedValue({ success: true, data: { id: 'notif-1' } });
const mockSendNotificationToUser = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockCreateNotification,
  notifyDisputeCreated: jest.fn().mockResolvedValue(undefined),
  notifyDisputeResolved: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  releaseMilestone: jest.fn(),
  refundMilestone: jest.fn(),
  getEscrowByContractId: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule(resolveModule('src/services/dispute-registry.ts'), () => ({
  createDisputeOnBlockchain: jest.fn(),
  updateDisputeEvidence: jest.fn(),
  resolveDisputeOnBlockchain: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  confirmTransaction: jest.fn().mockResolvedValue({ hash: '0xhash', blockNumber: 1, gasUsed: '21000' }),
  generateWalletAddress: jest.fn().mockReturnValue('0xmockaddr'),
}));

// Mock ai-client with controllable functions so matching-service can use AI paths
const mockIsAIAvailable = jest.fn().mockReturnValue(false);
const mockIsAIError = jest.fn().mockReturnValue(false);
const mockAnalyzeSkillMatch = jest.fn().mockResolvedValue({ matchScore: 75, matchedSkills: ['React'], missingSkills: [], reasoning: 'Good' });
const mockExtractSkillsFn = jest.fn().mockResolvedValue([]);
const mockGenerateContent = jest.fn().mockResolvedValue('');
const mockParseJsonResponse = jest.fn().mockReturnValue(null);

jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => ({
  isAIAvailable: mockIsAIAvailable,
  isAIError: mockIsAIError,
  analyzeSkillMatch: mockAnalyzeSkillMatch,
  extractSkills: mockExtractSkillsFn,
  keywordMatchSkills: (freelancerSkills: any[], projectRequirements: any[]) => {
    const freelancerSkillNames = new Set(freelancerSkills.map(s => (s.skillName || '').toLowerCase()));
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];
    for (const req of projectRequirements) {
      if (freelancerSkillNames.has((req.skillName || '').toLowerCase())) {
        matchedSkills.push(req.skillName);
      } else {
        missingSkills.push(req.skillName);
      }
    }
    const total = projectRequirements.length;
    return {
      matchScore: total > 0 ? Math.round((matchedSkills.length / total) * 100) : 0,
      matchedSkills,
      missingSkills,
      reasoning: `Keyword: ${matchedSkills.length}/${total}`,
    };
  },
  keywordExtractSkills: (text: string, availableSkills: any[]) => {
    const lower = text.toLowerCase();
    return availableSkills.filter(s => lower.includes((s.skillName || '').toLowerCase())).map(s => ({
      skillId: s.skillId,
      skillName: s.skillName,
      confidence: 0.8,
    }));
  },
  generateContent: mockGenerateContent,
  parseJsonResponse: mockParseJsonResponse,
  SKILL_GAP_PROMPT: 'Current Skills: {currentSkills}',
}));

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: jest.fn().mockResolvedValue([]),
  searchSkills: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: jest.fn().mockResolvedValue({ success: true, data: { score: 50 } }),
}));

jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendWeeklyDigestEmail: jest.fn().mockResolvedValue(undefined),
  testEmailConfiguration: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-agreement-repository.ts'), () => ({
  blockchainAgreementRepository: {
    findByContractIdHash: jest.fn(),
    createAgreement: jest.fn(),
    updateAgreement: jest.fn(),
    findByWallet: jest.fn().mockResolvedValue([]),
    queryAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: { createNotification: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: jest.fn(),
  generateContractIdHash: (id: string) => '0x' + require('crypto').createHash('sha256').update(id).digest('hex'),
  generateTermsHash: (terms: any) => '0x' + require('crypto').createHash('sha256').update(JSON.stringify({
    projectTitle: terms.projectTitle, description: terms.description,
    milestones: terms.milestones, deadline: terms.deadline,
  })).digest('hex'),
  createAgreementOnBlockchain: jest.fn(),
  signAgreement: jest.fn(),
  completeAgreement: jest.fn(),
  getAgreementFromBlockchain: jest.fn().mockResolvedValue(null),
  verifyAgreementTerms: jest.fn().mockResolvedValue(false),
  isAgreementFullySigned: jest.fn().mockResolvedValue(false),
  getUserAgreements: jest.fn().mockResolvedValue([]),
  clearBlockchainAgreements: jest.fn(),
  getAgreementContractAddress: jest.fn().mockReturnValue('0xmockaddr'),
}));

// ==================== Services Under Test (REAL implementations) ====================
// We do NOT mock these - we import the real service code

describe('Direct Service Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
    mockIsAIAvailable.mockReturnValue(false);
    mockIsAIError.mockReturnValue(false);
    mockGenerateContent.mockResolvedValue('');
    mockParseJsonResponse.mockReturnValue(null);
  });

  // =====================================================================
  // 1. matching-service.ts (9 branches)
  // =====================================================================
  describe('Matching Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/matching-service.js');

    it('should return error when freelancer profile not found', async () => {
      const { getProjectRecommendations } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);

      const result = await getProjectRecommendations('user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return empty array when no open projects exist', async () => {
      const { getProjectRecommendations } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getProjectRecommendations('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual([]);
    });

    it('should use keyword matching when AI not available', async () => {
      const { getProjectRecommendations } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [{
          id: 'proj-1', title: 'P1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
          created_at: '2025-01-01',
        }],
        total: 1,
      });

      const result = await getProjectRecommendations('user-1');
      expect(result.success).toBe(true);
    });

    it('should return error when project not found for freelancer recommendations', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('should return empty when no freelancers available', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'proj-1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
      });
      mockFreelancerProfileRepository.getAvailableProfiles.mockResolvedValueOnce([]);

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual([]);
    });

    it('should handle reputation lookup failure gracefully', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'proj-1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
      });
      mockFreelancerProfileRepository.getAvailableProfiles.mockResolvedValueOnce([{
        id: 'fp1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      }]);
      const { getReputation } = await import('../../services/reputation-service.ts');
      (getReputation as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(true);
    });

    it('should return error for empty text in extractSkillsFromText', async () => {
      const { extractSkillsFromText } = await importModule();
      const result = await extractSkillsFromText('');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_INPUT');
    });

    it('should return empty when no active skills in extractSkillsFromText', async () => {
      const { extractSkillsFromText } = await importModule();
      const { getActiveSkills } = await import('../../services/skill-service.ts');
      (getActiveSkills as jest.Mock).mockResolvedValueOnce([]);

      const result = await extractSkillsFromText('I know React and Vue');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual([]);
    });

    it('should return basic analysis when AI not available for skill gaps', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle non-string AI response in analyzeSkillGaps', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValueOnce(true);
      mockGenerateContent.mockResolvedValueOnce(42);

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle parseJsonResponse returning null in analyzeSkillGaps', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValueOnce(true);
      mockGenerateContent.mockResolvedValueOnce('valid response');
      mockParseJsonResponse.mockReturnValueOnce(null);

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle marketDemand with invalid demandLevel in analyzeSkillGaps', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValueOnce(true);
      mockGenerateContent.mockResolvedValueOnce('valid');
      mockParseJsonResponse.mockReturnValueOnce({
        currentSkills: ['React'],
        recommendedSkills: ['Python'],
        marketDemand: [{ skillName: 'Python', demandLevel: 'invalid' }],
        reasoning: 'test',
      });

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.marketDemand[0].demandLevel).toBe('medium');
      }
    });

    it('should handle marketDemand with empty skillName in analyzeSkillGaps', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValueOnce(true);
      mockGenerateContent.mockResolvedValueOnce('valid');
      mockParseJsonResponse.mockReturnValueOnce({
        currentSkills: ['React'],
        recommendedSkills: [],
        marketDemand: [
          { skillName: 'Python', demandLevel: 'high' },
          { skillName: '', demandLevel: 'medium' },
        ],
        reasoning: 'test',
      });

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle parse error in analyzeSkillGaps catch block', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValueOnce(true);
      mockGenerateContent.mockResolvedValueOnce('not valid json at all');
      mockParseJsonResponse.mockImplementationOnce(() => { throw new Error('parse fail'); });

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.recommendedSkills).toEqual([]);
    });

    it('should use AI for project recommendations when available', async () => {
      const { getProjectRecommendations } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockAnalyzeSkillMatch.mockResolvedValueOnce({
        matchScore: 80, matchedSkills: ['React'], missingSkills: [], reasoning: 'Good',
      });

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [{
          id: 'proj-1', title: 'P1',
          required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
          created_at: '2025-01-01',
        }],
        total: 1,
      });

      const result = await getProjectRecommendations('user-1');
      expect(result.success).toBe(true);
    });

    it('should fallback to keyword when AI returns error for project recommendations', async () => {
      const { getProjectRecommendations } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValueOnce(true);

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [{
          id: 'proj-1', title: 'P1',
          required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
          created_at: '2025-01-01',
        }],
        total: 1,
      });

      const result = await getProjectRecommendations('user-1');
      expect(result.success).toBe(true);
    });

    it('should use AI for freelancer recommendations when available', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(false);
      mockAnalyzeSkillMatch.mockResolvedValueOnce({
        matchScore: 80, matchedSkills: ['React'], missingSkills: [], reasoning: 'Good',
      });

      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'proj-1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
      });
      mockFreelancerProfileRepository.getAvailableProfiles.mockResolvedValueOnce([{
        id: 'fp1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      }]);
      const { getReputation } = await import('../../services/reputation-service.ts');
      (getReputation as jest.Mock).mockResolvedValueOnce({ success: true, data: { score: 70 } });

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(true);
    });

    it('should fallback to keyword when AI returns error for freelancer recommendations', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValueOnce(true);

      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'proj-1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
      });
      mockFreelancerProfileRepository.getAvailableProfiles.mockResolvedValueOnce([{
        id: 'fp1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      }]);
      const { getReputation } = await import('../../services/reputation-service.ts');
      (getReputation as jest.Mock).mockResolvedValueOnce({ success: true, data: { score: 70 } });

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(true);
    });

    it('should use AI for extractSkillsFromText when available', async () => {
      const { extractSkillsFromText } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValue(false);
      mockExtractSkillsFn.mockResolvedValueOnce([
        { skillId: 's1', skillName: 'React', confidence: 0.9 },
      ]);
      const { getActiveSkills } = await import('../../services/skill-service.ts');
      (getActiveSkills as jest.Mock).mockResolvedValueOnce([
        { id: 's1', name: 'React', categoryId: 'c1' },
      ]);

      const result = await extractSkillsFromText('I know React');
      expect(result.success).toBe(true);
    });

    it('should fallback to keyword when AI returns error for extractSkills', async () => {
      const { extractSkillsFromText } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockIsAIError.mockReturnValueOnce(true);

      const { getActiveSkills } = await import('../../services/skill-service.ts');
      (getActiveSkills as jest.Mock).mockResolvedValueOnce([
        { id: 's1', name: 'React', categoryId: 'c1' },
      ]);

      const result = await extractSkillsFromText('I know React');
      expect(result.success).toBe(true);
    });

    it('should handle analyzeSkillGaps with successful AI response', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockIsAIAvailable.mockReturnValue(true);
      mockGenerateContent.mockResolvedValueOnce('valid json');
      mockParseJsonResponse.mockReturnValueOnce({
        currentSkills: ['React'],
        recommendedSkills: ['Python'],
        marketDemand: [{ skillName: 'Python', demandLevel: 'high' }],
        reasoning: 'Good analysis',
      });

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle reputation score of 0 in freelancer recommendations', async () => {
      const { getFreelancerRecommendations } = await importModule();
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'proj-1', required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'c1' }],
      });
      mockFreelancerProfileRepository.getAvailableProfiles.mockResolvedValueOnce([{
        id: 'fp1', user_id: 'user-1', skills: [{ name: 'React', years_of_experience: 3 }],
      }]);
      const { getReputation } = await import('../../services/reputation-service.ts');
      (getReputation as jest.Mock).mockResolvedValueOnce({ success: true, data: { score: 0 } });

      const result = await getFreelancerRecommendations('proj-1');
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 2. analytics-service.ts (6 branches)
  // =====================================================================
  describe('Analytics Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/analytics-service.js');

    it('should filter contracts by startDate', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: 100, status: 'completed', created_at: '2025-01-15' },
            { $id: 'c2', total_amount: 200, status: 'completed', created_at: '2025-03-15' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1', { startDate: '2025-03-01' });
      expect(result.success).toBe(true);
    });

    it('should filter contracts by endDate', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: 100, status: 'completed', created_at: '2025-01-15' },
            { $id: 'c2', total_amount: 200, status: 'completed', created_at: '2025-03-15' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1', { endDate: '2025-02-01' });
      expect(result.success).toBe(true);
    });

    it('should return correct average rating when reviews exist', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
        .mockResolvedValueOnce({
          documents: [{ $id: 'r1', rating: 4 }, { $id: 'r2', rating: 5 }],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [{ $id: 'p1', status: 'accepted' }, { $id: 'p2', status: 'pending' }], total: 2 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.averageRating).toBe(4.5);
    });

    it('should return 0 average rating when no reviews', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.averageRating).toBe(0);
    });

    it('should calculate proposal acceptance rate correctly', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({
          documents: [
            { $id: 'p1', status: 'accepted' },
            { $id: 'p2', status: 'pending' },
            { $id: 'p3', status: 'accepted' },
          ],
          total: 3,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.proposalAcceptanceRate).toBe(66.7);
    });

    it('should handle employer analytics with date filtering', async () => {
      const { getEmployerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'proj1', budget: 500, created_at: '2025-01-15' },
            { $id: 'proj2', budget: 1000, created_at: '2025-06-15' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 500, created_at: '2025-01-20' }],
          total: 1,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getEmployerAnalytics('user-1', { startDate: '2025-01-01', endDate: '2025-12-31' });
      expect(result.success).toBe(true);
    });

    it('should handle getPlatformMetrics cache hit', async () => {
      const { getPlatformMetrics } = await importModule();
      const { platformMetricsCache } = await import('../../utils/cache.js');
      platformMetricsCache.set('platform_metrics', {
        totalUsers: 10, totalProjects: 5, totalContracts: 3,
        totalTransactionVolume: 1000, activeUsers: 5, completionRate: 66.7,
      });

      const result = await getPlatformMetrics();
      expect(result.success).toBe(true);
    });

    it('should handle getPlatformMetrics with zero contracts', async () => {
      const { getPlatformMetrics } = await importModule();
      const { platformMetricsCache } = await import('../../utils/cache.js');
      platformMetricsCache.delete('platform_metrics');

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getPlatformMetrics();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends cache hit', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.set('skill_trends', []);

      const result = await getSkillTrends();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends with projects having string required_skills', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.delete('skill_trends');

      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p1', required_skills: '["React", "Node.js"]', budget: 1000, status: 'open', created_at: '2025-01-15' },
          { $id: 'p2', required_skills: [{ skill_name: 'React' }], budget: 500, status: 'open', created_at: '2025-01-15' },
        ],
        total: 2,
      });

      const result = await getSkillTrends();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends with old projects only', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.delete('skill_trends');

      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p1', required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2024-01-01' },
        ],
        total: 1,
      });

      const result = await getSkillTrends();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends with many projects (high demand)', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.delete('skill_trends');

      const projects = Array.from({ length: 12 }, (_, i) => ({
        $id: `p${i}`, required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2025-01-15',
      }));

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: projects, total: 12 });

      const result = await getSkillTrends();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends with 3-9 projects (medium demand)', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.delete('skill_trends');

      const projects = Array.from({ length: 5 }, (_, i) => ({
        $id: `p${i}`, required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2025-01-15',
      }));

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: projects, total: 5 });

      const result = await getSkillTrends();
      expect(result.success).toBe(true);
    });

    it('should handle getSkillTrends error', async () => {
      const { getSkillTrends } = await importModule();
      const { skillTrendsCache } = await import('../../utils/cache.js');
      skillTrendsCache.delete('skill_trends');

      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSkillTrends();
      expect(result.success).toBe(false);
    });

    it('should handle calculateTopSkills error gracefully', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle calculateTopSkills fetching project docs', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'proj1', required_skills: [{ skill_name: 'React' }], created_at: '2025-01-15',
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle calculateTopSkills with string required_skills', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'proj1', required_skills: '["React"]', created_at: '2025-01-15',
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle calculateTopSkills when getDocument fails', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle employer analytics with zero projects', async () => {
      const { getEmployerAnalytics } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getEmployerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.averageProjectBudget).toBe(0);
    });

    it('should handle freelancer analytics exception', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB failure'));

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(false);
    });

    it('should handle employer analytics exception', async () => {
      const { getEmployerAnalytics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB failure'));

      const result = await getEmployerAnalytics('user-1');
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // 3. freelancer-profile-service.ts (5 branches)
  // =====================================================================
  describe('Freelancer Profile Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/freelancer-profile-service.js');

    it('should return error when profile already exists on create', async () => {
      const { createProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({ id: 'existing' });

      const result = await createProfile('u1', { bio: 'test', hourlyRate: 50 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROFILE_EXISTS');
    });

    it('should create profile with availability default', async () => {
      const { createProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', bio: 'test', hourly_rate: 50,
        skills: [], experience: [], availability: 'available',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createProfile('u1', { bio: 'test', hourlyRate: 50 });
      expect(result.success).toBe(true);
    });

    it('should create profile from KYC with name', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: true, data: { name: 'John Doe', nationality: 'US' },
      });
      mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', name: 'John Doe', nationality: 'US',
        bio: "Hi, I'm John Doe. I'm a verified freelancer ready to work on your projects.",
        hourly_rate: 0, skills: [], experience: [], availability: 'available',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(true);
    });

    it('should create profile from KYC with null name (default bio)', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: true, data: { name: null, nationality: null },
      });
      mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', name: null, nationality: null,
        bio: 'Verified freelancer ready to work on your projects.',
        hourly_rate: 0, skills: [], experience: [], availability: 'available',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(true);
    });

    it('should return error when KYC data is null', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: true, data: null,
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });

    it('should return error when KYC fails with empty message', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: false, error: { message: '' },
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(false);
    });

    it('should handle addSkillsToProfile with new skills', async () => {
      const { addSkillsToProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 3 }],
        experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 3 }]);
      expect(result.success).toBe(true);
    });

    it('should handle addSkillsToProfile updating existing skill', async () => {
      const { addSkillsToProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 1 }], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 5 }],
        experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 5 }]);
      expect(result.success).toBe(true);
    });

    it('should handle addSkillsToProfile updating duplicate in batch', async () => {
      const { addSkillsToProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [{ name: 'React', years_of_experience: 5 }],
        experience: [], created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await addSkillsToProfile('u1', [
        { name: 'React', yearsOfExperience: 3 },
        { name: 'React', yearsOfExperience: 5 },
      ]);
      expect(result.success).toBe(true);
    });

    it('should handle removeSkillFromProfile with null skills', async () => {
      const { removeSkillFromProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: null, experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [],
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await removeSkillFromProfile('u1', 'React');
      expect(result.success).toBe(true);
    });

    it('should return error when updateProfile fails in addSkills', async () => {
      const { addSkillsToProfile } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce(null);

      const result = await addSkillsToProfile('u1', [{ name: 'React', yearsOfExperience: 3 }]);
      expect(result.success).toBe(false);
    });

    it('should handle updateExperience with invalid date range', async () => {
      const { updateExperience } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [],
        experience: [{ id: 'exp-1', start_date: '2020-01-01', end_date: null, title: 'Dev', company: 'Co', description: 'Work' }],
      });

      const result = await updateExperience('u1', 'exp-1', {
        startDate: '2025-01-01', endDate: '2020-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('should handle removeExperience with update failure', async () => {
      const { removeExperience } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [{ id: 'exp-1' }],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce(null);

      const result = await removeExperience('u1', 'exp-1');
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // 4. didit-client.ts (5 branches + 6 statements)
  // =====================================================================
  describe('Didit Client - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/didit-client.js');

    it('should handle non-JSON response in createVerificationSession', async () => {
      const { createVerificationSession } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: jest.fn().mockResolvedValueOnce('<html>Error</html>'),
      });

      const result = await createVerificationSession({ document_type: 'passport' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.error.code).toBe('INVALID_RESPONSE');
      globalThis.fetch = originalFetch;
    });

    it('should handle API error in createVerificationSession', async () => {
      const { createVerificationSession } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: jest.fn().mockResolvedValueOnce({ error: { code: 'BAD_REQUEST', message: 'Invalid' } }),
      });

      const result = await createVerificationSession({ document_type: 'passport' });
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should handle network error in createVerificationSession', async () => {
      const { createVerificationSession } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await createVerificationSession({ document_type: 'passport' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.error.code).toBe('NETWORK_ERROR');
      globalThis.fetch = originalFetch;
    });

    it('should handle non-JSON response in getVerificationDecision', async () => {
      const { getVerificationDecision } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: jest.fn().mockResolvedValueOnce('<html>Error</html>'),
      });

      const result = await getVerificationDecision('session-123');
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should handle API error in getVerificationDecision', async () => {
      const { getVerificationDecision } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: jest.fn().mockResolvedValueOnce({ error: { code: 'NOT_FOUND', message: 'Session not found' } }),
      });

      const result = await getVerificationDecision('session-123');
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should handle network error in getVerificationDecision', async () => {
      const { getVerificationDecision } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('Timeout'));

      const result = await getVerificationDecision('session-123');
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should handle non-JSON response in getVerificationSession', async () => {
      const { getVerificationSession } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: jest.fn().mockResolvedValueOnce('<html>Error</html>'),
      });

      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should handle API error in getVerificationSession', async () => {
      const { getVerificationSession } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: jest.fn().mockResolvedValueOnce({ error: { code: 'SERVER_ERROR', message: 'Internal' } }),
      });

      const result = await getVerificationSession('session-123');
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });

    it('should reject webhook with no secret in production', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      const origInsecure = process.env['ALLOW_INSECURE_DIDIT_WEBHOOKS'];
      const origEnv = process.env['NODE_ENV'];
      delete process.env['DIDIT_WEBHOOK_SECRET'];
      delete process.env['ALLOW_INSECURE_DIDIT_WEBHOOKS'];
      process.env['NODE_ENV'] = 'production';

      const result = verifyWebhookSignature('{}', 'sig', '1234567890');
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
      if (origInsecure) process.env['ALLOW_INSECURE_DIDIT_WEBHOOKS'] = origInsecure;
      if (origEnv) process.env['NODE_ENV'] = origEnv;
    });

    it('should reject webhook with missing signature or timestamp', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';

      const result = verifyWebhookSignature('{}', '', '');
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should reject webhook with invalid timestamp', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';

      const result = verifyWebhookSignature('{}', 'sig', 'not-a-number');
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should reject webhook with expired timestamp', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';

      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const result = verifyWebhookSignature('{}', 'sig', String(oldTimestamp));
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should handle webhook with invalid JSON payload', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const result = verifyWebhookSignature('not-json', 'sig', timestamp);
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should verify valid webhook signature', async () => {
      const { verifyWebhookSignature } = await importModule();
      const crypto = await import('crypto');
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const payload = JSON.stringify({ event: 'test' });
      const canonical = JSON.stringify(JSON.parse(payload));
      const expectedSig = crypto.createHmac('sha256', 'test-secret').update(canonical, 'utf8').digest('hex');

      const result = verifyWebhookSignature(payload, expectedSig, timestamp);
      expect(result).toBe(true);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should handle sha256= prefix in signature', async () => {
      const { verifyWebhookSignature } = await importModule();
      const crypto = await import('crypto');
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const payload = JSON.stringify({ event: 'test' });
      const canonical = JSON.stringify(JSON.parse(payload));
      const expectedSig = crypto.createHmac('sha256', 'test-secret').update(canonical, 'utf8').digest('hex');

      const result = verifyWebhookSignature(payload, 'sha256=' + expectedSig, timestamp);
      expect(result).toBe(true);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should reject webhook with wrong signature', async () => {
      const { verifyWebhookSignature } = await importModule();
      const origSecret = process.env['DIDIT_WEBHOOK_SECRET'];
      process.env['DIDIT_WEBHOOK_SECRET'] = 'test-secret';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const result = verifyWebhookSignature('{}', 'wrong-sig', timestamp);
      expect(result).toBe(false);

      if (origSecret) process.env['DIDIT_WEBHOOK_SECRET'] = origSecret;
    });

    it('should handle network error in screenAml', async () => {
      const { screenAml } = await importModule();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await screenAml({ full_name: 'John', entity_type: 'person' });
      expect(result.success).toBe(false);
      globalThis.fetch = originalFetch;
    });
  });

  // =====================================================================
  // 5. scheduler-service.ts (4 branches + 1 statement)
  // =====================================================================
  describe('Scheduler Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/scheduler-service.js');

    it('should handle initializeScheduler', async () => {
      const { initializeScheduler } = await importModule();
      expect(() => initializeScheduler()).not.toThrow();
    });

    it('should handle stopScheduler', async () => {
      const { stopScheduler } = await importModule();
      expect(() => stopScheduler()).not.toThrow();
    });
  });

  // =====================================================================
  // 6. milestone-service.ts (4 branches)
  // =====================================================================
  describe('Milestone Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/milestone-service.js');

    it('should return error when milestone not found', async () => {
      const { getMilestoneById } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await getMilestoneById('ms-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle getMilestoneById exception', async () => {
      const { getMilestoneById } = await importModule();
      mockMilestoneRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getMilestoneById('ms-1');
      expect(result.success).toBe(false);
    });

    it('should return error when milestone not found in submitMilestone', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [] });
      expect(result.success).toBe(false);
    });

    it('should return error when contract not found in submitMilestone', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'pending', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return error when freelancer not authorized', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'pending', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'other-f', employer_id: 'e1', project_id: 'p1',
      });

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return error when milestone status is not submittable', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'approved', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should increment revision count on resubmitting rejected milestone', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'rejected', contract_id: 'c-1', revision_count: 2,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce({ status: 'submitted' });

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: ['file.pdf'] });
      expect(result.success).toBe(true);
    });

    it('should handle submitMilestone when update fails', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'pending', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce(null);

      const result = await submitMilestone({ milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [] });
      expect(result.success).toBe(false);
    });

    it('should return error when milestone not found in rejectMilestone', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await rejectMilestone({ milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad' });
      expect(result.success).toBe(false);
    });

    it('should return error when contract not found in rejectMilestone', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'submitted', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await rejectMilestone({ milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad' });
      expect(result.success).toBe(false);
    });

    it('should return error when employer not authorized in rejectMilestone', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'submitted', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'other-e', project_id: 'p1',
      });

      const result = await rejectMilestone({ milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return error when milestone status not submitted in rejectMilestone', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'pending', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });

      const result = await rejectMilestone({ milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should set status to disputed when requestRevision is false', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'submitted', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce({ status: 'disputed' });

      const result = await rejectMilestone({ milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad', requestRevision: false });
      expect(result.success).toBe(true);
    });

    it('should handle getContractMilestones exception', async () => {
      const { getContractMilestones } = await importModule();
      mockMilestoneRepository.findByContract.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractMilestones('c-1');
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // 7. ai-client.ts (4 branches) - using the MOCKED version for controllable tests
  // =====================================================================
  describe('AI Client - Direct Branch Coverage', () => {
    // Since ai-client is mocked, we test through the mock's behavior
    // The real ai-client.ts branches are covered by matching-service tests above
  });

  // =====================================================================
  // 8. portfolio-service.ts (3 branches)
  // =====================================================================
  describe('Portfolio Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/portfolio-service.js');

    it('should return error when no images provided', async () => {
      const { createPortfolioItem } = await importModule();
      const result = await createPortfolioItem('user-1', { title: 'T', description: 'D', images: [] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return error when invalid skills provided', async () => {
      const { createPortfolioItem } = await importModule();
      mockSkillRepository.getAllSkills.mockResolvedValueOnce([{ name: 'React' }]);

      const result = await createPortfolioItem('user-1', {
        title: 'T', description: 'D', images: ['img.jpg'], skills: ['InvalidSkill'],
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create portfolio item with valid skills', async () => {
      const { createPortfolioItem } = await importModule();
      mockSkillRepository.getAllSkills.mockResolvedValueOnce([{ name: 'React' }]);
      mockPortfolioRepository.create.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'T', description: 'D',
        images: '["img.jpg"]', skills: '["React"]', completed_at: null,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createPortfolioItem('user-1', {
        title: 'T', description: 'D', images: ['img.jpg'], skills: ['React'],
      });
      expect(result.success).toBe(true);
    });

    it('should handle updatePortfolioItem when not found', async () => {
      const { updatePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle updatePortfolioItem when unauthorized', async () => {
      const { updatePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle updatePortfolioItem with no updates', async () => {
      const { updatePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', title: 'T', description: 'D', images: '["img.jpg"]',
        skills: '["React"]', created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updatePortfolioItem('pi-1', 'user-1', {});
      expect(result.success).toBe(true);
    });

    it('should handle deletePortfolioItem when not found', async () => {
      const { deletePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await deletePortfolioItem('pi-1', 'user-1');
      expect(result.success).toBe(false);
    });

    it('should handle deletePortfolioItem when unauthorized', async () => {
      const { deletePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await deletePortfolioItem('pi-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle deletePortfolioItem with image cleanup', async () => {
      const { deletePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', images: '["http://example.com/img.jpg"]',
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(undefined);

      const result = await deletePortfolioItem('pi-1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('should handle deletePortfolioItem with non-string images', async () => {
      const { deletePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', images: ['http://example.com/img.jpg'],
      });
      mockPortfolioRepository.delete.mockResolvedValueOnce(undefined);

      const result = await deletePortfolioItem('pi-1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('should handle getPortfolioItem when not found', async () => {
      const { getPortfolioItem } = await importModule();
      mockPortfolioRepository.getById.mockResolvedValueOnce(null);

      const result = await getPortfolioItem('pi-1');
      expect(result.success).toBe(false);
    });

    it('should handle createPortfolioItem exception', async () => {
      const { createPortfolioItem } = await importModule();
      mockPortfolioRepository.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await createPortfolioItem('user-1', {
        title: 'T', description: 'D', images: ['img.jpg'],
      });
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // 9. saved-search-service.ts (3 branches)
  // =====================================================================
  describe('Saved Search Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/saved-search-service.js');

    it('should return error when no filters provided', async () => {
      const { createSavedSearch } = await importModule();
      const result = await createSavedSearch('user-1', {
        name: 'Test', searchType: 'project', filters: {}, notifyOnNew: false,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle updateSavedSearch when not found', async () => {
      const { updateSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await updateSavedSearch('s1', 'user-1', { name: 'New' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle updateSavedSearch when unauthorized', async () => {
      const { updateSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await updateSavedSearch('s1', 'user-1', { name: 'New' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle updateSavedSearch with no updates', async () => {
      const { updateSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 's1', user_id: 'user-1', name: 'Test', search_type: 'project',
        filters: '{}', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updateSavedSearch('s1', 'user-1', {});
      expect(result.success).toBe(true);
    });

    it('should handle updateSavedSearch when update returns null', async () => {
      const { updateSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce(null);

      const result = await updateSavedSearch('s1', 'user-1', { name: 'New' });
      expect(result.success).toBe(false);
    });

    it('should handle deleteSavedSearch when not found', async () => {
      const { deleteSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await deleteSavedSearch('s1', 'user-1');
      expect(result.success).toBe(false);
    });

    it('should handle deleteSavedSearch when unauthorized', async () => {
      const { deleteSavedSearch } = await importModule();
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await deleteSavedSearch('s1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle executeSavedSearch when not found', async () => {
      const { executeSavedSearch } = await importModule();
      mockSavedSearchRepository.getById.mockResolvedValueOnce(null);

      const result = await executeSavedSearch('s1', 'user-1');
      expect(result.success).toBe(false);
    });

    it('should handle executeSavedSearch when unauthorized', async () => {
      const { executeSavedSearch } = await importModule();
      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 's1', user_id: 'other-user', search_type: 'project', filters: '{}',
      });

      const result = await executeSavedSearch('s1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle executeSavedSearch for projects', async () => {
      const { executeSavedSearch } = await importModule();
      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 's1', user_id: 'user-1', search_type: 'project',
        filters: JSON.stringify({ skills: ['React'], minBudget: 100, maxBudget: 5000, keyword: 'test' }),
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'p1', title: 'Test Project', budget: 500, required_skills: [{ skill_name: 'React' }], created_at: '2025-01-01', description: 'test desc' },
          { id: 'p2', title: 'Other', budget: 50, required_skills: [{ skill_name: 'Vue' }], created_at: '2025-01-01', description: 'other' },
        ],
        total: 2,
      });

      const result = await executeSavedSearch('s1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('should handle executeSavedSearch for freelancers', async () => {
      const { executeSavedSearch } = await importModule();
      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 's1', user_id: 'user-1', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['React'], minHourlyRate: 10, maxHourlyRate: 100 }),
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [
          { id: 'fp1', skills: [{ name: 'React' }], hourly_rate: 50, created_at: '2025-01-01' },
          { id: 'fp2', skills: [{ name: 'Vue' }], hourly_rate: 200, created_at: '2025-01-01' },
        ],
        total: 2,
      });

      const result = await executeSavedSearch('s1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('should handle createSavedSearch exception', async () => {
      const { createSavedSearch } = await importModule();
      mockSavedSearchRepository.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await createSavedSearch('user-1', {
        name: 'Test', searchType: 'project', filters: { status: 'open' }, notifyOnNew: false,
      });
      expect(result.success).toBe(false);
    });

    it('should handle getUserSavedSearches exception', async () => {
      const { getUserSavedSearches } = await importModule();
      mockSavedSearchRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserSavedSearches('user-1');
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // 10. dispute-service.ts (2 branches)
  // =====================================================================
  describe('Dispute Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/dispute-service.js');

    it('should return error when contract not active', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'completed',
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_CONTRACT_STATUS');
    });

    it('should return error when initiator not part of contract', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'unknown', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return error when project not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should return error when milestone already disputed', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'disputed', amount: 100 }],
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_DISPUTED');
    });

    it('should return error when milestone not submitted', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'pending', amount: 100 }],
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return error when active dispute already exists', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce({ id: 'd-existing' });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_DISPUTE');
    });

    it('should handle submitEvidence for resolved dispute', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
      });

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle submitEvidence when submitter not part of contract', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        employer_id: 'e1', freelancer_id: 'f1',
      });

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'unknown', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle resolveDispute when not admin', async () => {
      const { resolveDispute } = await importModule();

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'user',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle resolveDispute when already resolved', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_RESOLVED');
    });

    it('should handle resolveDispute with split decision', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'split', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNSUPPORTED_DECISION');
    });

    it('should handle getDisputesByContract when unauthorized', async () => {
      const { getDisputesByContract } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        employer_id: 'e1', freelancer_id: 'f1',
      });

      const result = await getDisputesByContract('c1', 'unknown');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle getAllDisputes with hasMore', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepository.getAllDisputes.mockResolvedValueOnce({
        items: [{ id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'i1', reason: 'r', evidence: [], status: 'open' }],
        total: 1, hasMore: true,
      });

      const result = await getAllDisputes('admin', 'admin', { limit: 1, offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.continuationToken).toBe('1');
    });

    it('should handle getAllDisputes for non-admin', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepository.getDisputesByUserId.mockResolvedValueOnce({
        items: [], total: 0, hasMore: false,
      });

      const result = await getAllDisputes('user-1', 'user', {});
      expect(result.success).toBe(true);
    });

    it('should handle getAllDisputes with status filter', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepository.getAllDisputes.mockResolvedValueOnce({
        items: [], total: 0, hasMore: false,
      });

      const result = await getAllDisputes('admin', 'admin', { status: 'open' });
      expect(result.success).toBe(true);
    });

    it('should handle getAllDisputes exception', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepository.getAllDisputes.mockRejectedValueOnce(new Error('DB error'));

      const result = await getAllDisputes('admin', 'admin', {});
      expect(result.success).toBe(false);
    });

    it('should handle getDisputeById when not found', async () => {
      const { getDisputeById } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await getDisputeById('d1');
      expect(result.success).toBe(false);
    });

    it('should handle getOpenDisputes', async () => {
      const { getOpenDisputes } = await importModule();
      mockDisputeRepository.getDisputesByStatus
        .mockResolvedValueOnce({ items: [{ id: 'd1', status: 'open' }], total: 1 })
        .mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getOpenDisputes();
      expect(result.success).toBe(true);
    });

    it('should handle getDisputesByInitiator', async () => {
      const { getDisputesByInitiator } = await importModule();
      mockDisputeRepository.getDisputesByInitiator.mockResolvedValueOnce({
        items: [{ id: 'd1' }], total: 1,
      });

      const result = await getDisputesByInitiator('user-1');
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 11. favorite-service.ts (1 branch each)
  // =====================================================================
  describe('Favorite Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/favorite-service.js');

    it('should return error when already favorited', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce({ id: 'fav-1' });

      const result = await addFavorite('user-1', 'project', 'proj-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_FAVORITED');
    });

    it('should return error when target not found (project)', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockProjectRepository.getById.mockResolvedValueOnce(null);

      const result = await addFavorite('user-1', 'project', 'proj-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('TARGET_NOT_FOUND');
    });

    it('should return error when target not found (freelancer)', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockUserRepository.getUserById.mockResolvedValueOnce(null);

      const result = await addFavorite('user-1', 'freelancer', 'user-2');
      expect(result.success).toBe(false);
    });

    it('should handle addFavorite exception', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await addFavorite('user-1', 'project', 'proj-1');
      expect(result.success).toBe(false);
    });

    it('should handle removeFavorite exception', async () => {
      const { removeFavorite } = await importModule();
      mockFavoriteRepository.removeByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await removeFavorite('user-1', 'project', 'proj-1');
      expect(result.success).toBe(false);
    });

    it('should handle getUserFavorites exception', async () => {
      const { getUserFavorites } = await importModule();
      mockFavoriteRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserFavorites('user-1');
      expect(result.success).toBe(false);
    });

    it('should handle isFavorited exception', async () => {
      const { isFavorited } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await isFavorited('user-1', 'project', 'proj-1');
      expect(result.success).toBe(false);
    });

    it('should handle addFavorite with project target', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockProjectRepository.getById.mockResolvedValueOnce({ id: 'proj-1' });
      mockFavoriteRepository.create.mockResolvedValueOnce({
        id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'proj-1',
        created_at: '2025-01-01',
      });

      const result = await addFavorite('user-1', 'project', 'proj-1');
      expect(result.success).toBe(true);
    });

    it('should handle addFavorite with freelancer target', async () => {
      const { addFavorite } = await importModule();
      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'user-2' });
      mockFavoriteRepository.create.mockResolvedValueOnce({
        id: 'fav-1', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2',
        created_at: '2025-01-01',
      });

      const result = await addFavorite('user-1', 'freelancer', 'user-2');
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 12. email-preference-service.ts (1 branch each)
  // =====================================================================
  describe('Email Preference Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/email-preference-service.js');

    it('should create default preferences when none exist', async () => {
      const { getEmailPreferences } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'ep-1', user_id: 'user-1', proposal_received: true, proposal_accepted: true,
        milestone_updates: true, payment_notifications: true, dispute_notifications: true,
        marketing_emails: false, weekly_digest: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await getEmailPreferences('user-1');
      expect(result.success).toBe(true);
    });

    it('should return existing preferences', async () => {
      const { getEmailPreferences } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{
          $id: 'ep-1', user_id: 'user-1', proposal_received: true,
          created_at: '2025-01-01', updated_at: '2025-01-01',
        }],
        total: 1,
      });

      const result = await getEmailPreferences('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle updateEmailPreferences with no matching keys', async () => {
      const { updateEmailPreferences } = await importModule();
      // proposalReceived is camelCase, but ALLOWED_COLUMNS uses snake_case
      // So updateData will be empty, falling through to getEmailPreferences
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{
          $id: 'ep-1', user_id: 'user-1', proposal_received: true,
          created_at: '2025-01-01', updated_at: '2025-01-01',
        }],
        total: 1,
      });

      const result = await updateEmailPreferences('user-1', { proposalReceived: false } as any);
      // Falls through to getEmailPreferences which returns existing prefs
      expect(result.success).toBe(true);
    });

    it('should handle unsubscribeAll when no preferences exist', async () => {
      const { unsubscribeAll } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await unsubscribeAll('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle shouldSendEmail when preferences not found', async () => {
      const { shouldSendEmail } = await importModule();
      mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
      mockDatabases.createDocument.mockResolvedValue({
        $id: 'ep-1', user_id: 'user-1', proposal_received: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await shouldSendEmail('user-1', 'proposal_received');
      expect(typeof result).toBe('boolean');
    });
  });

  // =====================================================================
  // 13. user-custom-skill-service.ts (1 branch each)
  // =====================================================================
  describe('User Custom Skill Service - Direct Branch Coverage', () => {
    const importModule = async () => import('../../services/user-custom-skill-service.js');

    it('should return error when skill exists globally', async () => {
      const { createUserCustomSkill } = await importModule();
      const { searchSkills } = await import('../../services/skill-service.ts');
      (searchSkills as jest.Mock).mockResolvedValueOnce([
        { id: 's1', name: 'React', categoryName: 'Frontend' },
      ]);

      const result = await createUserCustomSkill('u1', 'John', {
        name: 'React', description: 'Frontend framework', yearsOfExperience: 3,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('SKILL_EXISTS_GLOBALLY');
    });

    it('should return error when user already has this skill', async () => {
      const { createUserCustomSkill } = await importModule();
      const { searchSkills } = await import('../../services/skill-service.ts');
      (searchSkills as jest.Mock).mockResolvedValueOnce([]);
      const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
      (userCustomSkillRepository as any).getUserCustomSkills = jest.fn().mockResolvedValueOnce([
        { id: 'sk-1', name: 'React' },
      ]);

      const result = await createUserCustomSkill('u1', 'John', {
        name: 'React', description: 'Frontend framework', yearsOfExperience: 3,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
    });

    it('should return error when custom skill not found by id', async () => {
      const { getUserCustomSkillById } = await importModule();
      const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
      (userCustomSkillRepository as any).getUserCustomSkillById = jest.fn().mockResolvedValueOnce(null);

      const result = await getUserCustomSkillById('sk-1', 'u1');
      expect(result.success).toBe(false);
    });

    it('should handle searchUserCustomSkills', async () => {
      const { searchUserCustomSkills } = await importModule();
      const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
      (userCustomSkillRepository as any).searchUserCustomSkills = jest.fn().mockResolvedValueOnce([
        { id: 'sk-1', user_id: 'u1', name: 'React', description: 'Frontend', years_of_experience: 3, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await searchUserCustomSkills('u1', 'React');
      expect(result.length).toBe(1);
    });
  });
});
