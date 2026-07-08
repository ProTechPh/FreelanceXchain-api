// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ==================== Logger mock ====================
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ==================== Collections mock ====================
jest.unstable_mockModule(resolveModule('src/config/collections.ts'), () => ({
  COLLECTIONS: {
    USERS: 'users', PROJECTS: 'projects', CONTRACTS: 'contracts',
    REVIEWS: 'reviews', PROPOSALS: 'proposals', NOTIFICATIONS: 'notifications',
    DISPUTES: 'disputes',
  },
}));

// ==================== Appwrite mock ====================
const mockDatabases = {
  listDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0 }),
  getDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  createDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  updateDocument: jest.fn().mockResolvedValue({ $id: 'doc-id' }),
  deleteDocument: jest.fn().mockResolvedValue({}),
};
(globalThis as any).__mockDatabases = mockDatabases;

const mockStorage = {
  deleteFile: jest.fn().mockResolvedValue({}),
  listFiles: jest.fn().mockResolvedValue({ files: [], total: 0 }),
  getFile: jest.fn().mockResolvedValue({ $id: 'f1', name: 'test-file.txt' }),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  DATABASE_ID: 'freelancexchain',
  databases: mockDatabases,
  storage: mockStorage,
  BUCKETS: {
    PORTFOLIO_IMAGES: 'portfolio-images',
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
  },
  Query: {
    equal: jest.fn(),
    notEqual: jest.fn(),
    orderDesc: jest.fn(),
    orderAsc: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
  },
}));

// ==================== ID mock ====================
jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

// ==================== Entity Mapper mock ====================
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapContractFromEntity: (e: any) => ({
    id: e.id || 'c1', projectId: e.project_id || 'p1',
    freelancerId: e.freelancer_id || 'f1', employerId: e.employer_id || 'e1',
    status: e.status || 'active', title: e.title || 'Contract',
    totalAmount: e.total_amount || 1000, rushFee: e.rush_fee || 0,
    baseAmount: e.base_amount || 1000,
  }),
  mapProjectFromEntity: (e: any) => ({
    id: e.id || 'p1', title: e.title || 'Project',
    milestones: (e.milestones || []).map((m: any) => ({
      id: m.id, title: m.title || 'Milestone', status: m.status, amount: m.amount || 0,
    })),
  }),
  mapMilestoneFromEntity: (e: any) => ({
    id: e.id || 'm1', title: e.title || 'Milestone', status: e.status, amount: e.amount || 0,
  }),
  mapDisputeFromEntity: (e: any) => ({
    id: e.id || 'd1', contractId: e.contract_id || 'c1',
    milestoneId: e.milestone_id || 'm1', initiatorId: e.initiator_id || 'i1',
    reason: e.reason || 'reason', evidence: e.evidence || [],
    status: e.status || 'open', resolution: e.resolution || null,
  }),
  mapFreelancerProfileFromEntity: (e: any) => ({
    id: e.id || 'p1', userId: e.user_id || 'u1', name: e.name || null,
    nationality: e.nationality || null, bio: e.bio || '',
    hourlyRate: e.hourly_rate || 0, skills: e.skills || [],
    experience: e.experience || [], availability: e.availability || 'available',
    createdAt: new Date(), updatedAt: new Date(),
  }),
  mapEmployerProfileFromEntity: (e: any) => ({
    id: e.id || 'p1', userId: e.user_id || 'u1', name: e.name || null,
    nationality: e.nationality || null, companyName: e.company_name || '',
    description: e.description || '', industry: e.industry || '',
    createdAt: new Date(), updatedAt: new Date(),
  }),
  mapRushUpgradeRequestFromEntity: (e: any) => ({
    id: e.id || 'rr1', contractId: e.contract_id || 'c1',
    requestedBy: e.requested_by || 'e1',
    proposedPercentage: e.proposed_percentage || 0,
    counterPercentage: e.counter_percentage || null,
    status: e.status || 'pending',
    respondedBy: e.responded_by || null,
    respondedAt: e.responded_at ? new Date(e.responded_at) : null,
    createdAt: new Date(e.created_at || '2025-01-01'),
    updatedAt: new Date(e.updated_at || '2025-01-01'),
  }),
}));

// ==================== Portfolio Service mocks ====================
const mockPortfolioRepository = {
  create: jest.fn(),
  findOwnerById: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  delete: jest.fn(),
  findByFreelancer: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/portfolio-repository.ts'), () => ({
  portfolioRepository: mockPortfolioRepository,
}));

const mockSkillRepository = { getAllSkills: jest.fn() };
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  extractFileIdFromUrl: jest.fn().mockReturnValue('file-id-123'),
}));

// ==================== Matching Service mocks ====================
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: {
    getAllOpenProjects: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findProjectById: jest.fn(),
    updateProject: jest.fn(),
    searchProjects: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    getProjectsBySkills: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    getProjectsByBudgetRange: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  },
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

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getActiveSkills: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: jest.fn().mockResolvedValue({ success: true, data: { score: 50 } }),
}));

const mockAiClient = {
  analyzeSkillMatch: jest.fn().mockReturnValue({ matchScore: 75, matchedSkills: ['React'], missingSkills: [], reasoning: 'Good match' }),
  extractSkills: jest.fn().mockReturnValue([]),
  keywordMatchSkills: jest.fn().mockReturnValue({ matchScore: 50, matchedSkills: ['JS'], missingSkills: ['Python'], reasoning: 'Partial' }),
  keywordExtractSkills: jest.fn().mockReturnValue([]),
  isAIAvailable: jest.fn().mockReturnValue(false),
  isAIError: jest.fn().mockReturnValue(false),
  generateContent: jest.fn().mockResolvedValue(''),
  parseJsonResponse: jest.fn().mockReturnValue(null),
  SKILL_GAP_PROMPT: 'Analyze skills: {currentSkills}',
};
jest.unstable_mockModule(resolveModule('src/services/ai-client.ts'), () => mockAiClient);

// ==================== Freelancer Profile Service mocks ====================
const mockGetProfileDataFromKyc = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  getProfileDataFromKyc: mockGetProfileDataFromKyc,
}));

// ==================== Milestone Service mocks ====================
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

const mockMilestoneRepository = {
  getById: jest.fn(),
  update: jest.fn(),
  findByContract: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn(),
  updateContract: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

// ==================== Dispute Service mocks ====================
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: {
    getDisputeById: jest.fn(),
    getDisputeByMilestone: jest.fn(),
    createDispute: jest.fn(),
    updateDispute: jest.fn(),
    getAllDisputesByContract: jest.fn(),
    getDisputesByStatus: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    getDisputesByInitiator: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    getAllDisputes: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    getDisputesByUserId: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-evidence-repository.ts'), () => ({
  disputeEvidenceRepository: { createEvidence: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserById: jest.fn().mockResolvedValue(null),
    getUsersByRole: jest.fn().mockResolvedValue([]),
  },
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

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: jest.fn(),
}));

// ==================== Employer Profile Service mocks ====================
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: {
    getProfileByUserId: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

// ==================== Blockchain mocks ====================
jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
  confirmTransaction: jest.fn().mockResolvedValue({ hash: '0xhash', blockNumber: 1, gasUsed: '21000' }),
  generateWalletAddress: jest.fn().mockReturnValue('0xmockaddress'),
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-milestone-record-repository.ts'), () => ({
  blockchainMilestoneRecordRepository: {
    findByMilestoneIdHash: jest.fn().mockResolvedValue(null),
    findByWallet: jest.fn().mockResolvedValue([]),
    createMilestoneRecord: jest.fn(),
    updateMilestoneRecord: jest.fn(),
    queryAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-rating-repository.ts'), () => ({
  blockchainRatingRepository: {
    findByRatee: jest.fn().mockResolvedValue({ items: [] }),
    findByRater: jest.fn().mockResolvedValue({ items: [] }),
    getRatingById: jest.fn().mockResolvedValue(null),
    createRating: jest.fn(),
    queryAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
    findByContractAndRater: jest.fn().mockResolvedValue(null),
  },
}));

// ==================== Rush Upgrade mocks ====================
jest.unstable_mockModule(resolveModule('src/repositories/rush-upgrade-request-repository.ts'), () => ({
  rushUpgradeRequestRepository: {
    getPendingRequestByContract: jest.fn().mockResolvedValue(null),
    createRequest: jest.fn(),
    getRequestById: jest.fn(),
    updateRequest: jest.fn(),
    getRequestsByContract: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: { createNotification: jest.fn() },
}));

// =====================================================================
// TESTS
// =====================================================================
describe('Branch Coverage Gaps - Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
  });

  // =====================================================================
  // 1. portfolio-service.ts (10 branches)
  // =====================================================================
  describe('Portfolio Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/portfolio-service.js');

    it('should handle createPortfolioItem with skills undefined', async () => {
      const { createPortfolioItem } = await importModule();
      mockPortfolioRepository.create.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'T',
        images: '["img.jpg"]', created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createPortfolioItem('user-1', {
        title: 'T', description: 'D', images: ['img.jpg'],
      });
      expect(result.success).toBe(true);
    });

    it('should parse images/skills as array when already non-string', async () => {
      const { createPortfolioItem } = await importModule();
      mockPortfolioRepository.create.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'T',
        images: ['img.jpg'], skills: ['React'],
        completed_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createPortfolioItem('user-1', {
        title: 'T', description: 'D', images: ['img.jpg'], completedAt: '2025-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('should handle updatePortfolioItem with projectUrl and completedAt undefined', async () => {
      const { updatePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.update.mockResolvedValueOnce({
        id: 'pi-1', title: 'New', created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updatePortfolioItem('pi-1', 'user-1', { title: 'New' });
      expect(result.success).toBe(true);
    });

    it('should handle updatePortfolioItem with non-string images/skills in existing', async () => {
      const { updatePortfolioItem } = await importModule();
      mockPortfolioRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'Original',
        description: 'D', project_url: null, images: ['img.jpg'],
        skills: ['React'], completed_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updatePortfolioItem('pi-1', 'user-1', {});
      expect(result.success).toBe(true);
    });

    it('should handle getFreelancerPortfolio with non-string images/skills', async () => {
      const { getFreelancerPortfolio } = await importModule();
      mockPortfolioRepository.findByFreelancer.mockResolvedValueOnce([{
        id: 'pi-1', freelancer_id: 'user-1', title: 'P1',
        images: ['img.jpg'], skills: ['React'],
        completed_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      }]);

      const result = await getFreelancerPortfolio('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle getPortfolioItem with non-string images/skills', async () => {
      const { getPortfolioItem } = await importModule();
      mockPortfolioRepository.getById.mockResolvedValueOnce({
        id: 'pi-1', freelancer_id: 'user-1', title: 'P1',
        images: ['img.jpg'], skills: ['React'],
        completed_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await getPortfolioItem('pi-1');
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 2. matching-service.ts (9 branches)
  // =====================================================================
  describe('Matching Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/matching-service.js');

    it('should handle freelancerSkillToInfo with null name', async () => {
      const { calculateMatchScore } = await importModule();
      const result = calculateMatchScore(
        [{ skillId: '', skillName: '', categoryId: '', yearsOfExperience: 3 }],
        [{ skillId: '1', skillName: 'React', categoryId: 'c1' }]
      );
      expect(result).toBeDefined();
    });

    it('should handle projectSkillToInfo with years_of_experience undefined', async () => {
      const { calculateMatchScore } = await importModule();
      const result = calculateMatchScore(
        [{ skillId: '1', skillName: 'React', categoryId: 'c1' }],
        [{ skillId: '1', skillName: 'React', categoryId: 'c1' }]
      );
      expect(result.matchScore).toBeGreaterThan(0);
    });

    it('should handle extractSkillsFromText with empty text', async () => {
      const { extractSkillsFromText } = await importModule();
      const result = await extractSkillsFromText('');
      expect(result.success).toBe(false);
    });

    it('should handle analyzeSkillGaps when AI not available', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle analyzeSkillGaps when AI returns non-string', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockAiClient.isAIAvailable.mockReturnValueOnce(true);
      mockAiClient.generateContent.mockResolvedValueOnce(42);

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle analyzeSkillGaps when parseJsonResponse returns null', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockAiClient.isAIAvailable.mockReturnValueOnce(true);
      mockAiClient.generateContent.mockResolvedValueOnce('valid response');
      mockAiClient.parseJsonResponse.mockReturnValueOnce(null);

      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'user-1', skills: [{ name: 'React' }], experience: [],
      });

      const result = await analyzeSkillGaps('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle analyzeSkillGaps with invalid demandLevel', async () => {
      const { analyzeSkillGaps } = await importModule();
      mockAiClient.isAIAvailable.mockReturnValueOnce(true);
      mockAiClient.generateContent.mockResolvedValueOnce('valid response');
      mockAiClient.parseJsonResponse.mockReturnValueOnce({
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
    });
  });

  // =====================================================================
  // 3. freelancer-profile-service.ts (7 branches)
  // =====================================================================
  describe('Freelancer Profile Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/freelancer-profile-service.js');

    it('should create profile with availability defaulting to available', async () => {
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

    it('should create profile from KYC with defaults when no bio/rate/availability', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: true, data: { name: 'John', nationality: 'US' },
      });
      mockFreelancerProfileRepository.createProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', name: 'John', nationality: 'US',
        bio: "Hi, I'm John. I'm a verified freelancer ready to work on your projects.",
        hourly_rate: 0, skills: [], experience: [], availability: 'available',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(true);
    });

    it('should create profile from KYC with null name for default bio', async () => {
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

    it('should create profile from KYC with empty message fallback', async () => {
      const { createProfileFromKyc } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: false, error: { message: '' },
      });

      const result = await createProfileFromKyc('u1');
      expect(result.success).toBe(false);
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

      const result = await removeSkillFromProfile('u1', 'JavaScript');
      expect(result.success).toBe(true);
    });

    it('should handle addExperience with endDate undefined', async () => {
      const { addExperience } = await importModule();
      mockFreelancerProfileRepository.getProfileByUserId.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [],
      });
      mockFreelancerProfileRepository.updateProfile.mockResolvedValueOnce({
        id: 'p1', user_id: 'u1', skills: [], experience: [{
          id: 'exp-1', title: 'Dev', company: 'Co', description: 'Work',
          start_date: '2020-01-01', end_date: null,
        }],
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await addExperience('u1', {
        title: 'Dev', company: 'Co', description: 'Work', startDate: '2020-01-01',
      });
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 4. reputation-aggregation-service.ts (5 branches)
  // =====================================================================
  describe('Reputation Aggregation Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/reputation-aggregation-service.js');

    it('should handle reviews with rating=0', async () => {
      const { getAggregatedScore } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'r1', rating: 0, work_quality: null, communication: null, professionalism: null, would_work_again: false }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getAggregatedScore('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle milestones as non-string', async () => {
      const { getAggregatedScore } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'r1', rating: 5, work_quality: 5, communication: 5, professionalism: 5, would_work_again: true }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 1 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'p1' }], total: 1 });
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        milestones: [{ status: 'approved', approved_at: '2025-01-14', due_date: '2025-01-15' }],
      });

      const result = await getAggregatedScore('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle zero approved milestones', async () => {
      const { getAggregatedScore } = await importModule();
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'r1', rating: 5, work_quality: 5, communication: 5, professionalism: 5, would_work_again: true }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 1 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'p1' }], total: 1 });
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1', milestones: [{ status: 'pending' }],
      });

      const result = await getAggregatedScore('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle reviews with null comment', async () => {
      const { getReputationBreakdown } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'r1', rating: 5, comment: null, reviewer_id: 'u1', project_id: 'p1', created_at: '2025-01-01' }],
        total: 1,
      });
      mockDatabases.getDocument
        .mockResolvedValueOnce({ $id: 'u1', name: 'Alice' })
        .mockResolvedValueOnce({ $id: 'p1', title: 'Project A' });

      const result = await getReputationBreakdown('user-1');
      expect(result.success).toBe(true);
      expect(result.data.recentRatings[0].comment).toBe('');
    });

    it('should handle leaderboard with null user name', async () => {
      const { getReputationLeaderboard } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'r1', reviewee_id: 'user-1', rating: 5 },
          { $id: 'r2', reviewee_id: 'user-1', rating: 5 },
          { $id: 'r3', reviewee_id: 'user-1', rating: 5 },
        ],
        total: 3,
      });
      mockDatabases.getDocument.mockResolvedValueOnce({ $id: 'user-1', name: null });

      const result = await getReputationLeaderboard();
      expect(result.success).toBe(true);
      expect(result.data[0].userName).toBe('Unknown');
    });
  });

  // =====================================================================
  // 5. milestone-service.ts (4 branches)
  // =====================================================================
  describe('Milestone Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/milestone-service.js');

    it('should increment revision count on rejected milestone resubmission', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'rejected', contract_id: 'c-1', revision_count: 2,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1', status: 'active',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce({ status: 'submitted' });

      const result = await submitMilestone({
        milestoneId: 'ms-1', freelancerId: 'f1', deliverables: ['file.pdf'],
      });
      expect(result.success).toBe(true);
    });

    it('should handle notification creation failure on submit', async () => {
      const { submitMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'pending', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1', status: 'active',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce({ status: 'submitted' });
      mockCreateNotification.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const result = await submitMilestone({
        milestoneId: 'ms-1', freelancerId: 'f1', deliverables: [],
      });
      expect(result.success).toBe(true);
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

      const result = await rejectMilestone({
        milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad', requestRevision: false,
      });
      expect(result.success).toBe(true);
    });

    it('should handle notification creation failure on reject', async () => {
      const { rejectMilestone } = await importModule();
      mockMilestoneRepository.getById.mockResolvedValueOnce({
        id: 'ms-1', title: 'D', status: 'submitted', contract_id: 'c-1', revision_count: 0,
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        freelancer_id: 'f1', employer_id: 'e1', project_id: 'p1',
      });
      mockMilestoneRepository.update.mockResolvedValueOnce({ status: 'rejected' });
      mockCreateNotification.mockResolvedValueOnce({ success: false, error: { message: 'fail' } });

      const result = await rejectMilestone({
        milestoneId: 'ms-1', employerId: 'e1', reason: 'Bad', requestRevision: true,
      });
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 6. file-service.ts (2 branches)
  // =====================================================================
  describe('File Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/file-service.js');

    it('should handle getUserFiles when result.files is falsy', async () => {
      const { getUserFiles } = await importModule();
      mockStorage.listFiles.mockResolvedValueOnce({ files: null });

      const result = await getUserFiles('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle getFileQuota when data is undefined', async () => {
      const { getFileQuota } = await importModule();
      mockStorage.listFiles.mockResolvedValue({ files: null });

      const result = await getFileQuota('user-1');
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 7. dispute-service.ts (2 branches)
  // =====================================================================
  describe('Dispute Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/dispute-service.js');

    it('should return correct message for approved milestone', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });

      const { projectRepository } = await import('../../repositories/project-repository.ts');
      projectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'approved', amount: 100 }],
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Cannot dispute an approved milestone');
    });

    it('should handle getAllDisputes with hasMore=true', async () => {
      const { getAllDisputes } = await importModule();
      const { disputeRepository } = await import('../../repositories/dispute-repository.ts');
      disputeRepository.getAllDisputes.mockResolvedValueOnce({
        items: [{ id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'i1', reason: 'r', evidence: [], status: 'open' }],
        total: 1, hasMore: true,
      });

      const result = await getAllDisputes('admin-user', 'admin', { limit: 1, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.data.continuationToken).toBe('1');
    });
  });

  // =====================================================================
  // 8. email-delivery-service.ts (1 branch)
  // =====================================================================
  describe('Email Delivery Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/email-delivery-service.js');

    it('should use default email from when EMAIL_FROM is not set', async () => {
      const originalEnv = process.env['EMAIL_FROM'];
      const originalApiToken = process.env['CLOUDFLARE_API_TOKEN'];
      const originalAccountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
      delete process.env['EMAIL_FROM'];
      delete process.env['CLOUDFLARE_API_TOKEN'];
      delete process.env['CLOUDFLARE_ACCOUNT_ID'];

      const { testEmailConfiguration } = await importModule();
      const result = await testEmailConfiguration();
      expect(result.success).toBe(false);

      if (originalEnv) process.env['EMAIL_FROM'] = originalEnv;
      if (originalApiToken) process.env['CLOUDFLARE_API_TOKEN'] = originalApiToken;
      if (originalAccountId) process.env['CLOUDFLARE_ACCOUNT_ID'] = originalAccountId;
    });
  });

  // =====================================================================
  // 9. employer-profile-service.ts (1 branch)
  // =====================================================================
  describe('Employer Profile Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/employer-profile-service.js');

    it('should handle KYC error with empty message', async () => {
      const { createEmployerProfileFromKyc } = await importModule();
      const { employerProfileRepository } = await import('../../repositories/employer-profile-repository.ts');
      employerProfileRepository.getProfileByUserId.mockResolvedValueOnce(null);
      mockGetProfileDataFromKyc.mockResolvedValueOnce({
        success: false, error: { message: '' },
      });

      const result = await createEmployerProfileFromKyc('u1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('KYC_NOT_APPROVED');
    });
  });

  // =====================================================================
  // 10. milestone-registry.ts (1 branch)
  // =====================================================================
  describe('Milestone Registry - Branch Coverage', () => {
    const importModule = async () => import('../../services/milestone-registry.js');

    it('should handle entityToRecord with undefined completed_at', async () => {
      const { getMilestoneFromRegistry } = await importModule();
      const { blockchainMilestoneRecordRepository } = await import('../../repositories/blockchain-milestone-record-repository.ts');
      blockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce({
        milestone_id_hash: '0xhash', contract_id_hash: '0xchash',
        work_hash: '0xwhash', freelancer_wallet: '0xfl', employer_wallet: '0xemp',
        amount: 100, status: 'submitted', submitted_at: Date.now(),
        completed_at: undefined, title: 'Test', transaction_hash: '0xtx', block_number: 1,
      });

      const result = await getMilestoneFromRegistry('ms-1');
      expect(result).not.toBeNull();
      expect(result!.completedAt).toBeNull();
    });
  });

  // =====================================================================
  // 11. reputation-contract.ts (1 branch)
  // =====================================================================
  describe('Reputation Contract - Branch Coverage', () => {
    const importModule = async () => import('../../services/reputation-contract.js');

    it('should handle entityToRating with undefined comment', async () => {
      const { getRatingById } = await importModule();
      const { blockchainRatingRepository } = await import('../../repositories/blockchain-rating-repository.ts');
      blockchainRatingRepository.getRatingById.mockResolvedValueOnce({
        id: 'r1', contract_id: 'c1', rater_id: 'u1', ratee_id: 'u2',
        rating: 5, comment: undefined, timestamp: Date.now(), transaction_hash: '0xtx',
      });

      const result = await getRatingById('r1');
      expect(result).not.toBeNull();
      expect(result!.comment).toBeUndefined();
    });
  });

  // =====================================================================
  // 12. rush-upgrade-service.ts (2 branches)
  // =====================================================================
  describe('Rush Upgrade Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/rush-upgrade-service.js');

    it('should handle missing project title with fallback', async () => {
      const { requestRushUpgrade } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1',
        status: 'active', rush_fee: 0, base_amount: 1000,
      });
      const { rushUpgradeRequestRepository } = await import('../../repositories/rush-upgrade-request-repository.ts');
      rushUpgradeRequestRepository.getPendingRequestByContract.mockResolvedValueOnce(null);
      rushUpgradeRequestRepository.createRequest.mockResolvedValueOnce({
        id: 'rr1', contract_id: 'c1', proposed_percentage: 25, counter_percentage: null,
        status: 'pending', requested_by: 'e1', responded_by: null, responded_at: null,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      const { projectRepository } = await import('../../repositories/project-repository.ts');
      projectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await requestRushUpgrade('e1', { contractId: 'c1', proposedPercentage: 25 });
      expect(result.success).toBe(true);
    });

    it('should use counter_percentage when available on accept', async () => {
      const { respondToRushUpgrade } = await importModule();
      const { rushUpgradeRequestRepository } = await import('../../repositories/rush-upgrade-request-repository.ts');
      rushUpgradeRequestRepository.getRequestById.mockResolvedValueOnce({
        id: 'rr1', contract_id: 'c1', proposed_percentage: 25, counter_percentage: 30,
        status: 'pending', requested_by: 'e1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1',
        status: 'active', base_amount: 1000,
      });
      rushUpgradeRequestRepository.updateRequest.mockResolvedValueOnce({
        id: 'rr1', contract_id: 'c1', status: 'accepted',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockContractRepository.updateContract.mockResolvedValueOnce({
        id: 'c1', rush_fee: 300, total_amount: 1300,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      const { projectRepository } = await import('../../repositories/project-repository.ts');
      projectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await respondToRushUpgrade('f1', { requestId: 'rr1', action: 'accept' });
      expect(result.success).toBe(true);
    });
  });

  // =====================================================================
  // 13. search-service.ts (1 branch)
  // =====================================================================
  describe('Search Service - Branch Coverage', () => {
    const importModule = async () => import('../../services/search-service.js');

    it('should handle buildSearchResult with offset undefined', async () => {
      const { searchProjects } = await importModule();
      const { projectRepository } = await import('../../repositories/project-repository.ts');
      projectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [], total: 0, hasMore: false,
      });

      const result = await searchProjects({});
      expect(result.success).toBe(true);
      expect(result.data.metadata.offset).toBeUndefined();
    });
  });
});
