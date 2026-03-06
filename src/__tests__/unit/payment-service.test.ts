import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository,
  createMockUserRepository,
  createMockNotificationRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestContract,
  createTestProject,
  createTestMilestone,
  createTestUser
} from '../helpers/test-data-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';
import { generateId } from '../../utils/id.js';

// Create stores and mocks
const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const userStore = createInMemoryStore();
const notificationStore = createInMemoryStore();
const disputeStore = createInMemoryStore();

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

// Create custom dispute repository mock
const mockDisputeRepo = {
  createDispute: jest.fn<any>(async (dispute: any) => {
    const now = new Date().toISOString();
    const entity = { ...dispute, created_at: now, updated_at: now };
    disputeStore.set(entity.id, entity);
    return entity;
  }),
  getDisputeById: jest.fn<any>(async (id: string) => {
    return disputeStore.get(id) ?? null;
  }),
  getAllDisputesByContract: jest.fn<any>(async (contractId: string) => {
    return Array.from(disputeStore.values()).filter((d: any) => d.contract_id === contractId);
  }),
  clear: () => disputeStore.clear(),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories
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

// Import after mocking
const {
  clearDisputes,
  getDisputeById,
  requestMilestoneCompletion,
  disputeMilestone,
  approveMilestone,
  getContractPaymentStatus,
  isContractComplete,
  setEscrowOpsForTesting,
} = await import('../../services/payment-service.js');

const { clearTransactions } = await import('../../services/blockchain-client.js');
const escrowContract = await import('../../services/escrow-contract.js');

describe('Payment Service - Property-Based Tests', () => {
  beforeEach(() => {
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    disputeStore.clear();
    clearTransactions();
    escrowContract.clearEscrows();
    clearDisputes();

    // Setup Supabase RPC mock for atomic milestone approval
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (...args: unknown[]) => {
      const [functionName, params] = args as [string, Record<string, string>];
      const contractId = params.p_contract_id;
      const milestoneId = params.p_milestone_id;

      if (functionName !== 'approve_milestone_atomic') {
        return { data: null, error: { message: `Unsupported RPC function: ${functionName}` } };
      }

      if (!contractId || !milestoneId) {
        return { data: null, error: { message: 'Missing RPC parameters' } };
      }

      const contract = contractStore.get(contractId) as any;
      if (!contract) {
        return { data: null, error: { message: 'Contract not found' } };
      }

      const project = projectStore.get(contract.project_id) as any;
      if (!project) {
        return { data: null, error: { message: 'Project not found' } };
      }

      const milestone = project.milestones.find((item: any) => item.id === milestoneId);
      if (!milestone) {
        return { data: null, error: { message: 'Milestone not found' } };
      }

      if (milestone.status === 'approved') {
        return { data: null, error: { message: 'Milestone already approved' } };
      }

      if (milestone.status === 'disputed') {
        return { data: null, error: { message: 'Cannot approve milestone with active dispute' } };
      }

      if (milestone.status !== 'submitted') {
        return {
          data: null,
          error: { message: `Milestone cannot be approved from status ${milestone.status}` },
        };
      }

      const updatedMilestones = project.milestones.map((item: any) =>
        item.id === milestoneId ? { ...item, status: 'approved' } : item,
      );
      const contractCompleted = updatedMilestones.every((item: any) => item.status === 'approved');
      const now = new Date().toISOString();

      projectStore.set(project.id, {
        ...project,
        milestones: updatedMilestones,
        status: contractCompleted ? 'completed' : project.status,
        updated_at: now,
      });

      if (contractCompleted) {
        contractStore.set(contract.id, {
          ...contract,
          status: 'completed',
          updated_at: now,
        });
      }

      return { data: { contract_completed: contractCompleted }, error: null };
    });

    // Setup default escrow operations
    setEscrowOpsForTesting({
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
    jest.restoreAllMocks();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 18: Milestone completion recording**
   * **Validates: Requirements 6.2**
   * 
   * For any milestone marked as complete by a freelancer, the milestone status 
   * shall be updated to 'submitted' and a notification shall be created for the employer.
   */
  it('Property 18: Milestone completion recording', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (freelancerId, employerId, milestoneId, milestoneTitle) => {
          // Setup users with wallet addresses
          userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
          userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
          const milestone = createTestMilestone({
            id: milestoneId,
            title: milestoneTitle,
            status: 'pending'
          });
          const project = createTestProject({ 
            employer_id: employerId, 
            milestones: [milestone] 
          });
          const contract = createTestContract({
            project_id: project.id,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'active'
          });
          
          contractStore.set(contract.id, contract);
          projectStore.set(project.id, project);

          const result = await requestMilestoneCompletion(
            contract.id,
            milestoneId,
            freelancerId
          );

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.milestoneId).toBe(milestoneId);
            expect(result.data.status).toBe('submitted');
            expect(result.data.notificationSent).toBe(true);
          }

          const updatedProject = projectStore.get(project.id) as any;
          const updatedMilestone = updatedProject?.milestones.find((m: any) => m.id === milestoneId);
          expect(updatedMilestone?.status).toBe('submitted');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 19: Milestone dispute creates dispute record**
   * **Validates: Requirements 6.4**
   * 
   * For any disputed milestone, a dispute record shall be created and the 
   * milestone status shall be set to 'disputed'.
   */
  it('Property 19: Milestone dispute creates dispute record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        async (freelancerId, employerId, milestoneId, reason) => {
          // Setup users with wallet addresses
          userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
          userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
          const milestone = createTestMilestone({
            id: milestoneId,
            status: 'submitted'
          });
          const project = createTestProject({ 
            employer_id: employerId, 
            milestones: [milestone] 
          });
          const contract = createTestContract({
            project_id: project.id,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'active'
          });
          
          contractStore.set(contract.id, contract);
          projectStore.set(project.id, project);

          const result = await disputeMilestone(
            contract.id,
            milestoneId,
            employerId,
            reason
          );

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.milestoneId).toBe(milestoneId);
            expect(result.data.status).toBe('disputed');
            expect(result.data.disputeCreated).toBe(true);
            expect(result.data.disputeId).toBeDefined();

            const dispute = await getDisputeById(result.data.disputeId);
            expect(dispute).not.toBeNull();
            expect(dispute?.contractId).toBe(contract.id);
            expect(dispute?.milestoneId).toBe(milestoneId);
            expect(dispute?.initiatorId).toBe(employerId);
            expect(dispute?.reason).toBe(reason);
            expect(dispute?.status).toBe('open');
          }

          const updatedProject = projectStore.get(project.id) as any;
          const updatedMilestone = updatedProject?.milestones.find((m: any) => m.id === milestoneId);
          expect(updatedMilestone?.status).toBe('disputed');

          const updatedContract = contractStore.get(contract.id) as any;
          expect(updatedContract?.status).toBe('disputed');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 20: Contract completion on all milestones approved**
   * **Validates: Requirements 6.5**
   * 
   * For any contract where all milestones have status 'approved', the contract 
   * status shall be 'completed'.
   */
  it('Property 20: Contract completion on all milestones approved', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        async (freelancerId, employerId, milestoneCount) => {
          // Setup users with wallet addresses
          userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
          userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
          const milestones = Array.from({ length: milestoneCount }, (_, i) =>
            createTestMilestone({
              id: generateId(),
              title: `Milestone ${i + 1}`,
              amount: 1000,
              status: 'submitted',
            })
          );

          const project = createTestProject({ 
            employer_id: employerId, 
            milestones,
            budget: milestones.reduce((sum, m) => sum + m.amount, 0)
          });
          const contract = createTestContract({
            project_id: project.id,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'active'
          });
          
          contractStore.set(contract.id, contract);
          projectStore.set(project.id, project);

          for (const milestone of milestones) {
            const result = await approveMilestone(
              contract.id,
              milestone.id,
              employerId
            );
            expect(result.success).toBe(true);
          }

          const isComplete = await isContractComplete(contract.id);
          expect(isComplete).toBe(true);

          const updatedContract = contractStore.get(contract.id) as any;
          expect(updatedContract?.status).toBe('completed');

          const updatedProject = projectStore.get(project.id) as any;
          expect(updatedProject?.status).toBe('completed');
        }
      ),
      { numRuns: 30 }
    );
  });
});

describe('Payment Service - Unit Tests', () => {
  beforeEach(() => {
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    notificationStore.clear();
    disputeStore.clear();
    clearTransactions();
    escrowContract.clearEscrows();
    clearDisputes();

    // Setup Supabase RPC mock (same as property tests)
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (...args: unknown[]) => {
      const [functionName, params] = args as [string, Record<string, string>];
      const contractId = params.p_contract_id;
      const milestoneId = params.p_milestone_id;

      if (functionName !== 'approve_milestone_atomic') {
        return { data: null, error: { message: `Unsupported RPC function: ${functionName}` } };
      }

      if (!contractId) return { data: null, error: { message: 'Contract ID is required' } };

      const contract = contractStore.get(contractId) as any;
      if (!contract) return { data: null, error: { message: 'Contract not found' } };

      const project = projectStore.get(contract.project_id) as any;
      if (!project) return { data: null, error: { message: 'Project not found' } };

      const milestone = project.milestones.find((item: any) => item.id === milestoneId);
      if (!milestone) return { data: null, error: { message: 'Milestone not found' } };
      if (milestone.status === 'approved') return { data: null, error: { message: 'Milestone already approved' } };
      if (milestone.status === 'disputed') return { data: null, error: { message: 'Cannot approve milestone with active dispute' } };
      if (milestone.status !== 'submitted') {
        return { data: null, error: { message: `Milestone cannot be approved from status ${milestone.status}` } };
      }

      const updatedMilestones = project.milestones.map((item: any) =>
        item.id === milestoneId ? { ...item, status: 'approved' } : item,
      );
      const contractCompleted = updatedMilestones.every((item: any) => item.status === 'approved');
      const now = new Date().toISOString();

      projectStore.set(project.id, {
        ...project,
        milestones: updatedMilestones,
        status: contractCompleted ? 'completed' : project.status,
        updated_at: now,
      } as any);

      if (contractCompleted) {
        contractStore.set(contract.id, { ...contract, status: 'completed', updated_at: now } as any);
      }

      return { data: { contract_completed: contractCompleted }, error: null };
    });

    setEscrowOpsForTesting({
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
    jest.restoreAllMocks();
  });

  it('should reject completion request from non-freelancer', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    const wrongUserId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestone = createTestMilestone({ status: 'pending' });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await requestMilestoneCompletion(contract.id, milestone.id, wrongUserId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should reject completion for already approved milestone', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    const milestone = createTestMilestone({ status: 'approved' });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  it('should allow freelancer to initiate dispute', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestone = createTestMilestone({ status: 'submitted' });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await disputeMilestone(
      contract.id,
      milestone.id,
      freelancerId,
      'Work was not as described'
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const dispute = await getDisputeById(result.data.disputeId);
      expect(dispute?.initiatorId).toBe(freelancerId);
    }
  });

  it('should reject dispute for already approved milestone', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    const milestone = createTestMilestone({ status: 'approved' });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await disputeMilestone(contract.id, milestone.id, employerId, 'Some reason');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  it('should reject dispute from non-contract party', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    const outsiderId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestone = createTestMilestone({ status: 'submitted' });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await disputeMilestone(contract.id, milestone.id, outsiderId, 'Some reason');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should not mark contract as completed if any milestone is not approved', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestones = [
      createTestMilestone({ status: 'submitted', amount: 1000 }),
      createTestMilestone({ status: 'submitted', amount: 1000 }),
      createTestMilestone({ status: 'pending', amount: 1000 }),
    ];
    const project = createTestProject({ 
      employer_id: employerId, 
      milestones,
      budget: 3000
    });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    await approveMilestone(contract.id, milestones[0]!.id, employerId);
    await approveMilestone(contract.id, milestones[1]!.id, employerId);

    const isComplete = await isContractComplete(contract.id);
    expect(isComplete).toBe(false);

    const updatedContract = contractStore.get(contract.id) as any;
    expect(updatedContract?.status).toBe('active');
  });

  it('should report last milestone approval as completing the contract', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestones = [
      createTestMilestone({ status: 'approved', amount: 1000 }),
      createTestMilestone({ status: 'submitted', amount: 1000 }),
    ];
    const project = createTestProject({ 
      employer_id: employerId, 
      milestones,
      budget: 2000
    });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await approveMilestone(contract.id, milestones[1]!.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractCompleted).toBe(true);
    }
  });

  it('should not report contract completion when more milestones remain', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestones = [
      createTestMilestone({ status: 'submitted', amount: 1000 }),
      createTestMilestone({ status: 'pending', amount: 1000 }),
    ];
    const project = createTestProject({ 
      employer_id: employerId, 
      milestones,
      budget: 2000
    });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await approveMilestone(contract.id, milestones[0]!.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractCompleted).toBe(false);
    }
  });

  it('should not approve milestone when escrow release fails', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
    userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
    
    const milestone = createTestMilestone({ status: 'submitted', amount: 1000 });
    const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    setEscrowOpsForTesting({
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
      releaseMilestone: async () => {
        throw new Error('escrow tx failed');
      },
    });

    const result = await approveMilestone(contract.id, milestone.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PAYMENT_RELEASE_FAILED');
    }

    const updatedProject = projectStore.get(project.id) as any;
    expect(updatedProject?.milestones[0]?.status).toBe('submitted');
  });

  it('should use contract totalAmount and exclude refunded milestones from pending amount', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    const milestones = [
      createTestMilestone({ status: 'approved', amount: 1000 }),
      createTestMilestone({ status: 'refunded', amount: 500 }),
      createTestMilestone({ status: 'submitted', amount: 800 }),
    ];
    const project = createTestProject({ 
      employer_id: employerId, 
      milestones,
      budget: 9999
    });
    const contract = createTestContract({
      project_id: project.id,
      freelancer_id: freelancerId,
      employer_id: employerId,
      total_amount: 2300,
      status: 'active'
    });
    
    contractStore.set(contract.id, contract);
    projectStore.set(project.id, project);

    const result = await getContractPaymentStatus(contract.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalAmount).toBe(2300);
      expect(result.data.releasedAmount).toBe(1000);
      expect(result.data.pendingAmount).toBe(800);
    }
  });
});
