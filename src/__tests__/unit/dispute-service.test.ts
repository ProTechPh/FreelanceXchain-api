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

// Create stores and mocks
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
  clear: () => disputeStore.clear(),
};

// Create mock escrow operations
const mockEscrowOps = {
  getEscrowByContractId: jest.fn<any>(async (contractId: string) => ({
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
  releaseMilestone: jest.fn<any>(async () => ({
    transactionHash: '0x' + 'b'.repeat(64),
    blockNumber: 12345,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
  refundMilestone: jest.fn<any>(async () => ({
    transactionHash: '0x' + 'c'.repeat(64),
    blockNumber: 12346,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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

// Mock escrow contract
jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowByContractId: mockEscrowOps.getEscrowByContractId,
  releaseMilestone: mockEscrowOps.releaseMilestone,
  refundMilestone: mockEscrowOps.refundMilestone,
}));

// Import after mocking
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

    // Mock Supabase RPC for evidence submission
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (functionName: string, params: any) => {
      if (functionName === 'append_dispute_evidence') {
        const dispute = disputeStore.get(params.p_dispute_id) as any;
        if (!dispute) return { data: null, error: { message: 'Dispute not found' } };
        
        const newEvidence = params.p_evidence || [];
        const updatedEvidence = [...(dispute.evidence || []), ...newEvidence];
        dispute.evidence = updatedEvidence;
        disputeStore.set(dispute.id, dispute);
        
        return { data: updatedEvidence, error: null };
      }
      return { data: null, error: { message: 'Unsupported RPC function' } };
    });
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
    
    // Verify notifications were sent
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

    // Mock Supabase RPC for evidence submission
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (functionName: string, params: any) => {
      if (functionName === 'append_dispute_evidence') {
        const dispute = disputeStore.get(params.p_dispute_id) as any;
        if (!dispute) return { data: null, error: { message: 'Dispute not found' } };
        
        const newEvidence = params.p_evidence || [];
        const updatedEvidence = [...(dispute.evidence || []), ...newEvidence];
        dispute.evidence = updatedEvidence;
        disputeStore.set(dispute.id, dispute);
        
        return { data: updatedEvidence, error: null };
      }
      return { data: null, error: { message: 'Unsupported RPC function' } };
    });
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
});
