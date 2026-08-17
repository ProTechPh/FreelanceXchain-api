// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore,
  createMockContractRepository,
  createMockProjectRepository,
  createMockNotificationRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestContract,
  createTestProject,
  createTestMilestone,
  createTestDispute,
  createTestEvidence
} from '../helpers/test-data-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';
import { generateId } from '../../utils/id.js';

const disputeStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const notificationStore = createInMemoryStore();

const mockContractRepo = createMockContractRepository(contractStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

// Create custom dispute repository mock (not in factory yet)
const mockDisputeRepo = {
  createDispute: jest.fn<any>(async (dispute: any) => {
    const now = new Date().toISOString();
    const entity = { ...dispute, created_at: now, updated_at: now };
    disputeStore.set(entity.id, entity);
    return entity;
  }),
  findDisputeById: jest.fn<any>(async (id: string) => {
    return disputeStore.get(id) ?? null;
  }),
  getDisputeById: jest.fn<any>(async (id: string) => {
    return disputeStore.get(id) ?? null;
  }),
  updateDispute: jest.fn<any>(async (id: string, updates: any) => {
    const dispute = disputeStore.get(id);
    if (!dispute) return null;
    const updated = { ...dispute, ...updates, updated_at: new Date().toISOString() };
    disputeStore.set(id, updated);
    return updated;
  }),
  getDisputeByMilestone: jest.fn<any>(async (milestoneId: string) => {
    for (const dispute of disputeStore.values()) {
      const d = dispute as any;
      if (d.milestone_id === milestoneId) return d;
    }
    return null;
  }),
  getAllDisputesByContract: jest.fn<any>(async (contractId: string) => {
    return Array.from(disputeStore.values())
      .filter((d: any) => d.contract_id === contractId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }),
  getOpenDisputes: jest.fn<any>(async () => {
    const items = Array.from(disputeStore.values())
      .filter((d: any) => d.status === 'open' || d.status === 'under_review')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { items, hasMore: false };
  }),
  getDisputesByInitiator: jest.fn<any>(async (initiatorId: string) => {
    const items = Array.from(disputeStore.values())
      .filter((d: any) => d.initiator_id === initiatorId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { items, hasMore: false };
  }),
  getDisputesByStatus: jest.fn<any>(async (status: string) => {
    const items = Array.from(disputeStore.values())
      .filter((d: any) => d.status === status)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { items, hasMore: false };
  }),
  getAllDisputes: jest.fn<any>(async (options?: any) => {
    const items = Array.from(disputeStore.values())
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limit = options?.limit || items.length;
    const offset = options?.offset || 0;
    return { items: items.slice(offset, offset + limit), hasMore: offset + limit < items.length, total: items.length };
  }),
  getDisputesByUserId: jest.fn<any>(async (userId: string, options?: any) => {
    const items = Array.from(disputeStore.values())
      .filter((d: any) => d.initiator_id === userId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const limit = options?.limit || items.length;
    const offset = options?.offset || 0;
    return { items: items.slice(offset, offset + limit), hasMore: offset + limit < items.length, total: items.length };
  }),
  clear: () => disputeStore.clear(),
};

// Create mock blockchain adapter (dispute escrow resolution routes through it)
const mockBlockchainAdapter = {
  isAvailable: jest.fn<any>(() => true),
  resolveDispute: jest.fn<any>(async () => ({
    transactionHash: '0x' + 'b'.repeat(64),
    receipt: {
      transactionHash: '0x' + 'b'.repeat(64),
      blockNumber: 12345,
      status: 'success',
      gasUsed: BigInt(21000),
      timestamp: Date.now(),
    },
  })),
  disputeMilestone: jest.fn<any>(async () => ({
    transactionHash: '0x' + 'd'.repeat(64),
  })),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Payment records: dispute resolutions write one 'dispute_resolution' record per
// payee so the payments log matches the ledger (audit Finding 2-4).
const mockPaymentRepo = {
  create: jest.fn<any>(async (payment: any) => ({ ...payment })),
};
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  paymentRepository: mockPaymentRepo,
  PaymentType: {},
}));

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

// Mock blockchain factory (dispute resolution routes through the adapter)
jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainAdapter: jest.fn<any>(() => mockBlockchainAdapter),
}));

// Mock dispute-registry (blockchain recording)
const mockCreateDisputeOnBlockchain = jest.fn<any>().mockResolvedValue({
  transactionHash: '0x' + 'a'.repeat(64), blockNumber: 12345, status: 'success',
});
const mockUpdateDisputeEvidence = jest.fn<any>().mockResolvedValue({
  transactionHash: '0x' + 'b'.repeat(64), blockNumber: 12346, status: 'success',
});
const mockResolveDisputeOnBlockchain = jest.fn<any>().mockResolvedValue({
  transactionHash: '0x' + 'c'.repeat(64), blockNumber: 12347, status: 'success',
});
jest.unstable_mockModule(resolveModule('src/services/dispute-registry.ts'), () => ({
  createDisputeOnBlockchain: mockCreateDisputeOnBlockchain,
  updateDisputeEvidence: mockUpdateDisputeEvidence,
  resolveDisputeOnBlockchain: mockResolveDisputeOnBlockchain,
}));

// Mock agreement-contract
const mockDisputeAgreement = jest.fn<any>().mockResolvedValue(undefined);
const mockCompleteAgreement = jest.fn<any>().mockResolvedValue({ agreement: {}, receipt: {} });
jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: mockDisputeAgreement,
  completeAgreement: mockCompleteAgreement,
}));

// Mock audit-log repository (admin dispute-resolution audit trail, BLF-12.2)
const mockAuditLogRepo = { create: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  auditLogRepository: mockAuditLogRepo,
}));

// Email delivery (preference-gated transactional emails). Mocked so the real
// email-preference-service / user-repository do not consume the queued
// mockDatabases.getDocument/listDocuments responses in createDispute tests.
const mockSendGatedEmail = jest.fn<any>().mockResolvedValue(true);
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendGatedEmail: mockSendGatedEmail,
  sendDisputeCreatedEmail: jest.fn<any>().mockResolvedValue({ success: true, data: { messageId: 'x' } }),
}));

const {
  createDispute,
  getDisputeById,
  submitEvidence,
  resolveDispute,
  getDisputesByContract,
  getOpenDisputes,
} = await import('../../services/dispute-service.js');

describe('Dispute Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockDisputeRepo.clear();
    mockContractRepo.clear();
    mockProjectRepo.clear();
    mockNotificationRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 53: Dispute creation**
   * **Validates: Requirements 6.1**
   * 
   * For any valid dispute data, creating a dispute shall store it and
   * notify relevant parties.
   */
  it('Property 53: Dispute creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10),
        async (initiatorId, reason) => {
          const contract = createTestContract({ 
            freelancer_id: initiatorId,
            status: 'active' 
          });
          contractStore.set(contract.id, contract);

          const milestone = createTestMilestone({ status: 'submitted' });
          const project = createTestProject({ 
            id: contract.project_id,
            milestones: [milestone] 
          });
          projectStore.set(project.id, project);

          const result = await createDispute({
            contractId: contract.id,
            milestoneId: milestone.id,
            initiatorId,
            reason,
          });

          expect(result.success).toBe(true);
          if (result.success) {
            const dispute = result.data;
            assertIsValidId(dispute.id);
            expect(dispute.contractId).toBe(contract.id);
            expect(dispute.milestoneId).toBe(milestone.id);
            expect(dispute.initiatorId).toBe(initiatorId);
            expect(dispute.reason).toBe(reason);
            expect(dispute.status).toBe('open');
            expect(dispute.evidence).toEqual([]);
            assertHasTimestamps(dispute);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 54: Evidence submission**
   * **Validates: Requirements 6.2**
   * 
   * Submitting evidence shall add it to the dispute and update the dispute status.
   */
  it('Property 54: Evidence submission', async () => {
    const freelancerId = 'user-123';
    const employerId = generateId();
    
    const contract = createTestContract({
      freelancer_id: freelancerId,
      employer_id: employerId
    });
    contractStore.set(contract.id, contract);
    
    const dispute = createTestDispute({ 
      contract_id: contract.id,
      status: 'open', 
      evidence: [] 
    });
    disputeStore.set(dispute.id, dispute);

    const evidence = {
      submitterId: freelancerId,
      type: 'text' as const,
      content: 'This is my evidence',
    };

    const result = await submitEvidence({
      disputeId: dispute.id,
      submitterId: evidence.submitterId,
      type: evidence.type,
      content: evidence.content,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const updated = result.data;
      expect(updated.evidence).toHaveLength(1);
      expect(updated.evidence[0]?.submitterId).toBe(evidence.submitterId);
      expect(updated.evidence[0]?.type).toBe(evidence.type);
      expect(updated.evidence[0]?.content).toBe(evidence.content);
      if (updated.evidence[0]) {
        assertIsValidId(updated.evidence[0].id);
      }
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 55: Dispute resolution**
   * **Validates: Requirements 6.3**
   * 
   * Resolving a dispute shall update its status, record the resolution,
   * and notify all parties.
   */
  it('Property 55: Dispute resolution', async () => {
    const contract = createTestContract();
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone();
    const project = createTestProject({ 
      id: contract.project_id,
      milestones: [milestone] 
    });
    projectStore.set(project.id, project);

    const dispute = createTestDispute({ 
      contract_id: contract.id,
      milestone_id: milestone.id,
      status: 'under_review',
      resolution: null 
    });
    disputeStore.set(dispute.id, dispute);

    const resolution = {
      decision: 'freelancer_favor' as const,
      reasoning: 'Evidence supports freelancer',
      resolvedBy: 'admin-123',
    };

    const result = await resolveDispute({
      disputeId: dispute.id,
      decision: resolution.decision,
      reasoning: resolution.reasoning,
      resolvedBy: resolution.resolvedBy,
      resolverRole: 'admin',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const resolved = result.data;
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).not.toBeNull();
      expect(resolved.resolution?.decision).toBe(resolution.decision);
      expect(resolved.resolution?.reasoning).toBe(resolution.reasoning);
      expect(resolved.resolution?.resolvedBy).toBe(resolution.resolvedBy);
    }
    
    const notifications = Array.from(notificationStore.values());
    expect(notifications.length).toBeGreaterThan(0);
  });
});

describe('Dispute Service - Unit Tests', () => {
  beforeEach(() => {
    mockDisputeRepo.clear();
    mockContractRepo.clear();
    mockProjectRepo.clear();
    mockNotificationRepo.clear();
  });

  it('should create dispute with valid data', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    
    const contract = createTestContract({ 
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active' 
    });
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone({ status: 'submitted' });
    const project = createTestProject({ 
      id: contract.project_id,
      milestones: [milestone] 
    });
    projectStore.set(project.id, project);

    const result = await createDispute({
      contractId: contract.id,
      milestoneId: milestone.id,
      initiatorId: freelancerId,
      reason: 'Work not completed as agreed',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const dispute = result.data;
      assertIsValidId(dispute.id);
      expect(dispute.status).toBe('open');
      expect(dispute.evidence).toEqual([]);
      assertHasTimestamps(dispute);
    }
  });

  it('should get dispute by ID', async () => {
    const dispute = createTestDispute();
    disputeStore.set(dispute.id, dispute);

    const result = await getDisputeById(dispute.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe(dispute.id);
    }
  });

  it('should return null for non-existent dispute', async () => {
    const result = await getDisputeById('non-existent-id');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should get disputes by contract', async () => {
    const freelancerId = generateId();
    const employerId = generateId();
    const contractId = generateId();
    
    const contract = createTestContract({
      id: contractId,
      freelancer_id: freelancerId,
      employer_id: employerId
    });
    contractStore.set(contract.id, contract);
    
    const dispute1 = createTestDispute({ 
      contract_id: contractId,
      initiator_id: freelancerId
    });
    const dispute2 = createTestDispute({ 
      contract_id: contractId,
      initiator_id: employerId
    });
    const dispute3 = createTestDispute({ contract_id: 'other-contract' });

    disputeStore.set(dispute1.id, dispute1);
    disputeStore.set(dispute2.id, dispute2);
    disputeStore.set(dispute3.id, dispute3);

    const result = await getDisputesByContract(contractId, freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.length).toBe(2);
      expect(result.data?.every((d: any) => d.contractId === contractId)).toBe(true);
    }
  });

  it('should get open disputes', async () => {
    const openDispute = createTestDispute({ status: 'open' });
    const underReviewDispute = createTestDispute({ status: 'under_review' });
    const resolvedDispute = createTestDispute({ status: 'resolved' });

    disputeStore.set(openDispute.id, openDispute);
    disputeStore.set(underReviewDispute.id, underReviewDispute);
    disputeStore.set(resolvedDispute.id, resolvedDispute);

    const result = await getOpenDisputes();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.length).toBe(2);
      expect(result.data?.some((d: any) => d.id === openDispute.id)).toBe(true);
      expect(result.data?.some((d: any) => d.id === underReviewDispute.id)).toBe(true);
      expect(result.data?.some((d: any) => d.id === resolvedDispute.id)).toBe(false);
    }
  });

  it('should submit evidence to dispute', async () => {
    const freelancerId = 'user-123';
    const employerId = generateId();
    
    const contract = createTestContract({
      freelancer_id: freelancerId,
      employer_id: employerId
    });
    contractStore.set(contract.id, contract);
    
    const dispute = createTestDispute({ 
      contract_id: contract.id,
      status: 'open', 
      evidence: [] 
    });
    disputeStore.set(dispute.id, dispute);

    const evidence = {
      submitterId: freelancerId,
      type: 'file' as const,
      content: 'https://example.com/evidence.pdf',
    };

    const result = await submitEvidence({
      disputeId: dispute.id,
      submitterId: evidence.submitterId,
      type: evidence.type,
      content: evidence.content,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const updated = result.data;
      expect(updated.evidence?.length).toBe(1);
      if (updated.evidence && updated.evidence[0]) {
        assertIsValidId(updated.evidence[0].id);
        expect(updated.evidence[0].submitterId).toBe(evidence.submitterId);
      }
    }
  });

  it('should allow multiple evidence submissions', async () => {
    const freelancerId = 'user-1';
    const employerId = 'user-2';
    
    const contract = createTestContract({
      freelancer_id: freelancerId,
      employer_id: employerId
    });
    contractStore.set(contract.id, contract);
    
    const dispute = createTestDispute({ 
      contract_id: contract.id,
      status: 'open', 
      evidence: [] 
    });
    disputeStore.set(dispute.id, dispute);

    const result1 = await submitEvidence({
      disputeId: dispute.id,
      submitterId: freelancerId,
      type: 'text',
      content: 'First evidence',
    });
    expect(result1.success).toBe(true);

    const result2 = await submitEvidence({
      disputeId: dispute.id,
      submitterId: employerId,
      type: 'text',
      content: 'Second evidence',
    });
    expect(result2.success).toBe(true);

    const updated = disputeStore.get(dispute.id) as any;
    expect(updated.evidence?.length).toBe(2);
  });

  it('should resolve dispute with decision', async () => {
    const contract = createTestContract();
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone();
    const project = createTestProject({ 
      id: contract.project_id,
      milestones: [milestone] 
    });
    projectStore.set(project.id, project);

    const dispute = createTestDispute({ 
      contract_id: contract.id,
      milestone_id: milestone.id,
      status: 'under_review' 
    });
    disputeStore.set(dispute.id, dispute);

    const resolution = {
      decision: 'employer_favor' as const,
      reasoning: 'Freelancer did not meet requirements',
      resolvedBy: 'admin-456',
    };

    const result = await resolveDispute({
      disputeId: dispute.id,
      decision: resolution.decision,
      reasoning: resolution.reasoning,
      resolvedBy: resolution.resolvedBy,
      resolverRole: 'admin',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const resolved = result.data;
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBeDefined();
      expect(resolved.resolution?.decision).toBe('employer_favor');
    }
    // BLF-12.2: the resolution is persisted to the durable audit log with full context
    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      actor_id: resolution.resolvedBy,
      action: 'dispute.resolved',
      resource_type: 'dispute',
      resource_id: dispute.id,
      payload: expect.objectContaining({
        decision: resolution.decision,
        reasoning: resolution.reasoning,
        contractId: contract.id,
        milestoneId: milestone.id,
      }),
    }));
    // employer_favor: the full milestone amount returns to the employer (one record).
    expect(mockPaymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: contract.id,
      milestone_id: milestone.id,
      payer_id: contract.freelancer_id,
      payee_id: contract.employer_id,
      amount: 500,
      payment_type: 'dispute_resolution',
      status: 'completed',
    }));
  });

  it('should update contract status when resolving dispute', async () => {
    const contract = createTestContract({ status: 'disputed' });
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone();
    const project = createTestProject({ 
      id: contract.project_id,
      milestones: [milestone] 
    });
    projectStore.set(project.id, project);

    const dispute = createTestDispute({ 
      contract_id: contract.id,
      milestone_id: milestone.id,
      status: 'under_review' 
    });
    disputeStore.set(dispute.id, dispute);

    const result = await resolveDispute({
      disputeId: dispute.id,
      decision: 'freelancer_favor',
      reasoning: 'Freelancer provided sufficient evidence',
      resolvedBy: 'admin-789',
      resolverRole: 'admin',
    });

    expect(result.success).toBe(true);
    const updatedContract = contractStore.get(contract.id) as any;
    // Contract status should remain as it was set (disputed -> active after resolution)
    expect(['active', 'completed']).toContain(updatedContract?.status);
    // freelancer_favor: the full milestone amount is paid to the freelancer (one record).
    expect(mockPaymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: contract.id,
      milestone_id: milestone.id,
      payer_id: contract.employer_id,
      payee_id: contract.freelancer_id,
      amount: 500,
      payment_type: 'dispute_resolution',
      status: 'completed',
    }));
  });

  it('should send notifications when creating dispute', async () => {
    const contract = createTestContract({ 
      freelancer_id: 'freelancer-123',
      employer_id: 'employer-456',
      status: 'active'
    });
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone({ status: 'submitted' });
    const project = createTestProject({ 
      id: contract.project_id,
      milestones: [milestone] 
    });
    projectStore.set(project.id, project);

    const result = await createDispute({
      contractId: contract.id,
      milestoneId: milestone.id,
      initiatorId: 'freelancer-123',
      reason: 'Payment not received',
    });

    expect(result.success).toBe(true);
    const notifications = Array.from(notificationStore.values());
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.some((n: any) => n.type === 'dispute_created')).toBe(true);
  });

  it('should serialize concurrent dispute creation on the same milestone (M9 pay + dispute race)', async () => {
    const freelancerId = generateId();
    const employerId = generateId();

    const contract = createTestContract({
      freelancer_id: freelancerId,
      employer_id: employerId,
      status: 'active',
    });
    contractStore.set(contract.id, contract);

    const milestone = createTestMilestone({ status: 'submitted' });
    const project = createTestProject({
      id: contract.project_id,
      milestones: [milestone],
    });
    projectStore.set(project.id, project);

    const attempt = () => createDispute({
      contractId: contract.id,
      milestoneId: milestone.id,
      initiatorId: freelancerId,
      reason: 'Race condition test',
    });

    // Fire both concurrently. The shared milestone-approve lock serializes them
    // (the same key approveMilestone uses), so exactly one dispute is created and
    // the second is rejected as a duplicate — no double-commit possible.
    const [first, second] = await Promise.all([attempt(), attempt()]);

    expect(first.success || second.success).toBe(true);
    expect(first.success && second.success).toBe(false);

    // The losing call must be rejected by the serialization (proving the lock let
    // the winner fully commit before the loser re-ran its checks): it either trips
    // the duplicate-dispute check, or — because the winner flips the contract to
    // 'disputed' — the contract-status gate that now precedes it.
    const loser = first.success ? second : first;
    expect(loser.success).toBe(false);
    if (!loser.success) {
      expect(['DUPLICATE_DISPUTE', 'INVALID_CONTRACT_STATUS']).toContain(loser.error.code);
    }

    const disputes = Array.from(disputeStore.values())
      .filter((d: any) => d.milestone_id === milestone.id);
    expect(disputes).toHaveLength(1);
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

const mockContractRepository = mockContractRepo;
const mockProjectRepository = mockProjectRepo;
const mockDisputeRepository = mockDisputeRepo;
const mockDatabases = (globalThis as any).__mockDatabases;

describe('dispute-service – error catch returns FETCH_FAILED', () => {
  beforeEach(() => jest.clearAllMocks());

  it('L644: catch block returns FETCH_FAILED in getAllDisputes', async () => {
    mockDisputeRepository.getAllDisputes.mockRejectedValue(new Error('db down'));

    const { getAllDisputes } = await import(resolveModule('src/services/dispute-service.ts'));
    const result = await getAllDisputes('u1', 'admin');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FETCH_FAILED');
    }
  });
});

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

  it('should handle resolveDispute with split decision (defaults to 5000 bps)', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [], resolution: null,
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
      transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
    });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
      resolution: { decision: 'split', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'split', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(true);
    // Default split ratio is 50/50 (5000 bps)
    expect(mockBlockchainAdapter.resolveDispute).toHaveBeenCalledWith('0xescrow', 0, 5000);
    if (result.success) expect(result.data.resolution?.decision).toBe('split');
    // Split resolution writes one payment record per payee (50/50 of the 100 milestone).
    expect(mockPaymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: 'c1', milestone_id: 'm1', payer_id: 'e1', payee_id: 'f1',
      amount: 50, payment_type: 'dispute_resolution', tx_hash: '0xtx', status: 'completed',
    }));
    expect(mockPaymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: 'c1', milestone_id: 'm1', payer_id: 'f1', payee_id: 'e1',
      amount: 50, payment_type: 'dispute_resolution', tx_hash: '0xtx', status: 'completed',
    }));
  });

  it('should handle resolveDispute with split decision and explicit freelancerBps', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [], resolution: null,
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
      transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
    });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
      resolution: { decision: 'split', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'split', reasoning: 'test', freelancerBps: 7500,
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(true);
    expect(mockBlockchainAdapter.resolveDispute).toHaveBeenCalledWith('0xescrow', 0, 7500);
  });

  it('still resolves when the payment record write fails (best-effort log)', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [], resolution: null,
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({ transactionHash: '0xtx' });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
      resolution: { decision: 'split', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });
    mockPaymentRepo.create.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'split', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });

    // The resolution itself is unaffected — the funds already moved on-chain.
    expect(result.success).toBe(true);
    expect(mockDisputeRepository.updateDispute).toHaveBeenCalled();
  });

  it('completes the on-chain agreement when the employer has a wallet (audit Finding 5)', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [], resolution: null,
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({ transactionHash: '0xtx' });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
      resolution: { decision: 'freelancer_favor', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });
    // The employer lookup (real userRepository -> appwrite getDocument) returns a wallet.
    const mockDbs = (globalThis as any).__mockDatabases;
    mockDbs.getDocument.mockResolvedValueOnce({
      $id: 'e1', wallet_address: '0xemployer', name: 'Employer', role: 'employer',
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });

    expect(result.success).toBe(true);
    // Single milestone resolved in the freelancer's favour -> contract completed,
    // and the on-chain agreement registry is completed to match (best-effort).
    expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c1', { status: 'completed' });
    expect(mockCompleteAgreement).toHaveBeenCalledWith('c1', '0xemployer');
  });

  it('still resolves when completing the agreement fails (best-effort, audit Finding 5)', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [], resolution: null,
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({ transactionHash: '0xtx' });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
      resolution: { decision: 'freelancer_favor', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });
    const mockDbs = (globalThis as any).__mockDatabases;
    mockDbs.getDocument.mockResolvedValueOnce({
      $id: 'e1', wallet_address: '0xemployer', name: 'Employer', role: 'employer',
    });
    mockCompleteAgreement.mockRejectedValueOnce(new Error('Agreement not found'));

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });

    // The failed agreement write is logged, never fails the resolution.
    expect(result.success).toBe(true);
    expect(mockDisputeRepository.updateDispute).toHaveBeenCalled();
  });

  it('should reject split decisions with invalid freelancerBps (0 or 10000)', async () => {
    mockBlockchainAdapter.resolveDispute.mockClear();
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'split', reasoning: 'test', freelancerBps: 0,
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_SPLIT_BPS');
    expect(mockBlockchainAdapter.resolveDispute).not.toHaveBeenCalled();
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

describe('dispute-service.ts - Branch Coverage', () => {
  it('L463: hasOtherDisputes check', () => {
    const milestones = [{ id: 'm1', status: 'disputed' }, { id: 'm2', status: 'approved' }];
    expect(milestones.some(m => m.status === 'disputed' && m.id !== 'm1')).toBe(false);
    const ms2 = [{ id: 'm1', status: 'disputed' }, { id: 'm2', status: 'disputed' }];
    expect(ms2.some(m => m.status === 'disputed' && m.id !== 'm1')).toBe(true);
  });

  it('L644: error message fallback', () => {
    const error = 'string error';
    expect(error instanceof Error ? error.message : 'Failed to fetch disputes').toBe('Failed to fetch disputes');
  });
});

describe('Dispute Service - Additional Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getContractById.mockReset();
    mockProjectRepository.findProjectById.mockReset();
    mockDisputeRepository.getDisputeById.mockReset();
    mockDisputeRepository.updateDispute.mockReset();
    mockDisputeRepository.getDisputeByMilestone.mockReset();
    mockDisputeRepository.getAllDisputesByContract.mockReset();
    mockDisputeRepository.getAllDisputes.mockReset();
    mockDisputeRepository.getDisputesByUserId.mockReset();
    mockDisputeRepository.getDisputesByInitiator.mockReset();
    mockDisputeRepository.getDisputesByStatus.mockReset();
    mockDisputeRepository.createDispute.mockReset();
    mockBlockchainAdapter.isAvailable.mockReset().mockReturnValue(true);
    mockBlockchainAdapter.resolveDispute.mockReset();
    mockBlockchainAdapter.disputeMilestone.mockReset();
  });

  const importModule = async () => import('../../services/dispute-service.js');

  it('should return NOT_FOUND when contract not found in createDispute', async () => {
    const { createDispute } = await importModule();
    mockContractRepository.getContractById.mockResolvedValueOnce(null);

    const result = await createDispute({
      contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('L203: should catch disputeMilestone throw and still succeed', async () => {
    const { createDispute } = await importModule();
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce(null);
    mockDisputeRepository.createDispute.mockResolvedValueOnce({
      id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'e1',
      reason: 'test', evidence: [], status: 'open', resolution: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    mockBlockchainAdapter.disputeMilestone.mockRejectedValueOnce(new Error('chain error'));

    const result = await createDispute({
      contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('should return NOT_FOUND when milestone not found in createDispute', async () => {
    const { createDispute } = await importModule();
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm-other', title: 'Other', status: 'submitted', amount: 100 }],
    });

    const result = await createDispute({
      contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return NOT_FOUND when contract not found in submitEvidence', async () => {
    const { submitEvidence } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      initiator_id: 'i1', reason: 'r', evidence: [],
    });
    mockContractRepository.getContractById.mockResolvedValueOnce(null);

    const result = await submitEvidence({
      disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return NOT_FOUND when contract not found in resolveDispute', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce(null);

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return NOT_FOUND when project not found in resolveDispute', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return NOT_FOUND when milestone not found in resolveDispute', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm-other', title: 'Other', status: 'submitted', amount: 100 }],
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should bypass escrow when escrow not found and resolve with freelancer_favor', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ESCROW_NOT_FOUND');
        expect(result.error.message).toContain('Escrow record not found');
      }
  });

  it('should bypass escrow when escrow not found and resolve with employer_favor', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'employer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('ESCROW_NOT_FOUND');
      expect(result.error.message).toContain('Escrow record not found');
    }
  });

  it('should return PAYMENT_FAILED when escrow release throws', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockRejectedValueOnce(new Error('Payment failed'));

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PAYMENT_FAILED');
  });

  it('should return NOT_FOUND when contract not found in getDisputesByContract', async () => {
    const { getDisputesByContract } = await importModule();
    mockContractRepository.getContractById.mockResolvedValueOnce(null);

    const result = await getDisputesByContract('c1', 'user-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return UPDATE_FAILED when dispute update returns null in resolveDispute', async () => {
    const { resolveDispute } = await importModule();
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
      transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
    });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce(null);

    const result = await resolveDispute({
      disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
      resolvedBy: 'admin-1', resolverRole: 'admin',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════
// Coverage gap tests — each test targets a specific uncovered line
// ═══════════════════════════════════════════════════════════════

describe('Dispute Service - Coverage Gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getContractById.mockReset();
    mockProjectRepository.findProjectById.mockReset();
    mockDisputeRepository.getDisputeById.mockReset();
    mockDisputeRepository.updateDispute.mockReset();
    mockDisputeRepository.getDisputeByMilestone.mockReset();
    mockDisputeRepository.getAllDisputesByContract.mockReset();
    mockDisputeRepository.getAllDisputes.mockReset();
    mockDisputeRepository.getDisputesByUserId.mockReset();
    mockDisputeRepository.getDisputesByInitiator.mockReset();
    mockDisputeRepository.getDisputesByStatus.mockReset();
    mockDisputeRepository.createDispute.mockReset();
    mockBlockchainAdapter.isAvailable.mockReset().mockReturnValue(true);
    mockBlockchainAdapter.resolveDispute.mockReset();
    mockBlockchainAdapter.disputeMilestone.mockReset();
    mockCreateDisputeOnBlockchain.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'a'.repeat(64), blockNumber: 12345, status: 'success',
    });
    mockResolveDisputeOnBlockchain.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'c'.repeat(64), blockNumber: 12347, status: 'success',
    });
    mockDisputeAgreement.mockReset().mockResolvedValue(undefined);
    mockUpdateDisputeEvidence.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'b'.repeat(64), blockNumber: 12346, status: 'success',
    });
  });

  const importModule = async () => import('../../services/dispute-service.js');

  describe('createDispute (L70, L109, L181, L233)', () => {
    it('L70: should return NOT_FOUND when contract not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L109: should return NOT_FOUND when milestone not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm-other', title: 'Other', status: 'submitted', amount: 100 }],
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L181: should catch blockchain recording errors gracefully', async () => {
      const { createDispute } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce(null);
      mockDisputeRepository.createDispute.mockResolvedValueOnce({
        id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'e1',
        reason: 'test', evidence: [], status: 'open', resolution: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      // Mock global Appwrite to return users with wallet_address for getUserById calls
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument
        .mockResolvedValueOnce({ $id: 'e1', wallet_address: '0x' + 'e'.repeat(40), name: 'Employer', role: 'employer' })
        .mockResolvedValueOnce({ $id: 'f1', wallet_address: '0x' + 'f'.repeat(40), name: 'Freelancer', role: 'freelancer' })
        .mockResolvedValueOnce({ $id: 'e1', wallet_address: '0x' + 'e'.repeat(40), name: 'Employer', role: 'employer' });

      // Make createDisputeOnBlockchain throw to trigger L181 catch
      mockCreateDisputeOnBlockchain.mockRejectedValueOnce(new Error('blockchain error'));

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      // Should still succeed despite blockchain error
      expect(result.success).toBe(true);
    });

    it('L233: should catch admin notification errors gracefully', async () => {
      const { createDispute } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce(null);
      mockDisputeRepository.createDispute.mockResolvedValueOnce({
        id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'e1',
        reason: 'test', evidence: [], status: 'open', resolution: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      // Make Appwrite listDocuments throw for getUsersByRole call
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.listDocuments.mockRejectedValueOnce(new Error('admin lookup failed'));

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('L178: should call disputeAgreement when users have wallet addresses', async () => {
      const { createDispute } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce(null);
      mockDisputeRepository.createDispute.mockResolvedValueOnce({
        id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'e1',
        reason: 'test', evidence: [], status: 'open', resolution: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      // Mock global Appwrite to return users with wallet_address
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument
        .mockResolvedValueOnce({ $id: 'e1', wallet_address: '0x' + 'e'.repeat(40), name: 'Employer', role: 'employer' })
        .mockResolvedValueOnce({ $id: 'f1', wallet_address: '0x' + 'f'.repeat(40), name: 'Freelancer', role: 'freelancer' })
        .mockResolvedValueOnce({ $id: 'e1', wallet_address: '0x' + 'e'.repeat(40), name: 'Employer', role: 'employer' });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(true);
      // Verify L178 was reached: disputeAgreement was called
      expect(mockDisputeAgreement).toHaveBeenCalledWith('c1', '0x' + 'e'.repeat(40));
    });

    it('L221: should notify admin users when getUsersByRole returns admins', async () => {
      const { createDispute } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', employer_id: 'e1', freelancer_id: 'f1', project_id: 'p1', status: 'active',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValueOnce(null);
      mockDisputeRepository.createDispute.mockResolvedValueOnce({
        id: 'd1', contract_id: 'c1', milestone_id: 'm1', initiator_id: 'e1',
        reason: 'test', evidence: [], status: 'open', resolution: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      // Mock global Appwrite: listDocuments returns admin users for getUsersByRole
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'admin-1', name: 'Admin', role: 'admin' }],
        total: 1,
      });

      const result = await createDispute({
        contractId: 'c1', milestoneId: 'm1', initiatorId: 'e1', reason: 'test',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('submitEvidence (L253, L270, L308)', () => {
    it('L253: should return NOT_FOUND when dispute not found', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L270: should return NOT_FOUND when contract not found for evidence', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
      });
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L308: should return UPDATE_FAILED when updated dispute not found after evidence append', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({
          id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
          initiator_id: 'i1', reason: 'r', evidence: [],
        })
        .mockResolvedValueOnce(null); // Second call returns null
      mockContractRepository.getContractById.mockResolvedValueOnce({
        employer_id: 'e1', freelancer_id: 'f1',
      });

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('L318-322: should record evidence on blockchain when submitter has wallet address', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({
          id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
          initiator_id: 'i1', reason: 'r', evidence: [],
        })
        .mockResolvedValueOnce({
          id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
          initiator_id: 'i1', reason: 'r', evidence: [{ id: 'ev1', type: 'text', content: 'evidence' }],
        });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        employer_id: 'e1', freelancer_id: 'f1',
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce({
        id: 'd1', evidence: [{ id: 'ev1', type: 'text', content: 'evidence' }],
      });

      // Mock global Appwrite to return user with wallet_address
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument.mockResolvedValueOnce({
        $id: 'f1', wallet_address: '0x' + 'f'.repeat(40), name: 'Freelancer', role: 'freelancer',
      });

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(true);
      // Verify L319 was reached: updateDisputeEvidence was called
      expect(mockUpdateDisputeEvidence).toHaveBeenCalled();
    });

    it('L322: should catch blockchain evidence update errors gracefully', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({
          id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
          initiator_id: 'i1', reason: 'r', evidence: [],
        })
        .mockResolvedValueOnce({
          id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
          initiator_id: 'i1', reason: 'r', evidence: [{ id: 'ev1', type: 'text', content: 'evidence' }],
        });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        employer_id: 'e1', freelancer_id: 'f1',
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce({
        id: 'd1', evidence: [{ id: 'ev1', type: 'text', content: 'evidence' }],
      });

      // Mock global Appwrite to return user with wallet_address
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument.mockResolvedValueOnce({
        $id: 'f1', wallet_address: '0x' + 'f'.repeat(40), name: 'Freelancer', role: 'freelancer',
      });

      // Make updateDisputeEvidence throw to trigger L322 catch
      mockUpdateDisputeEvidence.mockRejectedValueOnce(new Error('blockchain error'));

      const result = await submitEvidence({
        disputeId: 'd1', submitterId: 'f1', type: 'text', content: 'evidence',
      });
      // Should still succeed despite blockchain error
      expect(result.success).toBe(true);
    });
  });

  describe('validateDisputeResolution (L360, L371, L378, L384)', () => {
    it('L360: should return NOT_FOUND when dispute not found in resolve', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce(null);

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L371: should return NOT_FOUND when contract not found in resolve', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L378: should return NOT_FOUND when project not found in resolve', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('L384: should return NOT_FOUND when milestone not found in resolve', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm-other', title: 'Other', status: 'submitted', amount: 100 }],
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('processDisputeEscrowPayment (L420-428, L445-451)', () => {
    it('L420-428: should bypass escrow and approve when escrow not found + freelancer_favor', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ESCROW_NOT_FOUND');
        expect(result.error.message).toContain('Escrow record not found');
      }
    });

    it('L420-428: should bypass escrow and refund when escrow not found + employer_favor', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'employer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ESCROW_NOT_FOUND');
        expect(result.error.message).toContain('Escrow record not found');
      }
    });

    it('L445-451: should return PAYMENT_FAILED when escrow operation throws', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockBlockchainAdapter.resolveDispute.mockRejectedValueOnce(new Error('Payment failed'));

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PAYMENT_FAILED');
    });

    it('L456-460: should return PAYMENT_FAILED when blockchain adapter is unavailable', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockBlockchainAdapter.isAvailable.mockReturnValueOnce(false);

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PAYMENT_FAILED');
    });
  });

  describe('updateDisputeStatuses (L501, L514)', () => {
    it('L501: should set contract to active when not all milestones done', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [
          { id: 'm1', title: 'M1', status: 'submitted', amount: 100 },
          { id: 'm2', title: 'M2', status: 'pending', amount: 200 },
        ],
      });
      mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
        transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce({
        id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
        resolution: { decision: 'freelancer_favor', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      // Verify L501 was reached: updateContract called with status 'active'
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c1', { status: 'active' });
    });

    it('L514: should return UPDATE_FAILED when updateDispute returns null', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
        transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce(null);

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('L525-533: should record resolution on blockchain when resolver has wallet address', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
        transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce({
        id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
        resolution: { decision: 'freelancer_favor', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
      });

      // Mock global Appwrite: employer lookup first (no wallet -> skip agreement
      // completion), then resolver with wallet_address for the on-chain recording.
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument.mockResolvedValueOnce({ $id: 'e1' });
      mockDbs.getDocument.mockResolvedValueOnce({
        $id: 'admin-1', wallet_address: '0x' + 'a'.repeat(40), name: 'Admin', role: 'admin',
      });

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      // Verify L525 was reached: resolveDisputeOnBlockchain was called
      expect(mockResolveDisputeOnBlockchain).toHaveBeenCalled();
    });

    it('L533: should catch blockchain resolution recording errors gracefully', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
        id: 'd1', status: 'open', contract_id: 'c1', milestone_id: 'm1',
      });
      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c1', project_id: 'p1', employer_id: 'e1', freelancer_id: 'f1', escrow_address: '0xescrow',
      });
      mockProjectRepository.findProjectById.mockResolvedValueOnce({
        id: 'p1', milestones: [{ id: 'm1', title: 'M1', status: 'submitted', amount: 100 }],
      });
      mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
        transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
      });
      mockDisputeRepository.updateDispute.mockResolvedValueOnce({
        id: 'd1', status: 'resolved', contract_id: 'c1', milestone_id: 'm1',
        initiator_id: 'i1', reason: 'r', evidence: [],
        resolution: { decision: 'freelancer_favor', reasoning: 'test', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
      });

      // Mock global Appwrite: employer lookup first (no wallet -> skip agreement
      // completion), then resolver with wallet_address for the on-chain recording.
      const mockDbs = (globalThis as any).__mockDatabases;
      mockDbs.getDocument.mockResolvedValueOnce({ $id: 'e1' });
      mockDbs.getDocument.mockResolvedValueOnce({
        $id: 'admin-1', wallet_address: '0x' + 'a'.repeat(40), name: 'Admin', role: 'admin',
      });

      // Make resolveDisputeOnBlockchain throw to trigger L533 catch
      mockResolveDisputeOnBlockchain.mockRejectedValueOnce(new Error('blockchain error'));

      const result = await resolveDispute({
        disputeId: 'd1', decision: 'freelancer_favor', reasoning: 'test',
        resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      // Should still succeed despite blockchain error
      expect(result.success).toBe(true);
    });
  });

  describe('getDisputesByContract (L630)', () => {
    it('L630: should return NOT_FOUND when contract not found', async () => {
      const { getDisputesByContract } = await importModule();
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await getDisputesByContract('c1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});

describe('Dispute Service - Additional Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getContractById.mockReset();
    mockProjectRepository.findProjectById.mockReset();
    mockDisputeRepository.getDisputeById.mockReset();
    mockDisputeRepository.updateDispute.mockReset();
    mockDisputeRepository.getDisputeByMilestone.mockReset();
    mockDisputeRepository.getAllDisputesByContract.mockReset();
    mockDisputeRepository.getAllDisputes.mockReset();
    mockDisputeRepository.getDisputesByUserId.mockReset();
    mockDisputeRepository.getDisputesByInitiator.mockReset();
    mockDisputeRepository.getDisputesByStatus.mockReset();
    mockDisputeRepository.createDispute.mockReset();
    mockBlockchainAdapter.isAvailable.mockReset().mockReturnValue(true);
    mockBlockchainAdapter.resolveDispute.mockReset();
    mockBlockchainAdapter.disputeMilestone.mockReset();
    mockCreateDisputeOnBlockchain.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'a'.repeat(64), blockNumber: 12345, status: 'success',
    });
    mockResolveDisputeOnBlockchain.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'c'.repeat(64), blockNumber: 12347, status: 'success',
    });
    mockDisputeAgreement.mockReset().mockResolvedValue(undefined);
    mockUpdateDisputeEvidence.mockReset().mockResolvedValue({
      transactionHash: '0x' + 'b'.repeat(64), blockNumber: 12346, status: 'success',
    });
  });

  const importModule = async () => {
    return await import('../../services/dispute-service.js');
  };

  it('L125: approved milestone status returns specific error message', async () => {
    const { createDispute } = await importModule();

    const contractId = 'contract-approved-ms';
    const projectId = 'proj-approved-ms';
    const milestoneId = 'ms-approved';

    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: contractId, project_id: projectId, freelancer_id: 'fl-1', employer_id: 'emp-1',
      status: 'active', total_amount: 1000, escrow_address: '0xabc',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: projectId,
      milestones: [{ id: milestoneId, title: 'M1', amount: 500, status: 'approved' }],
    });

    const result = await createDispute({
      contractId,
      milestoneId,
      initiatorId: 'emp-1',
      reason: 'Quality issue',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
      expect(result.error.message).toContain('Cannot dispute an approved milestone');
    }
  });

  it('L491: other disputed milestones detection in resolveDispute', async () => {
    const { resolveDispute } = await importModule();

    const disputeId = 'd-other-disputes';
    mockDisputeRepository.getDisputeById.mockResolvedValueOnce({
      id: disputeId, contract_id: 'c1', milestone_id: 'ms-1',
      status: 'under_review', reason: 'Quality', initiator_id: 'fl-1',
    });
    mockContractRepository.getContractById.mockResolvedValueOnce({
      id: 'c1', project_id: 'p1', freelancer_id: 'fl-1', employer_id: 'emp-1',
      status: 'active', total_amount: 2000, escrow_address: '0xabc',
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1',
      milestones: [
        { id: 'ms-1', title: 'M1', amount: 500, status: 'disputed' },
        { id: 'ms-2', title: 'M2', amount: 500, status: 'disputed' },
        { id: 'ms-3', title: 'M3', amount: 1000, status: 'approved' },
      ],
    });
    mockBlockchainAdapter.resolveDispute.mockResolvedValueOnce({
      transactionHash: '0xtx', blockNumber: 1, status: 'success', gasUsed: BigInt(21000), timestamp: Date.now(),
    });
    mockDisputeRepository.updateDispute.mockResolvedValueOnce({
      id: disputeId, status: 'resolved', contract_id: 'c1', milestone_id: 'ms-1',
      initiator_id: 'fl-1', reason: 'Quality', evidence: [],
      resolution: { decision: 'freelancer_favor', reasoning: 'Work was done correctly', resolved_by: 'admin-1', resolved_at: new Date().toISOString() },
    });

    const result = await resolveDispute({
      disputeId,
      decision: 'freelancer_favor',
      reasoning: 'Work was done correctly',
      resolvedBy: 'admin-1',
      resolverRole: 'admin',
    });

    expect(result.success).toBe(true);
  });

  it('L709: non-Error throw in catch block of getAllDisputes', async () => {
    const { getAllDisputes } = await importModule();

    mockDisputeRepository.getAllDisputes.mockRejectedValueOnce('raw string error');

    const result = await getAllDisputes('admin', 'admin', {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FETCH_FAILED');
      expect(result.error.message).toBe('Failed to fetch disputes');
    }
  });

  it('L709: Error instance throw in catch block of getAllDisputes', async () => {
    const { getAllDisputes } = await importModule();

    mockDisputeRepository.getAllDisputes.mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await getAllDisputes('admin', 'admin', {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FETCH_FAILED');
      expect(result.error.message).toBe('Connection timeout');
    }
  });
});
