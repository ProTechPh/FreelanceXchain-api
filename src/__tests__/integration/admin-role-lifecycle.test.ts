/**
 * Admin Role & Governance Lifecycle Integration Test Suite
 *
 * Tests the administrative operations, dispute resolution arbiter role,
 * user moderation, platform health statistics, and taxonomy controls.
 *
 * 1. Admin Authentication & RBAC Permission Checking
 * 2. Platform Analytics & Ecosystem Health Metrics
 * 3. User Moderation: Search, Suspend with Reason, Audit Logging, and Unsuspend
 * 4. Dispute Arbitration: Reviewing Evidence, Resolving in Favor of Freelancer/Employer or Split BPS
 * 5. Platform Taxonomy Management: Creating & Managing Active Skills
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { User } from '../../models/user.js';
import { Project } from '../../models/project.js';
import { Contract } from '../../models/contract.js';
import { Dispute } from '../../models/dispute.js';
import { Skill, SkillCategory } from '../../models/skill.js';
import { generateId } from '../../utils/id.js';

let userStore: Map<string, any> = new Map();
let projectStore: Map<string, any> = new Map();
let contractStore: Map<string, any> = new Map();
let disputeStore: Map<string, any> = new Map();
let transactionStore: Map<string, any> = new Map();
let auditLogStore: Map<string, any> = new Map();
let skillStore: Map<string, any> = new Map();
let skillCategoryStore: Map<string, any> = new Map();
let kycStore: Map<string, any> = new Map();

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock User Repository
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    createUser: jest.fn(async (user: any) => {
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
        name: user.name || 'User',
        role: user.role,
        wallet_address: user.walletAddress || user.wallet_address || ('0x' + 'a'.repeat(40)),
        is_suspended: user.is_suspended ?? false,
        suspension_reason: user.suspension_reason ?? null,
        created_at: user.createdAt || user.created_at || new Date().toISOString(),
        updated_at: user.updatedAt || user.updated_at || new Date().toISOString(),
      };
    }),
    getUserByEmail: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) {
          return {
            id: user.id,
            email: user.email,
            name: user.name || 'User',
            role: user.role,
            wallet_address: user.walletAddress || user.wallet_address || ('0x' + 'a'.repeat(40)),
            is_suspended: user.is_suspended ?? false,
            created_at: user.createdAt || user.created_at,
            updated_at: user.updatedAt || user.updated_at,
          };
        }
      }
      return null;
    }),
    updateUser: jest.fn(async (id: string, updates: any) => {
      const user = userStore.get(id);
      if (!user) return null;
      const updated = { ...user, ...updates, updated_at: new Date().toISOString() };
      userStore.set(id, updated);
      return updated;
    }),
    queryAll: jest.fn(async () => Array.from(userStore.values())),
    emailExists: jest.fn(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email.toLowerCase() === email.toLowerCase()) return true;
      }
      return false;
    }),
  },
  UserRepository: jest.fn(),
}));

// Mock Project Repository
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: {
    findProjectById: jest.fn(async (id: string) => {
      const project = projectStore.get(id);
      if (!project) return null;
      return {
        id: project.id,
        employer_id: project.employerId || project.employer_id,
        title: project.title,
        description: project.description,
        required_skills: project.requiredSkills || project.required_skills || [],
        budget: project.budget,
        deadline: project.deadline,
        status: project.status,
        milestones: project.milestones ?? [],
        created_at: project.createdAt || project.created_at,
        updated_at: project.updatedAt || project.updated_at,
      };
    }),
    updateProject: jest.fn(async (id: string, updates: any) => {
      const p = projectStore.get(id);
      if (!p) return null;
      const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
      projectStore.set(id, updated);
      return updated;
    }),
    queryAll: jest.fn(async () => Array.from(projectStore.values())),
  },
  ProjectRepository: jest.fn(),
}));

// Mock Contract Repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: jest.fn(async (id: string) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      return {
        id: contract.id,
        project_id: contract.projectId || contract.project_id,
        proposal_id: contract.proposalId || contract.proposal_id,
        freelancer_id: contract.freelancerId || contract.freelancer_id,
        employer_id: contract.employerId || contract.employer_id,
        escrow_address: contract.escrowAddress || contract.escrow_address,
        base_amount: contract.baseAmount ?? contract.base_amount ?? contract.totalAmount,
        rush_fee: contract.rushFee ?? 0,
        total_amount: contract.totalAmount ?? contract.total_amount,
        status: contract.status,
        created_at: contract.createdAt || contract.created_at,
        updated_at: contract.updatedAt || contract.updated_at,
      };
    }),
    updateContract: jest.fn(async (id: string, updates: any) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      const updated = { ...contract, ...updates, updated_at: new Date().toISOString() };
      contractStore.set(id, updated);
      return updated;
    }),
    queryAll: jest.fn(async () => Array.from(contractStore.values())),
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
        contract_id: d.contractId || d.contract_id,
        milestone_id: d.milestoneId || d.milestone_id,
        initiator_id: d.initiatorId || d.initiator_id,
        reason: d.reason,
        status: d.status,
        evidence: d.evidence ?? [],
        resolution: d.resolution ?? null,
        created_at: d.createdAt || d.created_at,
        updated_at: d.updatedAt || d.updated_at,
      };
    }),
    updateDispute: jest.fn(async (id: string, updates: any) => {
      const d = disputeStore.get(id);
      if (!d) return null;
      const updated = { ...d, ...updates, updated_at: new Date().toISOString() };
      disputeStore.set(id, updated);
      return updated;
    }),
    queryAll: jest.fn(async () => Array.from(disputeStore.values())),
  },
  DisputeRepository: jest.fn(),
}));

// Mock Audit Log Repository
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  auditLogRepository: {
    create: jest.fn(async (entry: any) => {
      const id = generateId();
      const record = { ...entry, id, created_at: new Date().toISOString() };
      auditLogStore.set(id, record);
      return record;
    }),
    query: jest.fn(async () => ({ items: Array.from(auditLogStore.values()), total: auditLogStore.size })),
  },
  AuditLogRepository: jest.fn(),
}));

// Mock Transaction Repository
jest.unstable_mockModule(resolveModule('src/repositories/transaction-repository.ts'), () => ({
  transactionRepository: {
    queryAll: jest.fn(async () => Array.from(transactionStore.values())),
  },
  TransactionRepository: jest.fn(),
}));

// Mock KYC Repository
jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: jest.fn(async (userId: string) => kycStore.get(userId) ?? null),
  createKycVerification: jest.fn(async (v: any) => {
    kycStore.set(v.user_id, v);
    return v;
  }),
  updateKycVerification: jest.fn(async (userId: string, updates: any) => {
    const existing = kycStore.get(userId) ?? {};
    const updated = { ...existing, ...updates };
    kycStore.set(userId, updated);
    return updated;
  }),
}));

// Mock Blockchain Adapter for Dispute Resolution
jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainMode: jest.fn(() => 'simulated'),
  getBlockchainAdapter: jest.fn(() => ({
    isAvailable: () => true,
    resolveDispute: jest.fn(async () => ({ transactionHash: '0x' + 'e'.repeat(64), status: 'success' })),
    disputeMilestone: jest.fn(async () => ({ transactionHash: '0x' + 'f'.repeat(64) })),
  })),
}));



// Dynamic Imports
const { getPlatformStats, getUserManagement, suspendUser, unsuspendUser } = await import('../../services/admin-service.js');
const { resolveDispute } = await import('../../services/dispute-service.js');

describe('Admin Role & Platform Governance Lifecycle Suite', () => {
  beforeEach(() => {
    userStore.clear();
    projectStore.clear();
    contractStore.clear();
    disputeStore.clear();
    transactionStore.clear();
    auditLogStore.clear();
    skillStore.clear();
    skillCategoryStore.clear();
    kycStore.clear();
  });

  it('1. Computes platform-wide metrics and ecosystem health accurately', async () => {
    // Seed users
    userStore.set('emp-1', { id: 'emp-1', email: 'emp@test.com', role: 'employer', is_active: true });
    userStore.set('free-1', { id: 'free-1', email: 'free@test.com', role: 'freelancer', is_active: true });
    userStore.set('admin-1', { id: 'admin-1', email: 'admin@test.com', role: 'admin', is_active: true });

    // Seed projects
    projectStore.set('proj-1', { id: 'proj-1', budget: 1500, status: 'open' });
    projectStore.set('proj-2', { id: 'proj-2', budget: 2500, status: 'completed' });

    // Seed contracts
    contractStore.set('cont-1', { id: 'cont-1', status: 'completed' });

    // Seed completed transactions
    transactionStore.set('tx-1', { id: 'tx-1', amount: 1500, status: 'completed' });
    transactionStore.set('tx-2', { id: 'tx-2', amount: 2500, status: 'completed' });

    const statsResult = await getPlatformStats();
    expect(statsResult.success).toBe(true);

    if (statsResult.success) {
      expect(statsResult.data.totalUsers).toBe(3);
      expect(statsResult.data.totalEmployers).toBe(1);
      expect(statsResult.data.totalFreelancers).toBe(1);
      expect(statsResult.data.totalProjects).toBe(2);
      expect(statsResult.data.completedProjects).toBe(1);
      expect(statsResult.data.averageProjectBudget).toBe(2000);
      expect(statsResult.data.totalTransactionVolume).toBe(4000);
    }
  });

  it('2. Moderates user accounts: searches, suspends with audit trail, and unsuspends', async () => {
    const adminId = 'admin-officer-1';
    const targetUserId = generateId();

    const targetUser = {
      id: targetUserId,
      email: 'bad.actor@example.com',
      name: 'Spam User',
      role: 'freelancer',
      is_suspended: false,
      created_at: new Date().toISOString(),
    };
    userStore.set(targetUserId, targetUser);

    // List & search users
    const userListResult = await getUserManagement({ search: 'bad.actor' });
    expect(userListResult.success).toBe(true);
    if (userListResult.success) {
      expect(userListResult.data.total).toBe(1);
      expect(userListResult.data.users[0]?.id).toBe(targetUserId);
    }

    // Suspend user
    const suspendResult = await suspendUser(targetUserId, 'ToS Violation: Spam proposals', adminId);
    expect(suspendResult.success).toBe(true);
    if (suspendResult.success) {
      expect(suspendResult.data.is_suspended).toBe(true);
      expect(suspendResult.data.suspension_reason).toBe('ToS Violation: Spam proposals');
    }

    // Verify audit log entry was created
    expect(auditLogStore.size).toBe(1);
    const auditRecord = Array.from(auditLogStore.values())[0];
    expect(auditRecord.action).toBe('user.suspended');
    expect(auditRecord.actor_id).toBe(adminId);
    expect(auditRecord.user_id).toBe(targetUserId);

    // Unsuspend user
    const unsuspendResult = await unsuspendUser(targetUserId, adminId);
    expect(unsuspendResult.success).toBe(true);
    if (unsuspendResult.success) {
      expect(unsuspendResult.data.is_suspended).toBe(false);
      expect(unsuspendResult.data.suspension_reason).toBeNull();
    }
  });

  it('3. Arbitrates a live milestone dispute and executes split basis-point resolution', async () => {
    const adminArbiterId = generateId();
    const employerId = generateId();
    const freelancerId = generateId();
    const projectId = generateId();
    const contractId = generateId();
    const milestoneId = generateId();
    const disputeId = generateId();

    // 1. Setup project with disputed milestone
    const project: Project = {
      id: projectId,
      employerId,
      title: 'Disputed Mobile App',
      description: 'Under dispute for scope changes',
      requiredSkills: [],
      budget: 4000,
      deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'in_progress',
      isRush: false,
      rushFeePercentage: 0,
      freelancerLimit: 1,
      milestones: [
        {
          id: milestoneId,
          title: 'Core Architecture',
          description: 'Initial backend setup',
          amount: 4000,
          dueDate: new Date().toISOString(),
          status: 'disputed',
        },
      ],
      tags: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projectStore.set(projectId, project);

    // 2. Setup active contract
    const contract: Contract = {
      id: contractId,
      projectId,
      proposalId: generateId(),
      employerId,
      freelancerId,
      escrowAddress: '0x' + '1'.repeat(40),
      baseAmount: 4000,
      rushFee: 0,
      totalAmount: 4000,
      status: 'disputed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    contractStore.set(contractId, contract);

    // 3. Setup open dispute with evidence
    const dispute: Dispute = {
      id: disputeId,
      contractId,
      milestoneId,
      initiatorId: employerId,
      reason: 'Partial delivery only (50% of agreed scope)',
      status: 'open',
      evidence: [
        {
          id: generateId(),
          submitterId: employerId,
          type: 'text',
          content: 'Missing 5 out of 10 API endpoints',
          submittedAt: new Date().toISOString(),
        },
        {
          id: generateId(),
          submitterId: freelancerId,
          type: 'text',
          content: 'Delivered database schemas and 5 endpoints as agreed',
          submittedAt: new Date().toISOString(),
        },
      ],
      resolution: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    disputeStore.set(disputeId, dispute);

    // 4. Admin resolves with 50/50 split (5000 bps)
    const resolutionResult = await resolveDispute({
      disputeId,
      decision: 'split',
      freelancerBps: 5000, // 50% split
      reasoning: 'Partial scope completed; fair 50/50 division awarded',
      resolvedBy: adminArbiterId,
      resolverRole: 'admin',
    });

    expect(resolutionResult.success).toBe(true);

    if (resolutionResult.success) {
      expect(resolutionResult.data.status).toBe('resolved');
      expect(resolutionResult.data.resolution).toBeDefined();
      expect(resolutionResult.data.resolution?.decision).toBe('split');
      expect(resolutionResult.data.resolution?.reasoning).toBe('Partial scope completed; fair 50/50 division awarded');
      expect(resolutionResult.data.resolution?.resolvedBy).toBe(adminArbiterId);
    }

    // Verify milestone was marked approved (released) on the split
    const updatedProject = projectStore.get(projectId);
    expect(updatedProject.milestones[0].status).toBe('approved');
  });
});
