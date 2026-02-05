import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';
import {
  clearDisputes,
  getDisputeById,
  requestMilestoneCompletion,
  disputeMilestone,
  approveMilestone,
  isContractComplete,
} from '../payment-service.js';
import { clearTransactions } from '../blockchain-client.js';
import { clearEscrows } from '../escrow-contract.js';
import { ContractEntity } from '../../repositories/contract-repository.js';
import { ProjectEntity, MilestoneEntity } from '../../repositories/project-repository.js';
import { contractRepository } from '../../repositories/contract-repository.js';
import { projectRepository } from '../../repositories/project-repository.js';
import { notificationRepository } from '../../repositories/notification-repository.js';
import { userRepository, UserEntity } from '../../repositories/user-repository.js';
import { generateId } from '../../utils/id.js';
// Test data generators
const createTestMilestone = (overrides: Partial<MilestoneEntity> = {}): MilestoneEntity => ({
  id: generateId(),
  title: 'Test Milestone',
  description: 'Test milestone description',
  amount: 1000,
  due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  status: 'pending',
  ...overrides,
});
const createTestProject = (employerId: string, milestones: MilestoneEntity[] = []): ProjectEntity => ({
  id: generateId(),
  employer_id: employerId,
  title: 'Test Project',
  description: 'Test project description',
  required_skills: [],
  budget: milestones.reduce((sum, m) => sum + m.amount, 0) || 5000,
  deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  status: 'in_progress',
  milestones,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
const createTestContract = (
  projectId: string,
  freelancerId: string,
  employerId: string
): ContractEntity => ({
  id: generateId(),
  project_id: projectId,
  proposal_id: generateId(),
  freelancer_id: freelancerId,
  employer_id: employerId,
  escrow_address: '0x' + '1'.repeat(40),
  total_amount: 5000,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
// Mock repositories for testing
let mockContracts: Map<string, ContractEntity>;
let mockProjects: Map<string, ProjectEntity>;
let mockUsers: Map<string, UserEntity>;
// Setup mock implementations
beforeEach(() => {
  mockContracts = new Map();
  mockProjects = new Map();
  mockUsers = new Map();
  clearTransactions();
  clearEscrows();
  clearDisputes();
  // Mock contract repository
  jest.spyOn(contractRepository, 'getContractById').mockImplementation(async (id: string) => {
    return mockContracts.get(id) ?? null;
  });
  jest.spyOn(contractRepository, 'updateContract').mockImplementation(async (id: string, updates: Partial<ContractEntity>) => {
    const contract = mockContracts.get(id);
    if (!contract) return null;
    const updated = { ...contract, ...updates, updated_at: new Date().toISOString() };
    mockContracts.set(id, updated);
    return updated;
  });
  // Mock project repository
  jest.spyOn(projectRepository, 'findProjectById').mockImplementation(async (id: string) => {
    return mockProjects.get(id) ?? null;
  });
  jest.spyOn(projectRepository, 'updateProject').mockImplementation(async (id: string, updates: Partial<ProjectEntity>) => {
    const project = mockProjects.get(id);
    if (!project) return null;
    const updated = { ...project, ...updates, updated_at: new Date().toISOString() };
    mockProjects.set(id, updated);
    return updated;
  });
  // Mock notification repository to avoid database calls
  jest.spyOn(notificationRepository, 'createNotification').mockImplementation(async (notification) => {
    const now = new Date().toISOString();
    return { ...notification, created_at: now, updated_at: now };
  });
  // Mock user repository to avoid database/Supabase calls
  jest.spyOn(userRepository, 'getUserById').mockImplementation(async (id: string) => {
    // Return a mock user if found, otherwise return null
    const existingUser = mockUsers.get(id);
    if (existingUser) return existingUser;
    // Create a default mock user with wallet address for blockchain operations
    const now = new Date().toISOString();
    const mockUser: UserEntity = {
      id,
      email: `user-${id.slice(0, 8)}@test.com`,
      password_hash: '',
      role: 'freelancer',
      wallet_address: '0x' + 'a'.repeat(40),
      name: `Test User ${id.slice(0, 8)}`,
      created_at: now,
      updated_at: now,
    };
    return mockUser;
  });
});
describe('Payment Service - Payment Logic Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 18: Milestone completion recording**
   * **Validates: Requirements 6.2**
   * 
   * For any milestone marked as complete by a freelancer, the milestone status 
   * shall be updated to 'submitted' and a notification shall be created for the employer.
   */
  describe('Property 18: Milestone completion recording', () => {
    it('should update milestone status to submitted when freelancer requests completion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (freelancerId, employerId, milestoneId, milestoneTitle) => {
            // Setup test data
            const milestone = createTestMilestone({
              id: milestoneId,
              title: milestoneTitle,
              status: 'pending'
            });
            const project = createTestProject(employerId, [milestone]);
            const contract = createTestContract(project.id, freelancerId, employerId);
            mockContracts.set(contract.id, contract);
            mockProjects.set(project.id, project);
            // Request milestone completion
            const result = await requestMilestoneCompletion(
              contract.id,
              milestoneId,
              freelancerId
            );
            // Verify result
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.milestoneId).toBe(milestoneId);
              expect(result.data.status).toBe('submitted');
              expect(result.data.notificationSent).toBe(true);
            }
            // Verify milestone status was updated
            const updatedProject = mockProjects.get(project.id);
            const updatedMilestone = updatedProject?.milestones.find(m => m.id === milestoneId);
            expect(updatedMilestone?.status).toBe('submitted');
          }
        ),
        { numRuns: 50 }
      );
    });
    it('should reject completion request from non-freelancer', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const wrongUserId = generateId();
      const milestone = createTestMilestone({ status: 'pending' });
      const project = createTestProject(employerId, [milestone]);
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      const result = await requestMilestoneCompletion(
        contract.id,
        milestone.id,
        wrongUserId
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });
    it('should reject completion for already approved milestone', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestone = createTestMilestone({ status: 'approved' });
      const project = createTestProject(employerId, [milestone]);
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      const result = await requestMilestoneCompletion(
        contract.id,
        milestone.id,
        freelancerId
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
      }
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 19: Milestone dispute creates dispute record**
   * **Validates: Requirements 6.4**
   * 
   * For any disputed milestone, a dispute record shall be created and the 
   * milestone status shall be set to 'disputed'.
   */
  describe('Property 19: Milestone dispute creates dispute record', () => {
    it('should create dispute record and update milestone status to disputed', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 200 }),
          async (freelancerId, employerId, milestoneId, reason) => {
            // Setup test data
            const milestone = createTestMilestone({
              id: milestoneId,
              status: 'submitted'
            });
            const project = createTestProject(employerId, [milestone]);
            const contract = createTestContract(project.id, freelancerId, employerId);
            mockContracts.set(contract.id, contract);
            mockProjects.set(project.id, project);
            // Dispute milestone
            const result = await disputeMilestone(
              contract.id,
              milestoneId,
              employerId,
              reason
            );
            // Verify result
            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.data.milestoneId).toBe(milestoneId);
              expect(result.data.status).toBe('disputed');
              expect(result.data.disputeCreated).toBe(true);
              expect(result.data.disputeId).toBeDefined();
              // Verify dispute record was created
              const dispute = await getDisputeById(result.data.disputeId);
              expect(dispute).not.toBeNull();
              expect(dispute?.contractId).toBe(contract.id);
              expect(dispute?.milestoneId).toBe(milestoneId);
              expect(dispute?.initiatorId).toBe(employerId);
              expect(dispute?.reason).toBe(reason);
              expect(dispute?.status).toBe('open');
            }
            // Verify milestone status was updated
            const updatedProject = mockProjects.get(project.id);
            const updatedMilestone = updatedProject?.milestones.find(m => m.id === milestoneId);
            expect(updatedMilestone?.status).toBe('disputed');
            // Verify contract status was updated
            const updatedContract = mockContracts.get(contract.id);
            expect(updatedContract?.status).toBe('disputed');
          }
        ),
        { numRuns: 50 }
      );
    });
    it('should allow freelancer to initiate dispute', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestone = createTestMilestone({ status: 'submitted' });
      const project = createTestProject(employerId, [milestone]);
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
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
      const project = createTestProject(employerId, [milestone]);
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      const result = await disputeMilestone(
        contract.id,
        milestone.id,
        employerId,
        'Some reason'
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
      }
    });
    it('should reject dispute from non-contract party', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const outsiderId = generateId();
      const milestone = createTestMilestone({ status: 'submitted' });
      const project = createTestProject(employerId, [milestone]);
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      const result = await disputeMilestone(
        contract.id,
        milestone.id,
        outsiderId,
        'Some reason'
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 20: Contract completion on all milestones approved**
   * **Validates: Requirements 6.5**
   * 
   * For any contract where all milestones have status 'approved', the contract 
   * status shall be 'completed'.
   */
  describe('Property 20: Contract completion on all milestones approved', () => {
    it('should mark contract as completed when all milestones are approved', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          async (freelancerId, employerId, milestoneCount) => {
            // Create milestones
            const milestones: MilestoneEntity[] = [];
            for (let i = 0; i < milestoneCount; i++) {
              milestones.push(createTestMilestone({
                id: generateId(),
                title: `Milestone ${i + 1}`,
                amount: 1000,
                status: 'submitted', // Ready for approval
              }));
            }
            const project = createTestProject(employerId, milestones);
            project.budget = milestones.reduce((sum, m) => sum + m.amount, 0);
            const contract = createTestContract(project.id, freelancerId, employerId);
            mockContracts.set(contract.id, contract);
            mockProjects.set(project.id, project);
            // Approve all milestones
            for (const milestone of milestones) {
              const result = await approveMilestone(
                contract.id,
                milestone.id,
                employerId
              );
              expect(result.success).toBe(true);
            }
            // Verify contract is completed
            const isComplete = await isContractComplete(contract.id);
            expect(isComplete).toBe(true);
            // Verify contract status
            const updatedContract = mockContracts.get(contract.id);
            expect(updatedContract?.status).toBe('completed');
            // Verify project status
            const updatedProject = mockProjects.get(project.id);
            expect(updatedProject?.status).toBe('completed');
          }
        ),
        { numRuns: 30 }
      );
    });
    it('should not mark contract as completed if any milestone is not approved', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestones = [
        createTestMilestone({ status: 'submitted', amount: 1000 }),
        createTestMilestone({ status: 'submitted', amount: 1000 }),
        createTestMilestone({ status: 'pending', amount: 1000 }), // Not submitted
      ];
      const project = createTestProject(employerId, milestones);
      project.budget = 3000;
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      // Approve first two milestones
      await approveMilestone(contract.id, milestones[0]!.id, employerId);
      await approveMilestone(contract.id, milestones[1]!.id, employerId);
      // Contract should not be complete
      const isComplete = await isContractComplete(contract.id);
      expect(isComplete).toBe(false);
      const updatedContract = mockContracts.get(contract.id);
      expect(updatedContract?.status).toBe('active');
    });
    it('should report last milestone approval as completing the contract', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestones = [
        createTestMilestone({ status: 'approved', amount: 1000 }),
        createTestMilestone({ status: 'submitted', amount: 1000 }), // Last one to approve
      ];
      const project = createTestProject(employerId, milestones);
      project.budget = 2000;
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      // Approve the last milestone
      const result = await approveMilestone(
        contract.id,
        milestones[1]!.id,
        employerId
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contractCompleted).toBe(true);
      }
    });
    it('should not report contract completion when more milestones remain', async () => {
      const freelancerId = generateId();
      const employerId = generateId();
      const milestones = [
        createTestMilestone({ status: 'submitted', amount: 1000 }),
        createTestMilestone({ status: 'pending', amount: 1000 }),
      ];
      const project = createTestProject(employerId, milestones);
      project.budget = 2000;
      const contract = createTestContract(project.id, freelancerId, employerId);
      mockContracts.set(contract.id, contract);
      mockProjects.set(project.id, project);
      // Approve first milestone
      const result = await approveMilestone(
        contract.id,
        milestones[0]!.id,
        employerId
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contractCompleted).toBe(false);
      }
    });
  });
});

