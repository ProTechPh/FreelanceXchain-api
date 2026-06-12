import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository,
  createMockUserRepository,
  createMockNotificationRepository,
} from '../helpers/mock-repository-factory.js';
import {
  createTestContract,
  createTestProject,
  createTestMilestone,
  createTestUser,
} from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const userStore = createInMemoryStore();
const notificationStore = createInMemoryStore();
const disputeStore = createInMemoryStore();

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

const mockDisputeRepo = {
  createDispute: jest.fn<any>(async (dispute: any) => {
    const now = new Date().toISOString();
    const entity = { ...dispute, created_at: now, updated_at: now };
    disputeStore.set(entity.id, entity);
    return entity;
  }),
  getDisputeById: jest.fn<any>(async (id: string) => disputeStore.get(id) ?? null),
  getAllDisputesByContract: jest.fn<any>(async (contractId: string) =>
    Array.from(disputeStore.values()).filter((d: any) => d.contract_id === contractId),
  ),
};

const mockIsWeb3Available = jest.fn<any>(() => false);
const mockGetBlockchainMode = jest.fn<any>(() => 'simulated');
const mockDeployRealEscrow = jest.fn<any>();

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Override database mock with controllable pool
const mockQuery = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));


jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  PaymentRepository: {
    create: jest.fn<any>(async (p: any) => ({ ...p, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    findByContractId: jest.fn<any>(async () => []),
    findByUserId: jest.fn<any>(async () => ({ items: [], hasMore: false })),
    updateStatus: jest.fn<any>(async () => null),
  },
  PaymentType: {},
}));

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: mockIsWeb3Available,
  getProvider: jest.fn(),
  getWallet: jest.fn(),
  getContract: jest.fn(),
  getContractWithSigner: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: mockGetBlockchainMode,
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: mockDeployRealEscrow,
  approveMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'b'.repeat(64) })),
  getEscrowInfo: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  completeAgreement: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/milestone-registry.ts'), () => ({
  approveMilestoneOnRegistry: jest.fn(),
  submitMilestoneToRegistry: jest.fn(),
}));

const {
  disputeMilestone,
  requestMilestoneCompletion,
  getContractPaymentStatus,
  initializeContractEscrow,
  setEscrowOpsForTesting,
} = await import('../../services/payment-service.js');

const { clearTransactions } = await import('../../services/blockchain-client.js');
const escrowContract = await import('../../services/escrow-contract.js');

const mockDeployEscrow = jest.fn<any>();
const mockDepositToEscrow = jest.fn<any>();
const mockReleaseMilestone = jest.fn<any>();

describe('Payment Service - Extended Coverage', () => {
  beforeEach(() => {
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    disputeStore.clear();
    clearTransactions();
    escrowContract.clearEscrows();

    mockIsWeb3Available.mockReturnValue(false);
    mockGetBlockchainMode.mockReturnValue('simulated');

    const mockAppwriteClient = (globalThis as any).mockAppwriteClient;
    mockAppwriteClient.rpc = jest.fn(async (functionName: string, params: any) => {
      const contractId = params?.p_contract_id;
      const milestoneId = params?.p_milestone_id;
      if (functionName !== 'approve_milestone_atomic') {
        return { data: null, error: { message: `Unsupported: ${functionName}` } };
      }
      const contract = contractStore.get(contractId) as any;
      if (!contract) return { data: null, error: { message: 'Contract not found' } };
      const project = projectStore.get(contract.project_id) as any;
      if (!project) return { data: null, error: { message: 'Project not found' } };
      const milestone = project.milestones.find((m: any) => m.id === milestoneId);
      if (!milestone) return { data: null, error: { message: 'Milestone not found' } };
      if (milestone.status !== 'submitted') return { data: null, error: { message: 'Not submitted' } };
      const updatedMilestones = project.milestones.map((m: any) =>
        m.id === milestoneId ? { ...m, status: 'approved' } : m,
      );
      const contractCompleted = updatedMilestones.every((m: any) => m.status === 'approved');
      projectStore.set(project.id, { ...project, milestones: updatedMilestones, updated_at: new Date().toISOString() });
      if (contractCompleted) {
        contractStore.set(contract.id, { ...contract, status: 'completed', updated_at: new Date().toISOString() });
      }
      return { data: { contract_completed: contractCompleted }, error: null };
    });

    mockDeployEscrow.mockResolvedValue({ escrowAddress: '0xmock' + 'e'.repeat(36) });
    mockDepositToEscrow.mockResolvedValue({});
    mockReleaseMilestone.mockResolvedValue({
      transactionHash: '0x' + 'b'.repeat(64),
      blockNumber: 1,
      status: 'success',
      gasUsed: BigInt(21000),
      timestamp: Date.now(),
    });

    setEscrowOpsForTesting({
      deployEscrow: mockDeployEscrow,
      depositToEscrow: mockDepositToEscrow,
      getEscrowByContractId: async (contractId: string) => ({
        address: '0x' + 'e'.repeat(40),
        contractId,
        employerAddress: '0x' + 'f'.repeat(40),
        freelancerAddress: '0x' + 'a'.repeat(40),
        totalAmount: BigInt(5000),
        balance: BigInt(5000),
        milestones: [],
        deployedAt: Date.now(),
        deploymentTxHash: '0x' + 'd'.repeat(64),
      }),
      releaseMilestone: async () => ({
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 12345,
        status: 'success',
        gasUsed: BigInt(21000),
        timestamp: Date.now(),
      }),
    });
  });

  afterEach(() => {
    setEscrowOpsForTesting();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // disputeMilestone – already-disputed branch
  // ──────────────────────────────────────────────────────────
  describe('disputeMilestone - additional branches', () => {
    it('should return INVALID_STATUS with "already under dispute" when milestone is disputed', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      userStore.set(freelancerId, createTestUser({ id: freelancerId }));
      userStore.set(employerId, createTestUser({ id: employerId }));

      const milestone = createTestMilestone({ status: 'disputed' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await disputeMilestone(contract.id, milestone.id, employerId, 'Already disputed');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
        expect(result.error.message).toContain('already under dispute');
      }
    });

    it('should return INVALID_STATUS with pending message when milestone is pending', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      const milestone = createTestMilestone({ status: 'pending' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await disputeMilestone(contract.id, milestone.id, employerId, 'Reason');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
        expect(result.error.message).toContain('pending');
      }
    });
  });

  // ──────────────────────────────────────────────────────────
  // requestMilestoneCompletion – additional branches
  // ──────────────────────────────────────────────────────────
  describe('requestMilestoneCompletion - additional branches', () => {
    it('should return INVALID_STATUS when milestone is disputed', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      const milestone = createTestMilestone({ status: 'disputed' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return INVALID_STATUS when milestone is refunded', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      const milestone = createTestMilestone({ status: 'refunded' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return INVALID_STATUS when milestone is already submitted', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      const milestone = createTestMilestone({ status: 'submitted' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return NOT_FOUND when contract is not found', async () => {
      const result = await requestMilestoneCompletion('nonexistent', 'ms-1', 'fl-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INVALID_STATUS when contract is not active', async () => {
      const freelancerId = generateId();
      const employerId = generateId();

      const milestone = createTestMilestone({ status: 'pending' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'completed',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });
  });

  // ──────────────────────────────────────────────────────────
  // getContractPaymentStatus – project NOT_FOUND branch
  // ──────────────────────────────────────────────────────────
  describe('getContractPaymentStatus - project NOT_FOUND', () => {
    it('should return NOT_FOUND when project associated with contract is missing', async () => {
      const employerId = generateId();
      const contract = createTestContract({
        project_id: 'orphan-project-id',
        employer_id: employerId,
        status: 'active',
      });
      contractStore.set(contract.id, contract);

      const result = await getContractPaymentStatus(contract.id, employerId);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // ──────────────────────────────────────────────────────────
  // initializeContractEscrow – error paths
  // ──────────────────────────────────────────────────────────
  describe('initializeContractEscrow - error paths', () => {
    it('should return INVALID_CONTRACT_AMOUNT when totalAmount is 0', async () => {
      const milestone = createTestMilestone({ amount: 0 });
      const project = createTestProject({ milestones: [milestone], budget: 0 });
      const contract = { ...createTestContract({ project_id: project.id, total_amount: 0 }), totalAmount: 0 } as any;

      const result = await initializeContractEscrow(
        { ...contract, totalAmount: 0 } as any,
        { ...project, milestones: [{ ...milestone, amount: 0 }] } as any,
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(40),
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_CONTRACT_AMOUNT');
    });

    it('should return AMOUNT_MISMATCH when milestone total differs from contract total', async () => {
      const milestone1 = createTestMilestone({ amount: 0.1 });
      const milestone2 = createTestMilestone({ amount: 0.2 });
      const project = createTestProject({ milestones: [milestone1, milestone2], budget: 0.3 });
      const contract = createTestContract({ project_id: project.id, total_amount: 0.5 });

      const mappedMilestones = [
        { id: milestone1.id, title: milestone1.title, amount: 0.1, dueDate: milestone1.due_date, status: milestone1.status as any },
        { id: milestone2.id, title: milestone2.title, amount: 0.2, dueDate: milestone2.due_date, status: milestone2.status as any },
      ];

      const result = await initializeContractEscrow(
        { ...contract, id: contract.id, totalAmount: 0.5, projectId: project.id, employerId: 'emp', freelancerId: 'fl', escrowAddress: null, status: 'pending', rushFee: 0, baseAmount: 0.5, createdAt: contract.created_at, updatedAt: contract.updated_at } as any,
        { ...project, id: project.id, milestones: mappedMilestones, employerId: 'emp', title: project.title, description: project.description, budget: project.budget, deadline: project.deadline, status: project.status as any, requiredSkills: [], isRush: false, rushFeePercentage: 25, freelancerLimit: 1, tags: [], attachments: [], createdAt: project.created_at, updatedAt: project.updated_at } as any,
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(40),
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('AMOUNT_MISMATCH');
    });

    it('should return ESCROW_DEPLOYMENT_FAILED when deployEscrow throws', async () => {
      mockDeployEscrow.mockRejectedValueOnce(new Error('Network failure'));

      setEscrowOpsForTesting({
        deployEscrow: async () => { throw new Error('Network failure'); },
        depositToEscrow: mockDepositToEscrow,
      });

      const milestone = createTestMilestone({ amount: 1 });
      const mappedProject = {
        id: generateId(),
        employerId: 'emp',
        title: 'Test',
        description: 'desc',
        budget: 1,
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        status: 'open' as any,
        requiredSkills: [],
        milestones: [{ id: milestone.id, title: milestone.title, amount: 1, dueDate: milestone.due_date, status: 'pending' as any }],
        isRush: false,
        rushFeePercentage: 25,
        freelancerLimit: 1,
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const mappedContract = {
        id: generateId(),
        projectId: mappedProject.id,
        proposalId: generateId(),
        freelancerId: 'fl',
        employerId: 'emp',
        escrowAddress: null,
        baseAmount: 1,
        rushFee: 0,
        totalAmount: 1,
        status: 'pending' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await initializeContractEscrow(
        mappedContract as any,
        mappedProject as any,
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(40),
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ESCROW_DEPLOYMENT_FAILED');
    });

    it('should throw and catch ESCROW_DEPLOYMENT_FAILED when updateContract fails after escrow deploy', async () => {
      // Note: updateContract naturally returns null when the contract is not in contractStore,
      // so no mockResolvedValueOnce override is needed here.

      const milestone = createTestMilestone({ amount: 1 });
      const mappedProject = {
        id: generateId(),
        employerId: 'emp',
        title: 'Test',
        description: 'desc',
        budget: 1,
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        status: 'open' as any,
        requiredSkills: [],
        milestones: [{ id: milestone.id, title: milestone.title, amount: 1, dueDate: milestone.due_date, status: 'pending' as any }],
        isRush: false,
        rushFeePercentage: 25,
        freelancerLimit: 1,
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const mappedContract = {
        id: generateId(),
        projectId: mappedProject.id,
        proposalId: generateId(),
        freelancerId: 'fl',
        employerId: 'emp',
        escrowAddress: null,
        baseAmount: 1,
        rushFee: 0,
        totalAmount: 1,
        status: 'pending' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await initializeContractEscrow(
        mappedContract as any,
        mappedProject as any,
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(40),
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ESCROW_DEPLOYMENT_FAILED');
    });

    it('should succeed in simulated mode with matching milestones', async () => {
      const milestone = createTestMilestone({ amount: 1 });
      const contractId = generateId();
      const projectId = generateId();

      contractStore.set(contractId, createTestContract({ id: contractId, project_id: projectId, total_amount: 1 }));

      const escrowAddr = '0x' + 'c'.repeat(40);
      mockDeployEscrow.mockResolvedValueOnce({
        escrowAddress: escrowAddr,
        contractId,
        employerAddress: '0x' + 'a'.repeat(40),
        freelancerAddress: '0x' + 'b'.repeat(40),
        milestones: [],
        deployedAt: Date.now(),
        deploymentTxHash: '0x' + 'd'.repeat(64),
      });
      mockDepositToEscrow.mockResolvedValueOnce({
        transactionHash: '0x' + 'e'.repeat(64),
        blockNumber: 1,
        status: 'success',
        gasUsed: BigInt(21000),
        timestamp: Date.now(),
      });

      const mappedProject = {
        id: projectId,
        employerId: 'emp',
        title: 'Test',
        description: 'desc',
        budget: 1,
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        status: 'open' as any,
        requiredSkills: [],
        milestones: [{ id: milestone.id, title: milestone.title, amount: 1, dueDate: milestone.due_date, status: 'pending' as any }],
        isRush: false,
        rushFeePercentage: 25,
        freelancerLimit: 1,
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const mappedContract = {
        id: contractId,
        projectId,
        proposalId: generateId(),
        freelancerId: 'fl',
        employerId: 'emp',
        escrowAddress: null,
        baseAmount: 1,
        rushFee: 0,
        totalAmount: 1,
        status: 'pending' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await initializeContractEscrow(
        mappedContract as any,
        mappedProject as any,
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(40),
      );

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.escrowAddress).toBeDefined();
    });
  });
});
