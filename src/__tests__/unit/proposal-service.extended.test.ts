import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockProposalRepository,
  createMockProjectRepository,
  createMockContractRepository,
  createMockNotificationRepository,
  createMockUserRepository,
} from '../helpers/mock-repository-factory.js';
import {
  createTestProposal,
  createTestProject,
  createTestContract,
  createTestMilestone,
} from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const proposalStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const notificationStore = createInMemoryStore();
const userStore = createInMemoryStore();

const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);
const mockUserRepo = createMockUserRepository(userStore);

const mockAppwriteRpc = jest.fn<any>();

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);


jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  createAgreementOnBlockchain: jest.fn<any>(async () => ({})),
  signAgreement: jest.fn<any>(async () => ({})),
  completeAgreement: jest.fn<any>(async () => ({})),
}));

jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  initializeContractEscrow: jest.fn<any>(async () => ({
    success: true,
    data: { escrowAddress: '0x' + 'e'.repeat(40) },
  })),
  setEscrowOpsForTesting: jest.fn(),
}));

const {
  submitProposal,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} = await import('../../services/proposal-service.js');

const EMP = 'employer-001';
const FL = 'freelancer-001';

function makeProject(overrides: Record<string, any> = {}) {
  const p = createTestProject({
    employer_id: EMP,
    status: 'open',
    budget: 1000,
    milestones: [createTestMilestone({ amount: 1000 })],
    freelancer_limit: 1,
    ...overrides,
  });
  projectStore.set(p.id, p);
  return p;
}

function makeProposal(projectId: string, overrides: Record<string, any> = {}) {
  const proposal = createTestProposal({
    project_id: projectId,
    freelancer_id: FL,
    status: 'pending',
    proposed_rate: 1000,
    ...overrides,
  });
  proposalStore.set(proposal.id, proposal);
  return proposal;
}

function makeContract(projectId: string, proposalId: string) {
  const contract = createTestContract({
    project_id: projectId,
    proposal_id: proposalId,
    freelancer_id: FL,
    employer_id: EMP,
    total_amount: 1000,
    status: 'pending',
  });
  contractStore.set(contract.id, contract);
  return contract;
}

describe('Proposal Service - Extended Coverage', () => {
  beforeEach(() => {
    proposalStore.clear();
    projectStore.clear();
    contractStore.clear();
    notificationStore.clear();
    userStore.clear();
    jest.clearAllMocks();

    const mockPoolObj = (globalThis as any).mockPool;
    mockPoolObj.query.mockImplementation(async (text: string, params?: any[]) => {
      if (text.includes('accept_proposal_atomic')) {
        return { rows: [{ result: true, contract_id: 'contract-' + Date.now(), limit_reached: true }], rowCount: 1, contract_id: 'contract-' + Date.now(), limit_reached: true };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  // ──────────────────────────────────────────────────────────
  // submitProposal – error paths
  // ──────────────────────────────────────────────────────────
  describe('submitProposal - error paths', () => {
    it('should return VALIDATION_ERROR for invalid attachments', async () => {
      const invalidAttachments = [
        {
          url: 'http://not-appwrite.com/file.exe', // bad URL + bad ext
          filename: 'malware.exe',
          size: -1,
          mimeType: 'application/exe',
        },
      ] as any[];

      const result = await submitProposal(FL, {
        projectId: generateId(),
        attachments: invalidAttachments,
        proposedRate: 1000,
        estimatedDuration: 30,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return NOT_FOUND when project does not exist', async () => {
      const result = await submitProposal(FL, {
        projectId: 'nonexistent-project',
        attachments: [],
        proposedRate: 1000,
        estimatedDuration: 30,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return FREELANCER_LIMIT_REACHED when all freelancer slots are full', async () => {
      const p = makeProject({ freelancer_limit: 1 });
      mockProposalRepo.getAcceptedProposalCount.mockResolvedValueOnce(1);

      const result = await submitProposal(FL, {
        projectId: p.id,
        attachments: [],
        proposedRate: 1000,
        estimatedDuration: 30,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FREELANCER_LIMIT_REACHED');
    });
  });

  // ──────────────────────────────────────────────────────────
  // acceptProposal – uncovered branches
  // ──────────────────────────────────────────────────────────
  describe('acceptProposal - error paths', () => {
    it('should return NOT_FOUND when project is missing for the proposal', async () => {
      const orphanProject = createTestProject({ employer_id: EMP, status: 'open' });
      const proposal = makeProposal(orphanProject.id, { status: 'pending' });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when employer does not own the project', async () => {
      const p = makeProject({ employer_id: 'other-emp' });
      const proposal = makeProposal(p.id, {
        proposed_rate: 1000,
        status: 'pending',
      });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return NO_MILESTONES when project has no milestones', async () => {
      const p = makeProject({ milestones: [] });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_MILESTONES');
    });

    it('should return INVALID_PROPOSAL_RATE when proposed rate is 0', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { proposed_rate: 0, status: 'pending' });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_PROPOSAL_RATE');
    });

    it('should return AMOUNT_MISMATCH when proposal rate differs from milestone total', async () => {
      const p = makeProject({ milestones: [createTestMilestone({ amount: 2000 })] });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('AMOUNT_MISMATCH');
    });

    it('should return ALREADY_ACCEPTED when RPC returns already-accepted error', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });

      const mockPoolObj = (globalThis as any).mockPool;
      mockPoolObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should return UPDATE_FAILED when RPC returns generic error', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });

      const mockPoolObj = (globalThis as any).mockPool;
      mockPoolObj.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should keep project open when limit is not yet reached (limitReached=false)', async () => {
      const p = makeProject({ freelancer_limit: 2 });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });
      const contract = makeContract(p.id, proposal.id);

      const mockPoolObj = (globalThis as any).mockPool;
      mockPoolObj.query.mockResolvedValueOnce({
        rows: [{ result: true, contract_id: contract.id, limit_reached: false }],
        rowCount: 1,
        contract_id: contract.id,
        limit_reached: false,
      });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(true);

      const projectInStore = projectStore.get(p.id) as any;
      expect(projectInStore?.status).toBe('open');
    });

    it('should succeed and transition project to in_progress when limit is reached', async () => {
      const p = makeProject({ freelancer_limit: 1 });
      const proposal = makeProposal(p.id, { proposed_rate: 1000, status: 'pending' });
      const contract = makeContract(p.id, proposal.id);

      const mockPoolObj = (globalThis as any).mockPool;
      mockPoolObj.query.mockResolvedValueOnce({
        rows: [{ result: true, contract_id: contract.id, limit_reached: true }],
        rowCount: 1,
        contract_id: contract.id,
        limit_reached: true,
      });

      const result = await acceptProposal(proposal.id, EMP);
      expect(result.success).toBe(true);

      const projectInStore = projectStore.get(p.id) as any;
      expect(projectInStore?.status).toBe('in_progress');
    });
  });

  // ──────────────────────────────────────────────────────────
  // rejectProposal – uncovered branches
  // ──────────────────────────────────────────────────────────
  describe('rejectProposal - error paths', () => {
    it('should return NOT_FOUND when proposal references a deleted project', async () => {
      const orphanProjectId = generateId();
      const proposal = createTestProposal({
        project_id: orphanProjectId,
        freelancer_id: FL,
        status: 'pending',
      });
      proposalStore.set(proposal.id, proposal);

      const result = await rejectProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when a different employer tries to reject', async () => {
      const p = makeProject({ employer_id: 'owner-emp' });
      const proposal = makeProposal(p.id, { status: 'pending' });

      const result = await rejectProposal(proposal.id, 'other-emp');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return UPDATE_FAILED when the proposal update fails', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'pending' });

      (mockProposalRepo.updateProposal as any).mockResolvedValueOnce(null);

      const result = await rejectProposal(proposal.id, EMP);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should succeed and send notification even if non-critical paths fail', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'pending' });

      const result = await rejectProposal(proposal.id, EMP);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proposal.status).toBe('rejected');
      }
    });
  });

  // ──────────────────────────────────────────────────────────
  // withdrawProposal – uncovered branches
  // ──────────────────────────────────────────────────────────
  describe('withdrawProposal - error paths', () => {
    it('should return NOT_FOUND when proposal does not exist', async () => {
      const result = await withdrawProposal('nonexistent-proposal', FL);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INVALID_STATUS when proposal is already rejected', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'rejected' });

      const result = await withdrawProposal(proposal.id, FL);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return INVALID_STATUS when proposal is already accepted', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'accepted' });

      const result = await withdrawProposal(proposal.id, FL);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UPDATE_FAILED when withdrawal update fails', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'pending', freelancer_id: FL });

      (mockProposalRepo.updateProposal as any).mockResolvedValueOnce(null);

      const result = await withdrawProposal(proposal.id, FL);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should successfully withdraw a pending proposal', async () => {
      const p = makeProject();
      const proposal = makeProposal(p.id, { status: 'pending', freelancer_id: FL });

      const result = await withdrawProposal(proposal.id, FL);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('withdrawn');
      }
    });
  });
});
