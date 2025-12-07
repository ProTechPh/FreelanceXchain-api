import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { Dispute } from '../../models/dispute.js';
import { Contract } from '../../models/contract.js';
import { Project, Milestone, MilestoneStatus } from '../../models/project.js';
import { Notification, NotificationType } from '../../models/notification.js';
import { generateId } from '../../utils/id.js';

// In-memory stores for testing
let disputeStore: Map<string, Dispute> = new Map();
let contractStore: Map<string, Contract> = new Map();
let projectStore: Map<string, Project> = new Map();
let notificationStore: Map<string, Notification> = new Map();

// Mock the repositories before importing dispute-service
jest.unstable_mockModule('../../repositories/dispute-repository.js', () => ({
  disputeRepository: {
    createDispute: jest.fn(async (dispute: Dispute) => {
      disputeStore.set(dispute.id, dispute);
      return dispute;
    }),
    findDisputeById: jest.fn(async (id: string) => {
      return disputeStore.get(id) ?? null;
    }),
    getDisputeById: jest.fn(async (id: string, contractId: string) => {
      const dispute = disputeStore.get(id);
      if (dispute && dispute.contractId === contractId) {
        return dispute;
      }
      return null;
    }),
    updateDispute: jest.fn(async (id: string, _contractId: string, updates: Partial<Dispute>) => {
      const dispute = disputeStore.get(id);
      if (!dispute) return null;
      const updated = { ...dispute, ...updates, updatedAt: new Date().toISOString() };
      disputeStore.set(id, updated);
      return updated;
    }),
    getDisputeByMilestone: jest.fn(async (milestoneId: string) => {
      for (const dispute of disputeStore.values()) {
        if (dispute.milestoneId === milestoneId) {
          return dispute;
        }
      }
      return null;
    }),
    getAllDisputesByContract: jest.fn(async (contractId: string) => {
      return Array.from(disputeStore.values())
        .filter(d => d.contractId === contractId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }),
    getOpenDisputes: jest.fn(async () => {
      const items = Array.from(disputeStore.values())
        .filter(d => d.status === 'open' || d.status === 'under_review')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { items, hasMore: false };
    }),
    getDisputesByInitiator: jest.fn(async (initiatorId: string) => {
      const items = Array.from(disputeStore.values())
        .filter(d => d.initiatorId === initiatorId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { items, hasMore: false };
    }),
  },
  DisputeRepository: jest.fn(),
}));

jest.unstable_mockModule('../../repositories/contract-repository.js', () => ({
  contractRepository: {
    getContractById: jest.fn(async (id: string) => {
      return contractStore.get(id) ?? null;
    }),
    updateContract: jest.fn(async (id: string, updates: Partial<Contract>) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      const updated = { ...contract, ...updates, updatedAt: new Date().toISOString() };
      contractStore.set(id, updated);
      return updated;
    }),
  },
  ContractRepository: jest.fn(),
}));

jest.unstable_mockModule('../../repositories/project-repository.js', () => ({
  projectRepository: {
    findProjectById: jest.fn(async (id: string) => {
      return projectStore.get(id) ?? null;
    }),
    updateProject: jest.fn(async (id: string, _employerId: string, updates: Partial<Project>) => {
      const project = projectStore.get(id);
      if (!project) return null;
      const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
      projectStore.set(id, updated);
      return updated;
    }),
  },
  ProjectRepository: jest.fn(),
}));

jest.unstable_mockModule('../notification-service.js', () => ({
  notifyDisputeCreated: jest.fn(async (
    userId: string,
    disputeId: string,
    milestoneId: string,
    milestoneTitle: string,
    projectId: string,
    projectTitle: string,
    contractId: string
  ) => {
    const notification: Notification = {
      id: generateId(),
      userId,
      type: 'dispute_created' as NotificationType,
      title: 'Dispute Created',
      message: `A dispute has been created for milestone "${milestoneTitle}"`,
      data: { disputeId, milestoneId, milestoneTitle, projectId, projectTitle, contractId },
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    notificationStore.set(notification.id, notification);
    return { success: true, data: notification };
  }),
  notifyDisputeResolved: jest.fn(async (
    userId: string,
    disputeId: string,
    resolution: string,
    milestoneId: string,
    milestoneTitle: string,
    projectId: string,
    projectTitle: string,
    contractId: string
  ) => {
    const notification: Notification = {
      id: generateId(),
      userId,
      type: 'dispute_resolved' as NotificationType,
      title: 'Dispute Resolved',
      message: `The dispute for milestone "${milestoneTitle}" has been resolved`,
      data: { disputeId, resolution, milestoneId, milestoneTitle, projectId, projectTitle, contractId },
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    notificationStore.set(notification.id, notification);
    return { success: true, data: notification };
  }),
}));


jest.unstable_mockModule('../escrow-contract.js', () => ({
  getEscrowByContractId: jest.fn(async (_contractId: string) => {
    return { address: '0x' + 'a'.repeat(40) };
  }),
  releaseMilestone: jest.fn(async () => ({
    transactionHash: '0x' + 'b'.repeat(64),
    blockNumber: 12345,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
  refundMilestone: jest.fn(async () => ({
    transactionHash: '0x' + 'c'.repeat(64),
    blockNumber: 12346,
    status: 'success',
    gasUsed: BigInt(21000),
    timestamp: Date.now(),
  })),
}));

// Import after mocking
const {
  createDispute,
  submitEvidence,
  getDisputeById,
} = await import('../dispute-service.js');

// Helper functions
function createTestContract(
  id: string,
  projectId: string,
  freelancerId: string,
  employerId: string
): Contract {
  const contract: Contract = {
    id,
    projectId,
    proposalId: generateId(),
    freelancerId,
    employerId,
    escrowAddress: '0x' + 'a'.repeat(40),
    totalAmount: 10000,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  contractStore.set(id, contract);
  return contract;
}

function createTestProject(
  id: string,
  employerId: string,
  milestones: Milestone[]
): Project {
  const project: Project = {
    id,
    employerId,
    title: 'Test Project',
    description: 'Test project description',
    requiredSkills: [],
    budget: 10000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'in_progress',
    milestones,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projectStore.set(id, project);
  return project;
}

function createTestMilestone(
  id: string,
  status: MilestoneStatus = 'submitted'
): Milestone {
  return {
    id,
    title: `Milestone ${id}`,
    description: 'Test milestone',
    amount: 2500,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status,
  };
}

// Custom arbitraries
const validReasonArbitrary = () =>
  fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10);

const evidenceTypeArbitrary = () =>
  fc.constantFrom('text', 'file', 'link') as fc.Arbitrary<'text' | 'file' | 'link'>;

const validEvidenceContentArbitrary = () =>
  fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length >= 1);


describe('Dispute Service - Property Tests', () => {
  beforeEach(() => {
    disputeStore.clear();
    contractStore.clear();
    projectStore.clear();
    notificationStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 26: Dispute creation**
   * **Validates: Requirements 8.1**
   * 
   * For any dispute initiated on a milestone, a dispute record shall be created
   * with the correct milestone ID, initiator ID, and reason.
   */
  it('Property 26: Dispute creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // contractId
        fc.uuid(), // projectId
        fc.uuid(), // milestoneId
        fc.uuid(), // freelancerId
        fc.uuid(), // employerId
        validReasonArbitrary(),
        fc.boolean(), // true = freelancer initiates, false = employer initiates
        async (contractId, projectId, milestoneId, freelancerId, employerId, reason, freelancerInitiates) => {
          // Clear stores for each test case
          disputeStore.clear();
          contractStore.clear();
          projectStore.clear();
          notificationStore.clear();

          // Set up test data
          const milestone = createTestMilestone(milestoneId, 'submitted');
          createTestProject(projectId, employerId, [milestone]);
          createTestContract(contractId, projectId, freelancerId, employerId);

          const initiatorId = freelancerInitiates ? freelancerId : employerId;

          // Create dispute
          const result = await createDispute({
            contractId,
            milestoneId,
            initiatorId,
            reason,
          });

          // Should succeed
          expect(result.success).toBe(true);

          if (result.success) {
            const dispute = result.data;

            // Verify dispute has correct data
            expect(dispute.contractId).toBe(contractId);
            expect(dispute.milestoneId).toBe(milestoneId);
            expect(dispute.initiatorId).toBe(initiatorId);
            expect(dispute.reason).toBe(reason);
            expect(dispute.status).toBe('open');
            expect(dispute.evidence).toEqual([]);
            expect(dispute.resolution).toBeNull();
            expect(dispute.createdAt).toBeDefined();
            expect(dispute.id).toBeDefined();

            // Verify dispute exists in store
            expect(disputeStore.has(dispute.id)).toBe(true);
            const stored = disputeStore.get(dispute.id);
            expect(stored?.milestoneId).toBe(milestoneId);
            expect(stored?.initiatorId).toBe(initiatorId);
            expect(stored?.reason).toBe(reason);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 27: Dispute notification**
   * **Validates: Requirements 8.2**
   * 
   * For any created dispute, notifications shall be created for both the freelancer
   * and employer involved in the contract.
   */
  it('Property 27: Dispute notification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // contractId
        fc.uuid(), // projectId
        fc.uuid(), // milestoneId
        fc.uuid(), // freelancerId
        fc.uuid(), // employerId
        validReasonArbitrary(),
        async (contractId, projectId, milestoneId, freelancerId, employerId, reason) => {
          // Clear stores for each test case
          disputeStore.clear();
          contractStore.clear();
          projectStore.clear();
          notificationStore.clear();

          // Set up test data
          const milestone = createTestMilestone(milestoneId, 'submitted');
          createTestProject(projectId, employerId, [milestone]);
          createTestContract(contractId, projectId, freelancerId, employerId);

          // Create dispute (employer initiates)
          const result = await createDispute({
            contractId,
            milestoneId,
            initiatorId: employerId,
            reason,
          });

          // Should succeed
          expect(result.success).toBe(true);

          if (result.success) {
            const disputeId = result.data.id;

            // Verify notifications were created for both parties
            const notifications = Array.from(notificationStore.values());
            
            // Should have exactly 2 notifications (one for each party)
            expect(notifications.length).toBe(2);

            // Find notification for freelancer
            const freelancerNotification = notifications.find(n => n.userId === freelancerId);
            expect(freelancerNotification).toBeDefined();
            expect(freelancerNotification?.type).toBe('dispute_created');
            expect(freelancerNotification?.data.disputeId).toBe(disputeId);
            expect(freelancerNotification?.data.milestoneId).toBe(milestoneId);
            expect(freelancerNotification?.data.contractId).toBe(contractId);

            // Find notification for employer
            const employerNotification = notifications.find(n => n.userId === employerId);
            expect(employerNotification).toBeDefined();
            expect(employerNotification?.type).toBe('dispute_created');
            expect(employerNotification?.data.disputeId).toBe(disputeId);
            expect(employerNotification?.data.milestoneId).toBe(milestoneId);
            expect(employerNotification?.data.contractId).toBe(contractId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 28: Evidence storage with metadata**
   * **Validates: Requirements 8.3**
   * 
   * For any evidence submitted for a dispute, the evidence shall be stored with
   * the correct submitter ID and a timestamp.
   */
  it('Property 28: Evidence storage with metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // contractId
        fc.uuid(), // projectId
        fc.uuid(), // milestoneId
        fc.uuid(), // freelancerId
        fc.uuid(), // employerId
        validReasonArbitrary(),
        evidenceTypeArbitrary(),
        validEvidenceContentArbitrary(),
        fc.boolean(), // true = freelancer submits, false = employer submits
        async (contractId, projectId, milestoneId, freelancerId, employerId, reason, evidenceType, evidenceContent, freelancerSubmits) => {
          // Clear stores for each test case
          disputeStore.clear();
          contractStore.clear();
          projectStore.clear();
          notificationStore.clear();

          // Set up test data
          const milestone = createTestMilestone(milestoneId, 'submitted');
          createTestProject(projectId, employerId, [milestone]);
          createTestContract(contractId, projectId, freelancerId, employerId);

          // Create dispute first
          const createResult = await createDispute({
            contractId,
            milestoneId,
            initiatorId: employerId,
            reason,
          });

          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const disputeId = createResult.data.id;
          const submitterId = freelancerSubmits ? freelancerId : employerId;

          // Record time before submission
          const beforeSubmission = new Date().toISOString();

          // Submit evidence
          const evidenceResult = await submitEvidence({
            disputeId,
            submitterId,
            type: evidenceType,
            content: evidenceContent,
          });

          // Record time after submission
          const afterSubmission = new Date().toISOString();

          // Should succeed
          expect(evidenceResult.success).toBe(true);

          if (evidenceResult.success) {
            const updatedDispute = evidenceResult.data;

            // Verify evidence was added
            expect(updatedDispute.evidence.length).toBe(1);

            const evidence = updatedDispute.evidence[0];
            expect(evidence).toBeDefined();

            if (evidence) {
              // Verify evidence has correct submitter ID
              expect(evidence.submitterId).toBe(submitterId);

              // Verify evidence has correct type and content
              expect(evidence.type).toBe(evidenceType);
              expect(evidence.content).toBe(evidenceContent);

              // Verify evidence has a timestamp
              expect(evidence.submittedAt).toBeDefined();

              // Verify timestamp is within expected range
              expect(evidence.submittedAt >= beforeSubmission).toBe(true);
              expect(evidence.submittedAt <= afterSubmission).toBe(true);

              // Verify evidence has an ID
              expect(evidence.id).toBeDefined();
            }

            // Verify dispute status changed to under_review
            expect(updatedDispute.status).toBe('under_review');
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 28: Evidence storage with metadata (multiple evidence)**
   * **Validates: Requirements 8.3**
   * 
   * For any multiple pieces of evidence submitted for a dispute, each piece shall
   * be stored with correct metadata and all evidence shall be preserved.
   */
  it('Property 28: Evidence storage with metadata - multiple evidence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // contractId
        fc.uuid(), // projectId
        fc.uuid(), // milestoneId
        fc.uuid(), // freelancerId
        fc.uuid(), // employerId
        validReasonArbitrary(),
        fc.integer({ min: 2, max: 5 }), // number of evidence pieces
        async (contractId, projectId, milestoneId, freelancerId, employerId, reason, evidenceCount) => {
          // Clear stores for each test case
          disputeStore.clear();
          contractStore.clear();
          projectStore.clear();
          notificationStore.clear();

          // Set up test data
          const milestone = createTestMilestone(milestoneId, 'submitted');
          createTestProject(projectId, employerId, [milestone]);
          createTestContract(contractId, projectId, freelancerId, employerId);

          // Create dispute first
          const createResult = await createDispute({
            contractId,
            milestoneId,
            initiatorId: employerId,
            reason,
          });

          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const disputeId = createResult.data.id;

          // Submit multiple pieces of evidence alternating between parties
          const submittedEvidence: { submitterId: string; type: string; content: string }[] = [];

          for (let i = 0; i < evidenceCount; i++) {
            const submitterId = i % 2 === 0 ? freelancerId : employerId;
            const type = ['text', 'file', 'link'][i % 3] as 'text' | 'file' | 'link';
            const content = `Evidence ${i + 1} content`;

            const evidenceResult = await submitEvidence({
              disputeId,
              submitterId,
              type,
              content,
            });

            expect(evidenceResult.success).toBe(true);
            submittedEvidence.push({ submitterId, type, content });
          }

          // Get the final dispute state
          const finalResult = await getDisputeById(disputeId);
          expect(finalResult.success).toBe(true);

          if (finalResult.success) {
            const dispute = finalResult.data;

            // Verify all evidence was stored
            expect(dispute.evidence.length).toBe(evidenceCount);

            // Verify each piece of evidence has correct metadata
            for (let i = 0; i < evidenceCount; i++) {
              const evidence = dispute.evidence[i];
              const expected = submittedEvidence[i];

              expect(evidence).toBeDefined();
              expect(expected).toBeDefined();

              if (evidence && expected) {
                expect(evidence.submitterId).toBe(expected.submitterId);
                expect(evidence.type).toBe(expected.type);
                expect(evidence.content).toBe(expected.content);
                expect(evidence.submittedAt).toBeDefined();
                expect(evidence.id).toBeDefined();
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
