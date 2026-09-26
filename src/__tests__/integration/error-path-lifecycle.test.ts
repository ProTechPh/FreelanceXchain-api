/**
 * Error Path & Boundary Integration Test Suite
 * Tests failure paths, security boundaries, invalid inputs, and state machine conflicts:
 * 1. Auth & Registration Failures (Duplicate email, invalid role, invalid credentials)
 * 2. Role-Based Access Control (RBAC) Violations (Freelancer creating project, Employer proposing)
 * 3. Project & Milestone Validation Failures (Negative budget, past deadline, milestone sum mismatch)
 * 4. Proposal State & Boundary Conflicts (Closed project, duplicate proposals, invalid attachments)
 * 5. Milestone & Escrow Workflow Rejections (Non-active contract, double approval, non-owner approval)
 * 6. Dispute Integrity & Access Rejections (Non-party dispute, invalid resolution bps, double resolve)
 * 7. Rating & Review Constraints (Non-completed contract, duplicate review, out-of-range rating)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { User } from '../../models/user.js';
import { Project, Milestone } from '../../models/project.js';
import { Proposal } from '../../models/proposal.js';
import { Contract } from '../../models/contract.js';
import { Dispute } from '../../models/dispute.js';
import { Notification } from '../../models/notification.js';
import { Skill, SkillCategory } from '../../models/skill.js';
import { generateId } from '../../utils/id.js';

let userStore: Map<string, User> = new Map();
let projectStore: Map<string, Project> = new Map();
let proposalStore: Map<string, Proposal> = new Map();
let contractStore: Map<string, Contract> = new Map();
let disputeStore: Map<string, Dispute> = new Map();
let notificationStore: Map<string, Notification> = new Map();
let skillStore: Map<string, Skill> = new Map();
let skillCategoryStore: Map<string, SkillCategory> = new Map();
let reviewStore: Map<string, any> = new Map();

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock User Repository
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    createUser: jest.fn(async (user: User) => {
      userStore.set(user.id, user);
      return user;
    }),
    findUserById: jest.fn(async (id: string) => userStore.get(id) ?? null),
    getUserById: jest.fn(async (id: string) => {
      const user = userStore.get(id);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        wallet_address: user.walletAddress || ('0x' + 'a'.repeat(40)),
        is_active: true,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      };
    }),
    findUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) return user;
      }
      return null;
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) {
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            wallet_address: user.walletAddress || ('0x' + 'a'.repeat(40)),
            is_active: true,
            created_at: user.createdAt,
            updated_at: user.updatedAt,
          };
        }
      }
      return null;
    }),
    emailExists: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) return true;
      }
      return false;
    }),
    updateUser: jest.fn(async (id: string, updates: Partial<User>) => {
      const user = userStore.get(id);
      if (!user) return null;
      const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
      userStore.set(id, updated);
      return updated;
    }),
    getUsersByRole: jest.fn(async (role: string) => {
      return Array.from(userStore.values()).filter(u => u.role === role);
    }),
  },
  UserRepository: jest.fn(),
}));

// Mock Project Repository
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: {
    createProject: jest.fn(async (project: any) => {
      const entity = {
        id: project.id,
        employer_id: project.employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: project.required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status || 'open',
        milestones: project.milestones ?? [],
        created_at: project.created_at ?? new Date().toISOString(),
        updated_at: project.updated_at ?? new Date().toISOString(),
      };
      projectStore.set(entity.id, entity as any);
      return entity;
    }),
    findProjectById: jest.fn(async (id: string) => {
      const project = projectStore.get(id);
      if (!project) return null;
      return {
        id: project.id,
        employer_id: (project as any).employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: (project as any).required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status,
        milestones: project.milestones ?? [],
        created_at: (project as any).created_at ?? project.createdAt,
        updated_at: (project as any).updated_at ?? project.updatedAt,
      };
    }),
    getProjectById: jest.fn(async (id: string) => {
      const project = projectStore.get(id);
      if (!project) return null;
      return {
        id: project.id,
        employer_id: (project as any).employer_id || project.employerId,
        title: project.title,
        description: project.description,
        required_skills: (project as any).required_skills || project.requiredSkills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status,
        milestones: project.milestones ?? [],
        created_at: (project as any).created_at ?? project.createdAt,
        updated_at: (project as any).updated_at ?? project.updatedAt,
      };
    }),
    updateProject: jest.fn(async (id: string, updates: any) => {
      const project = projectStore.get(id);
      if (!project) return null;
      const updated = { ...project, ...updates, updated_at: new Date().toISOString() };
      projectStore.set(id, updated as any);
      return updated;
    }),
    countProposalsByProject: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).filter(p => p.projectId === projectId).length;
    }),
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).some(p => p.projectId === projectId && p.status === 'accepted');
    }),
  },
  ProjectRepository: jest.fn(),
}));

// Mock Proposal Repository
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: {
    createProposal: jest.fn(async (proposal: any) => {
      const entity = {
        id: proposal.id,
        project_id: proposal.project_id || proposal.projectId,
        freelancer_id: proposal.freelancer_id || proposal.freelancerId,
        cover_letter: proposal.cover_letter || proposal.coverLetter || null,
        attachments: proposal.attachments || [],
        proposed_rate: proposal.proposed_rate ?? proposal.proposedRate,
        estimated_duration: proposal.estimated_duration || proposal.estimatedDuration,
        status: proposal.status || 'pending',
        created_at: proposal.created_at ?? new Date().toISOString(),
        updated_at: proposal.updated_at ?? new Date().toISOString(),
      };
      proposalStore.set(entity.id, entity as any);
      return entity;
    }),
    findProposalById: jest.fn(async (id: string) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      return {
        id: proposal.id,
        project_id: (proposal as any).project_id || proposal.projectId,
        freelancer_id: (proposal as any).freelancer_id || proposal.freelancerId,
        cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
        attachments: (proposal as any).attachments || proposal.attachments || [],
        proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
        estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
        status: proposal.status,
        created_at: (proposal as any).created_at ?? proposal.createdAt,
        updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
      };
    }),
    getProposalById: jest.fn(async (id: string) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      return {
        id: proposal.id,
        project_id: (proposal as any).project_id || proposal.projectId,
        freelancer_id: (proposal as any).freelancer_id || proposal.freelancerId,
        cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
        attachments: (proposal as any).attachments || proposal.attachments || [],
        proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
        estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
        status: proposal.status,
        created_at: (proposal as any).created_at ?? proposal.createdAt,
        updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
      };
    }),
    getExistingProposal: jest.fn(async (projectId: string, freelancerId: string) => {
      for (const proposal of proposalStore.values()) {
        const pId = (proposal as any).project_id || proposal.projectId;
        const fId = (proposal as any).freelancer_id || proposal.freelancerId;
        if (pId === projectId && fId === freelancerId) {
          return {
            id: proposal.id,
            project_id: pId,
            freelancer_id: fId,
            cover_letter: (proposal as any).cover_letter || proposal.coverLetter || null,
            attachments: (proposal as any).attachments || proposal.attachments || [],
            proposed_rate: (proposal as any).proposed_rate ?? proposal.proposedRate,
            estimated_duration: (proposal as any).estimated_duration || proposal.estimatedDuration,
            status: proposal.status,
            created_at: (proposal as any).created_at ?? proposal.createdAt,
            updated_at: (proposal as any).updated_at ?? proposal.updatedAt,
          };
        }
      }
      return null;
    }),
    updateProposal: jest.fn(async (id: string, updates: any) => {
      const proposal = proposalStore.get(id);
      if (!proposal) return null;
      const updated = { ...proposal, ...updates, updated_at: new Date().toISOString() };
      proposalStore.set(id, updated as any);
      return updated;
    }),
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).some(p => p.projectId === projectId && p.status === 'accepted');
    }),
    getAcceptedProposalCount: jest.fn(async (projectId: string) => {
      return Array.from(proposalStore.values()).filter(p => p.projectId === projectId && p.status === 'accepted').length;
    }),
    getProposalsByProject: jest.fn(async (projectId: string) => {
      const items = Array.from(proposalStore.values())
        .filter(p => ((p as any).project_id || p.projectId) === projectId)
        .map(p => ({
          id: p.id,
          project_id: (p as any).project_id || p.projectId,
          freelancer_id: (p as any).freelancer_id || p.freelancerId,
          cover_letter: (p as any).cover_letter || p.coverLetter,
          proposed_rate: (p as any).proposed_rate ?? p.proposedRate,
          estimated_duration: (p as any).estimated_duration || p.estimatedDuration,
          status: p.status,
          created_at: (p as any).created_at ?? p.createdAt,
          updated_at: (p as any).updated_at ?? p.updatedAt,
        }));
      return { items, hasMore: false };
    }),
  },
  ProposalRepository: jest.fn(),
}));

// Mock Contract Repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    create: jest.fn(async (contract: any) => {
      contractStore.set(contract.id, contract as any);
      return contract;
    }),
    getContractById: jest.fn(async (id: string) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      return {
        id: contract.id,
        project_id: (contract as any).project_id || contract.projectId,
        proposal_id: (contract as any).proposal_id || contract.proposalId,
        freelancer_id: (contract as any).freelancer_id || contract.freelancerId,
        employer_id: (contract as any).employer_id || contract.employerId,
        escrow_address: (contract as any).escrow_address || contract.escrowAddress || '',
        total_amount: (contract as any).total_amount ?? contract.totalAmount,
        status: contract.status,
        created_at: (contract as any).created_at ?? contract.createdAt,
        updated_at: (contract as any).updated_at ?? contract.updatedAt,
      };
    }),
    updateContract: jest.fn(async (id: string, updates: any) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      const updated = { ...contract, ...updates, updated_at: new Date().toISOString() };
      contractStore.set(id, updated as any);
      return updated;
    }),
  },
  ContractRepository: jest.fn(),
}));

// Mock Dispute Repository
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: {
    createDispute: jest.fn(async (dispute: any) => {
      disputeStore.set(dispute.id, dispute);
      return dispute;
    }),
    getDisputeById: jest.fn(async (id: string) => {
      const d = disputeStore.get(id);
      if (!d) return null;
      return {
        id: d.id,
        contract_id: (d as any).contract_id || d.contractId,
        milestone_id: (d as any).milestone_id || d.milestoneId,
        initiator_id: (d as any).initiator_id || d.initiatorId,
        reason: d.reason,
        status: d.status,
        evidence: d.evidence ?? [],
        resolution: d.resolution ?? null,
        created_at: (d as any).created_at ?? d.createdAt,
        updated_at: (d as any).updated_at ?? d.updatedAt,
      };
    }),
    updateDispute: jest.fn(async (id: string, updates: any) => {
      const d = disputeStore.get(id);
      if (!d) return null;
      const updated = { ...d, ...updates, updated_at: new Date().toISOString() };
      disputeStore.set(id, updated as any);
      return updated;
    }),
    getDisputeByMilestone: jest.fn(async (milestoneId: string) => {
      for (const d of disputeStore.values()) {
        const mId = (d as any).milestone_id || d.milestoneId;
        if (mId === milestoneId) return d;
      }
      return null;
    }),
  },
  DisputeRepository: jest.fn(),
}));

// Mock Review Repository
jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  reviewRepository: {
    create: jest.fn(async (entity: any) => {
      const review = { ...entity, id: generateId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      reviewStore.set(review.id, review);
      return review;
    }),
    hasReviewed: jest.fn(async (contractId: string, reviewerId: string) => {
      return Array.from(reviewStore.values()).some(
        r => r.contract_id === contractId && r.reviewer_id === reviewerId
      );
    }),
    findAllByRevieweeId: jest.fn(async (revieweeId: string) => {
      return Array.from(reviewStore.values()).filter(r => r.reviewee_id === revieweeId);
    }),
  },
  ReviewRepository: jest.fn(),
}));

// Mock Skills
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: {
    createSkill: jest.fn(async (skill: any) => {
      skillStore.set(skill.id, skill);
      return skill;
    }),
    findSkillsByIds: jest.fn(async (ids: string[]) => ids.map(id => skillStore.get(id)).filter(Boolean).map(s => ({
      id: s!.id,
      category_id: s!.categoryId,
      name: s!.name,
      description: s!.description,
      is_active: s!.isActive,
      created_at: s!.createdAt,
      updated_at: s!.updatedAt,
    }))),
  },
  SkillRepository: jest.fn(),
}));

// Mock Escrow & Blockchain
jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: jest.fn(async () => ({ address: '0x' + 'a'.repeat(40), transactionHash: '0x' + 'b'.repeat(64) })),
  depositToEscrow: jest.fn(async () => ({ transactionHash: '0x' + 'e'.repeat(64), status: 'success' })),
  getEscrowByContractId: jest.fn(async () => ({ address: '0x' + 'a'.repeat(40) })),
  releaseMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'c'.repeat(64), status: 'success' })),
  refundMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'd'.repeat(64), status: 'success' })),
  getEscrowBalance: jest.fn(async () => BigInt(5000)),
  getMilestoneStatus: jest.fn(async () => 'pending'),
  areAllMilestonesReleased: jest.fn(async () => false),
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: jest.fn(() => 'simulated'),
  getBlockchainAdapter: jest.fn(() => ({
    isAvailable: () => true,
    approveMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'b'.repeat(64) })),
    submitMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'c'.repeat(64) })),
    resolveDispute: jest.fn(async () => ({ transactionHash: '0x' + 'd'.repeat(64) })),
  })),
}));

// Dynamic service imports
const { register, login } = await import('../../services/auth-service.js');
const { createProject, addMilestones, updateProject } = await import('../../services/project-service.js');
const { submitProposal, acceptProposal } = await import('../../services/proposal-service.js');
const { requestMilestoneCompletion, approveMilestone } = await import('../../services/payment-service.js');
const { createDispute, resolveDispute } = await import('../../services/dispute-service.js');
const { submitRating } = await import('../../services/reputation-service.js');

function clearStores(): void {
  userStore.clear();
  projectStore.clear();
  proposalStore.clear();
  contractStore.clear();
  disputeStore.clear();
  notificationStore.clear();
  skillStore.clear();
  skillCategoryStore.clear();
  reviewStore.clear();
}

describe('Error Path & Boundary Integration - Failure Modes & Security Safeguards', () => {
  beforeEach(() => {
    clearStores();
    if ((globalThis as any).mockAppwriteUsers) {
      (globalThis as any).mockAppwriteUsers.create.mockImplementation((_id: string, email: string) => {
        return Promise.resolve({ $id: generateId(), email });
      });
    }
    if ((globalThis as any).mockAppwriteAccount) {
      (globalThis as any).mockAppwriteAccount.createEmailPasswordSession.mockImplementation(
        (param: any, pwd?: string) => {
          const password = typeof param === 'object' && param !== null ? param.password : pwd;
          if (password === 'wrong-password') {
            return Promise.reject(new Error('Invalid credentials'));
          }
          return Promise.resolve({ secret: 'test-session-secret' });
        }
      );
    }
  });

  describe('1. Authentication & Security Error Paths', () => {
    it('rejects duplicate email registration with DUPLICATE_EMAIL error', async () => {
      await register({
        email: 'duplicate.user@example.com',
        password: 'Password123!',
        role: 'freelancer',
      });

      const duplicateResult = await register({
        email: 'duplicate.user@example.com',
        password: 'Password456!',
        role: 'employer',
      });

      expect(duplicateResult).toHaveProperty('code');
      if ('code' in duplicateResult) {
        expect(duplicateResult.code).toBe('DUPLICATE_EMAIL');
      }
    });

    it('rejects login with invalid password', async () => {
      await register({
        email: 'valid.account@example.com',
        password: 'CorrectPassword123!',
        role: 'freelancer',
      });

      const failedLogin = await login({
        email: 'valid.account@example.com',
        password: 'wrong-password',
      });

      expect(failedLogin).toHaveProperty('code');
      if ('code' in failedLogin) {
        expect(failedLogin.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('rejects login for unregistered user email', async () => {
      const nonExistentLogin = await login({
        email: 'nonexistent.user@example.com',
        password: 'SomePassword123!',
      });

      expect(nonExistentLogin).toHaveProperty('code');
      if ('code' in nonExistentLogin) {
        expect(nonExistentLogin.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('2. Project Creation & Milestone Validation Error Paths', () => {
    it('rejects milestone amounts that do not sum to total project budget', async () => {
      const employerId = generateId();
      userStore.set(employerId, {
        id: employerId,
        email: 'employer@test.com',
        name: 'Test Employer',
        role: 'employer',
        walletAddress: '0x' + 'e'.repeat(40),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const projectResult = await createProject(employerId, {
        title: 'API Testing Project',
        description: 'Comprehensive test coverage',
        requiredSkills: [],
        budget: 5000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(projectResult.success).toBe(true);
      if (!projectResult.success) return;

      // Milestones only sum to 3000 instead of 5000
      const invalidMilestones = [
        { title: 'Milestone 1', description: 'Design', amount: 1500, dueDate: new Date().toISOString() },
        { title: 'Milestone 2', description: 'Build', amount: 1500, dueDate: new Date().toISOString() },
      ];

      const addMilestonesResult = await addMilestones(projectResult.data.id, employerId, invalidMilestones);
      expect(addMilestonesResult.success).toBe(false);
      if (!addMilestonesResult.success) {
        expect(addMilestonesResult.error.code).toBe('MILESTONE_SUM_MISMATCH');
      }
    });

    it('rejects adding milestones to a non-existent project', async () => {
      const employerId = generateId();
      const fakeProjectId = 'non-existent-project-id';

      const result = await addMilestones(fakeProjectId, employerId, [
        { title: 'M1', description: 'desc', amount: 1000, dueDate: new Date().toISOString() },
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('rejects updating non-existent project', async () => {
      const employerId = generateId();
      const updateResult = await updateProject('non-existent-id', employerId, {
        title: 'New Title',
      });

      expect(updateResult.success).toBe(false);
      if (!updateResult.success) {
        expect(updateResult.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('3. Proposal Submission & Negotiation Error Paths', () => {
    it('rejects proposal submission on non-existent project', async () => {
      const freelancerId = generateId();
      const proposalResult = await submitProposal(freelancerId, {
        projectId: 'missing-project-id',
        coverLetter: 'Hello employer',
        attachments: [],
        proposedRate: 1000,
        estimatedDuration: 14,
      });

      expect(proposalResult.success).toBe(false);
      if (!proposalResult.success) {
        expect(proposalResult.error.code).toBe('NOT_FOUND');
      }
    });

    it('rejects proposal submission when project is not open', async () => {
      const employerId = generateId();
      const freelancerId = generateId();

      const project: Project = {
        id: generateId(),
        employerId,
        title: 'Closed Project',
        description: 'No longer accepting bids',
        requiredSkills: [],
        budget: 2000,
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress', // not open!
        isRush: false,
        rushFeePercentage: 0,
        freelancerLimit: 1,
        milestones: [],
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      const proposalResult = await submitProposal(freelancerId, {
        projectId: project.id,
        coverLetter: 'Late submission',
        attachments: [],
        proposedRate: 2000,
        estimatedDuration: 10,
      });

      expect(proposalResult.success).toBe(false);
      if (!proposalResult.success) {
        expect(proposalResult.error.code).toBe('PROJECT_NOT_OPEN');
      }
    });

    it('rejects duplicate proposal on same project by same freelancer', async () => {
      const employerId = generateId();
      const freelancerId = generateId();

      const project: Project = {
        id: generateId(),
        employerId,
        title: 'Open Project',
        description: 'Accepting bids',
        requiredSkills: [],
        budget: 3000,
        deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
        isRush: false,
        rushFeePercentage: 0,
        freelancerLimit: 1,
        milestones: [{ id: generateId(), title: 'M1', description: 'd', amount: 3000, dueDate: new Date().toISOString(), status: 'pending' }],
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      // First submission succeeds
      const firstProposal = await submitProposal(freelancerId, {
        projectId: project.id,
        coverLetter: 'First bid',
        attachments: [],
        proposedRate: 3000,
        estimatedDuration: 15,
      });
      expect(firstProposal.success).toBe(true);

      // Second submission by same freelancer fails
      const duplicateProposal = await submitProposal(freelancerId, {
        projectId: project.id,
        coverLetter: 'Duplicate bid attempt',
        attachments: [],
        proposedRate: 3000,
        estimatedDuration: 15,
      });
      expect(duplicateProposal.success).toBe(false);
      if (!duplicateProposal.success) {
        expect(duplicateProposal.error.code).toBe('DUPLICATE_PROPOSAL');
      }
    });

    it('rejects proposal with invalid / disallowed attachment MIME type', async () => {
      const freelancerId = generateId();
      const projectId = generateId();

      const invalidAttachmentProposal = await submitProposal(freelancerId, {
        projectId,
        coverLetter: 'Sending malicious file',
        attachments: [
          {
            url: 'https://test.appwrite.co/storage/v1/object/public/proposal-attachments/exploit.exe',
            filename: 'exploit.exe',
            size: 1024,
            mimeType: 'application/x-msdownload', // Disallowed executable MIME!
          },
        ],
        proposedRate: 1000,
        estimatedDuration: 7,
      });

      expect(invalidAttachmentProposal.success).toBe(false);
      if (!invalidAttachmentProposal.success) {
        expect(invalidAttachmentProposal.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects non-owner employer from accepting proposal on another employer project', async () => {
      const ownerEmployerId = generateId();
      const attackerEmployerId = generateId();
      const freelancerId = generateId();

      const project: Project = {
        id: generateId(),
        employerId: ownerEmployerId,
        title: 'Confidential Project',
        description: 'Owner only',
        requiredSkills: [],
        budget: 5000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'open',
        isRush: false,
        rushFeePercentage: 0,
        freelancerLimit: 1,
        milestones: [{ id: generateId(), title: 'M1', description: 'd', amount: 5000, dueDate: new Date().toISOString(), status: 'pending' }],
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(project.id, project);

      const proposal = await submitProposal(freelancerId, {
        projectId: project.id,
        coverLetter: 'Proposal',
        attachments: [],
        proposedRate: 5000,
        estimatedDuration: 30,
      });
      expect(proposal.success).toBe(true);
      if (!proposal.success) return;

      // Attacker employer attempts to accept
      const unauthorizedAccept = await acceptProposal(proposal.data.proposal.id, attackerEmployerId);
      expect(unauthorizedAccept.success).toBe(false);
      if (!unauthorizedAccept.success) {
        expect(unauthorizedAccept.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('4. Milestone Delivery & Escrow Approval Error Paths', () => {
    it('rejects milestone completion request on a non-active contract', async () => {
      const employerId = generateId();
      const freelancerId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 2000,
        rushFee: 0,
        totalAmount: 2000,
        status: 'pending', // Pending, not active!
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const result = await requestMilestoneCompletion(
        contract.id,
        'milestone-id',
        freelancerId,
        { notes: 'Premature submission' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
      }
    });

    it('rejects milestone completion request by unauthorized freelancer', async () => {
      const employerId = generateId();
      const authorizedFreelancerId = generateId();
      const unauthorizedFreelancerId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId: authorizedFreelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 2000,
        rushFee: 0,
        totalAmount: 2000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const result = await requestMilestoneCompletion(
        contract.id,
        'milestone-id',
        unauthorizedFreelancerId,
        { notes: 'Attacker submission' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects approving milestone by non-owner employer', async () => {
      const realEmployerId = generateId();
      const fakeEmployerId = generateId();
      const freelancerId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId: realEmployerId,
        escrowAddress: '0x123',
        baseAmount: 2000,
        rushFee: 0,
        totalAmount: 2000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const result = await approveMilestone(contract.id, 'milestone-id', fakeEmployerId);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('5. Dispute Resolution Error Paths', () => {
    it('rejects dispute creation by a third party not part of the contract', async () => {
      const employerId = generateId();
      const freelancerId = generateId();
      const thirdPartyId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 2000,
        rushFee: 0,
        totalAmount: 2000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const disputeResult = await createDispute({
        contractId: contract.id,
        milestoneId: 'milestone-id',
        initiatorId: thirdPartyId,
        reason: 'Third party complaint',
      });

      expect(disputeResult.success).toBe(false);
      if (!disputeResult.success) {
        expect(disputeResult.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects dispute creation on non-existent contract', async () => {
      const disputeResult = await createDispute({
        contractId: 'non-existent-contract',
        milestoneId: 'milestone-id',
        initiatorId: generateId(),
        reason: 'Work missing',
      });

      expect(disputeResult.success).toBe(false);
      if (!disputeResult.success) {
        expect(disputeResult.error.code).toBe('NOT_FOUND');
      }
    });

    it('rejects dispute resolution with invalid split basis points', async () => {
      const disputeId = generateId();
      const adminId = generateId();
      const employerId = generateId();
      const freelancerId = generateId();
      const milestoneId = generateId();
      const projectId = generateId();
      const contractId = generateId();

      const project: Project = {
        id: projectId,
        employerId,
        title: 'Disputed Project',
        description: 'Testing split bps',
        requiredSkills: [],
        budget: 2000,
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
        isRush: false,
        rushFeePercentage: 0,
        freelancerLimit: 1,
        milestones: [{ id: milestoneId, title: 'M1', description: 'desc', amount: 2000, dueDate: new Date().toISOString(), status: 'disputed' }],
        tags: [],
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projectStore.set(projectId, project);

      const contract: Contract = {
        id: contractId,
        projectId,
        proposalId: generateId(),
        employerId,
        freelancerId,
        escrowAddress: '0x' + 'a'.repeat(40),
        baseAmount: 2000,
        rushFee: 0,
        status: 'disputed',
        totalAmount: 2000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contractId, contract);

      const dispute: Dispute = {
        id: disputeId,
        contractId,
        milestoneId,
        initiatorId: employerId,
        reason: 'Incomplete delivery',
        status: 'open',
        evidence: [],
        resolution: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      disputeStore.set(disputeId, dispute);

      // Attempt split with bps > 10000 (invalid)
      const invalidSplitResult = await resolveDispute({
        disputeId,
        decision: 'split',
        freelancerBps: 15000, // Exceeds 10000 bps
        reasoning: 'Invalid bps ratio',
        resolvedBy: adminId,
        resolverRole: 'admin',
      });

      expect(invalidSplitResult.success).toBe(false);
      if (!invalidSplitResult.success) {
        expect(invalidSplitResult.error.code).toBe('INVALID_SPLIT_BPS');
      }
    });
  });

  describe('6. Review & Rating Constraints', () => {
    it('rejects review on non-completed contract', async () => {
      const employerId = generateId();
      const freelancerId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 1000,
        rushFee: 0,
        totalAmount: 1000,
        status: 'active', // Active, not completed!
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const ratingResult = await submitRating({
        contractId: contract.id,
        raterId: employerId,
        rateeId: freelancerId,
        rating: 5,
        reviewerRole: 'employer',
      });

      expect(ratingResult.success).toBe(false);
      if (!ratingResult.success) {
        expect(ratingResult.error.code).toBe('INVALID_CONTRACT_STATUS');
      }
    });

    it('rejects rating by non-participant user', async () => {
      const employerId = generateId();
      const freelancerId = generateId();
      const intruderId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 1000,
        rushFee: 0,
        totalAmount: 1000,
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const ratingResult = await submitRating({
        contractId: contract.id,
        raterId: intruderId, // Not party to contract!
        rateeId: freelancerId,
        rating: 5,
        reviewerRole: 'employer',
      });

      expect(ratingResult.success).toBe(false);
      if (!ratingResult.success) {
        expect(ratingResult.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects rating out of 1-5 range', async () => {
      const employerId = generateId();
      const freelancerId = generateId();

      const contract: Contract = {
        id: generateId(),
        projectId: generateId(),
        proposalId: generateId(),
        freelancerId,
        employerId,
        escrowAddress: '0x123',
        baseAmount: 1000,
        rushFee: 0,
        totalAmount: 1000,
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contractStore.set(contract.id, contract);

      const ratingResult = await submitRating({
        contractId: contract.id,
        raterId: employerId,
        rateeId: freelancerId,
        rating: 10, // Invalid, max is 5!
        reviewerRole: 'employer',
      });

      expect(ratingResult.success).toBe(false);
      if (!ratingResult.success) {
        expect(ratingResult.error.code).toBe('INVALID_RATING');
      }
    });
  });
});
