// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository,
  createMockUserRepository,
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

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockUserRepo = createMockUserRepository(userStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: {
    createDispute: jest.fn(async (d: any) => ({ ...d, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    getDisputeById: jest.fn(async () => null),
    getAllDisputesByContract: jest.fn(async () => []),
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  PaymentRepository: {
    create: jest.fn(async (p: any) => ({ ...p, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    findByContractId: jest.fn(async () => []),
    findByUserId: jest.fn(async () => ({ items: [], hasMore: false })),
    updateStatus: jest.fn(async () => null),
  },
  PaymentType: {},
}));
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyMilestoneSubmitted: jest.fn().mockResolvedValue(undefined),
  notifyMilestoneApproved: jest.fn().mockResolvedValue(undefined),
  notifyPaymentReleased: jest.fn().mockResolvedValue(undefined),
  notifyDisputeCreated: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  default: { sendToUser: jest.fn() },
  initializeSSE: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: jest.fn(() => false),
  getProvider: jest.fn(),
  getWallet: jest.fn(),
  getContract: jest.fn(),
  getContractWithSigner: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: jest.fn(() => 'simulated'),
}));
jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: jest.fn(),
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
  requestMilestoneCompletion,
  approveMilestone,
  getContractPaymentStatus,
  setEscrowOpsForTesting,
} = await import('../../services/payment-service.js');

describe('Payment Service - Extended Coverage (milestone completion, approval, status)', () => {
  beforeEach(() => {
    contractStore.clear();
    projectStore.clear();
    userStore.clear();
    jest.clearAllMocks();

    setEscrowOpsForTesting({
      deployEscrow: jest.fn(async () => ({ escrowAddress: '0x' + 'e'.repeat(40) })),
      depositToEscrow: jest.fn(async () => ({})),
      getEscrowByContractId: jest.fn(async (contractId: string) => ({
        address: '0x' + 'e'.repeat(40),
        contractId,
        employerAddress: '0x' + 'f'.repeat(40),
        freelancerAddress: '0x' + 'a'.repeat(40),
        totalAmount: BigInt(5000),
        balance: BigInt(5000),
        milestones: [],
        deployedAt: Date.now(),
        deploymentTxHash: '0x' + 'd'.repeat(64),
      })),
      releaseMilestone: jest.fn(async () => ({
        transactionHash: '0x' + 'b'.repeat(64),
        blockNumber: 1,
        status: 'success',
        gasUsed: BigInt(21000),
        timestamp: Date.now(),
      })),
    });
  });

  describe('requestMilestoneCompletion', () => {
    it('should succeed for a pending milestone', async () => {
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

      userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
      userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await requestMilestoneCompletion(contract.id, milestone.id, freelancerId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('submitted');
        expect(result.data.notificationSent).toBe(true);
      }
    });

    it('should return NOT_FOUND when milestone does not exist', async () => {
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

      const result = await requestMilestoneCompletion(contract.id, 'nonexistent-ms', freelancerId);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not the freelancer', async () => {
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

      const result = await requestMilestoneCompletion(contract.id, milestone.id, 'wrong-user');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when milestone is already approved', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestone = createTestMilestone({ status: 'approved' });
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
  });

  describe('approveMilestone', () => {
    it('should succeed for a submitted milestone', async () => {
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

      userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
      userStore.set(freelancerId, createTestUser({ id: freelancerId, wallet_address: '0x' + 'a'.repeat(40) }));
      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await approveMilestone(contract.id, milestone.id, employerId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('approved');
        expect(result.data.paymentReleased).toBe(true);
      }
    });

    it('should return NOT_FOUND when contract does not exist', async () => {
      const result = await approveMilestone('nonexistent', 'ms-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not the employer', async () => {
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

      const result = await approveMilestone(contract.id, milestone.id, 'wrong-user');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when contract is not active', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestone = createTestMilestone({ status: 'submitted' });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'completed',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await approveMilestone(contract.id, milestone.id, employerId);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return INVALID_STATUS when milestone is not submitted', async () => {
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

      const result = await approveMilestone(contract.id, milestone.id, employerId);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return error when escrow release fails', async () => {
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

      userStore.set(employerId, createTestUser({ id: employerId, wallet_address: '0x' + 'b'.repeat(40) }));
      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      setEscrowOpsForTesting({
        deployEscrow: jest.fn(),
        depositToEscrow: jest.fn(),
        getEscrowByContractId: jest.fn(async () => ({
          address: '0x' + 'e'.repeat(40),
          contractId: contract.id,
          employerAddress: '0x' + 'f'.repeat(40),
          freelancerAddress: '0x' + 'a'.repeat(40),
          totalAmount: BigInt(5000),
          balance: BigInt(5000),
          milestones: [],
          deployedAt: Date.now(),
          deploymentTxHash: '0x' + 'd'.repeat(64),
        })),
        releaseMilestone: jest.fn(async () => { throw new Error('Escrow release failed'); }),
      });

      const result = await approveMilestone(contract.id, milestone.id, employerId);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PAYMENT_RELEASE_FAILED');
    });
  });

  describe('getContractPaymentStatus', () => {
    it('should return payment status for a valid contract', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestone1 = createTestMilestone({ status: 'approved', amount: 500 });
      const milestone2 = createTestMilestone({ status: 'pending', amount: 500 });
      const project = createTestProject({ employer_id: employerId, milestones: [milestone1, milestone2], budget: 1000 });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
        total_amount: 1000,
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await getContractPaymentStatus(contract.id, employerId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalAmount).toBe(1000);
        expect(result.data.releasedAmount).toBe(500);
        expect(result.data.milestones).toHaveLength(2);
      }
    });

    it('should return NOT_FOUND when contract does not exist', async () => {
      const result = await getContractPaymentStatus('nonexistent', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not a contract party', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const project = createTestProject({ employer_id: employerId, milestones: [] });
      const contract = createTestContract({
        project_id: project.id,
        freelancer_id: freelancerId,
        employer_id: employerId,
        status: 'active',
      });

      contractStore.set(contract.id, contract);
      projectStore.set(project.id, project);

      const result = await getContractPaymentStatus(contract.id, 'unrelated-user');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });
});
