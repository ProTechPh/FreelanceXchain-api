// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Import repositories AFTER mocks
const { getKycVerificationById } = await import('../../repositories/didit-kyc-repository.js');
const { auditLogRepository } = await import('../../repositories/audit-log-repository.js');
const { disputeRepository } = await import('../../repositories/dispute-repository.js');
const { freelancerProfileRepository } = await import('../../repositories/freelancer-profile-repository.js');
const { messageRepository } = await import('../../repositories/message-repository.js');
const { notificationRepository } = await import('../../repositories/notification-repository.js');
const { proposalRepository } = await import('../../repositories/proposal-repository.js');
const { contractRepository } = await import('../../repositories/contract-repository.js');
const { PaymentRepository } = await import('../../repositories/payment-repository.js');
const { userRepository } = await import('../../repositories/user-repository.js');
const { ReviewRepository } = await import('../../repositories/review-repository.js');
const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
const { projectRepository } = await import('../../repositories/project-repository.js');
const { skillRepository } = await import('../../repositories/skill-repository.js');

describe('Repository coverage gaps', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  // ─── 1. didit-kyc-repository: JSON.parse branches for string fields ───
  describe('didit-kyc-repository: JSON.parse branches', () => {
    it('should parse decline_reasons when it is a JSON string', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'kyc-1',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        user_id: 'user-1',
        status: 'rejected',
        decline_reasons: '["fraud","incomplete"]',
        review_reasons: '[]',
        metadata: '{}',
      });
      const result = await getKycVerificationById('kyc-1');
      expect(result).not.toBeNull();
      expect(result!.decline_reasons).toEqual(['fraud', 'incomplete']);
    });

    it('should parse review_reasons when it is a JSON string', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'kyc-2',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        user_id: 'user-2',
        status: 'review',
        decline_reasons: [],
        review_reasons: '["blurry_photo","name_mismatch"]',
        metadata: '{}',
      });
      const result = await getKycVerificationById('kyc-2');
      expect(result).not.toBeNull();
      expect(result!.review_reasons).toEqual(['blurry_photo', 'name_mismatch']);
    });

    it('should parse metadata when it is a JSON string', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'kyc-3',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        user_id: 'user-3',
        status: 'approved',
        decline_reasons: [],
        review_reasons: [],
        metadata: '{"key":"value"}',
      });
      const result = await getKycVerificationById('kyc-3');
      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({ key: 'value' });
    });
  });

  // ─── 2. audit-log-repository: JSON.parse branch for payload ───
  describe('audit-log-repository: JSON.parse branch for payload', () => {
    it('should parse payload when it is a JSON string', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'log-1',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        user_id: 'user-1',
        action: 'test_action',
        resource_type: 'test',
        resource_id: 'res-1',
        payload: '{"foo":"bar"}',
        status: 'success',
      });
      const result = await auditLogRepository.getById('log-1');
      expect(result).not.toBeNull();
      expect(result!.payload).toEqual({ foo: 'bar' });
    });
  });

  // ─── 3. dispute-repository: JSON.parse branch for resolution ───
  describe('dispute-repository: JSON.parse branch for resolution', () => {
    it('should parse resolution when it is a JSON string', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'disp-1',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            contract_id: 'c-1',
            milestone_id: 'm-1',
            initiator_id: 'u-1',
            reason: 'bad work',
            evidence: '[]',
            status: 'resolved',
            resolution: '{"decision":"freelancer_favor","reasoning":"good","resolved_by":"admin","resolved_at":"2025-01-02"}',
          },
        ],
        total: 1,
      });
      const result = await disputeRepository.getDisputesByContract('c-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.resolution).toEqual({
        decision: 'freelancer_favor',
        reasoning: 'good',
        resolved_by: 'admin',
        resolved_at: '2025-01-02',
      });
    });
  });

  // ─── 4. dispute-repository: getAllDisputes with status option ───
  describe('dispute-repository: getAllDisputes with status filter', () => {
    it('should include status query when options.status is provided', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'disp-2',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            contract_id: 'c-2',
            milestone_id: 'm-2',
            initiator_id: 'u-2',
            reason: 'dispute reason',
            evidence: [],
            status: 'open',
            resolution: null,
          },
        ],
        total: 1,
      });
      const result = await disputeRepository.getAllDisputes({ status: 'open' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('open');
    });
  });

  // ─── 5. freelancer-profile-repository: JSON.parse branch for experience ───
  describe('freelancer-profile-repository: JSON.parse branch for experience', () => {
    it('should parse experience when it is a JSON string', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'fp-1',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            user_id: 'user-1',
            name: 'Test Freelancer',
            bio: 'Developer',
            hourly_rate: 50,
            skills: '[]',
            experience: '[{"id":"exp-1","title":"Dev","company":"Corp","description":"Work","start_date":"2020-01-01","end_date":null}]',
            availability: 'available',
          },
        ],
        total: 1,
      });
      const result = await freelancerProfileRepository.getAvailableProfiles();
      expect(result).toHaveLength(1);
      expect(result[0]!.experience).toEqual([
        { id: 'exp-1', title: 'Dev', company: 'Corp', description: 'Work', start_date: '2020-01-01', end_date: null },
      ]);
    });
  });

  // ─── 6. message-repository: JSON.parse branch for attachments ───
  describe('message-repository: JSON.parse branch for attachments', () => {
    it('should parse attachments when it is a JSON string', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'msg-1',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            conversation_id: 'conv-1',
            sender_id: 'user-1',
            receiver_id: 'user-2',
            content: 'hello',
            attachments: '[{"url":"https://example.com/file.pdf","filename":"file.pdf","size":1024,"mimeType":"application/pdf"}]',
            is_read: false,
          },
        ],
        total: 1,
      });
      const result = await messageRepository.getConversationMessages('conv-1', 10, 0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.attachments).toEqual([
        { url: 'https://example.com/file.pdf', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf' },
      ]);
    });
  });

  // ─── 7. notification-repository: JSON.parse branch for data ───
  describe('notification-repository: JSON.parse branch for data', () => {
    it('should parse data when it is a JSON string', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'notif-1',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            user_id: 'user-1',
            type: 'proposal_accepted',
            title: 'Accepted',
            message: 'Your proposal was accepted',
            data: '{"proposalId":"p-1"}',
            is_read: false,
          },
        ],
        total: 1,
      });
      const result = await notificationRepository.getAllNotificationsByUser('user-1');
      expect(result).toHaveLength(1);
      expect(result[0]!.data).toEqual({ proposalId: 'p-1' });
    });
  });

  // ─── 8. proposal-repository: parse helper null/undefined fallback and catch branch ───
  describe('proposal-repository: parse helper branches', () => {
    it('should return fallback when attachments is null', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'prop-1',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        project_id: 'proj-1',
        freelancer_id: 'f-1',
        cover_letter: 'letter',
        attachments: null,
        proposed_rate: 50,
        estimated_duration: 7,
        status: 'pending',
      });
      const result = await proposalRepository.getProposalById('prop-1');
      expect(result).not.toBeNull();
      expect(result!.attachments).toEqual([]);
    });

    it('should return fallback when attachments is an invalid JSON string', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'prop-2',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-01T00:00:00Z',
        project_id: 'proj-2',
        freelancer_id: 'f-2',
        cover_letter: 'letter',
        attachments: 'not-valid-json{{{',
        proposed_rate: 60,
        estimated_duration: 14,
        status: 'pending',
      });
      const result = await proposalRepository.getProposalById('prop-2');
      expect(result).not.toBeNull();
      expect(result!.attachments).toEqual([]);
    });
  });

  // ─── 9. contract-repository: catch branch of findContractByProposalId ───
  describe('contract-repository: findContractByProposalId catch branch', () => {
    it('should return null when listDocuments rejects', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await contractRepository.findContractByProposalId('prop-99');
      expect(result).toBeNull();
    });
  });

  // ─── 10. payment-repository: catch branch of getByTxHash ───
  describe('payment-repository: getByTxHash catch branch', () => {
    it('should return null when listDocuments rejects', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await PaymentRepository.findByTxHash('0xhash');
      expect(result).toBeNull();
    });
  });

  // ─── 11. user-repository: catch branch of emailExists ───
  describe('user-repository: emailExists catch branch', () => {
    it('should return false when listDocuments rejects', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await userRepository.emailExists('test@example.com');
      expect(result).toBe(false);
    });
  });

  // ─── 12. review-repository: reduce calculation with non-empty reviews ───
  describe('review-repository: getAverageRating with reviews', () => {
    it('should calculate average rating from reviews array', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'r1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', reviewee_id: 'u-1', rating: 4 },
          { $id: 'r2', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', reviewee_id: 'u-1', rating: 5 },
          { $id: 'r3', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', reviewee_id: 'u-1', rating: 3 },
        ],
        total: 3,
      });
      const result = await ReviewRepository.getAverageRating('u-1');
      expect(result.count).toBe(3);
      expect(result.average).toBe(4);
    });
  });

  // ─── 13. base-repository-appwrite: countWithQueries method ───
  describe('base-repository-appwrite: countWithQueries', () => {
    class TestRepo extends BaseRepositoryAppwrite<{ id: string; created_at: string; updated_at: string }> {
      constructor() {
        super('test_collection');
      }
      async testCount(queries: any[]) {
        return this.countWithQueries(queries);
      }
    }

    it('should return total on success', async () => {
      const repo = new TestRepo();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'doc-1' }],
        total: 5,
      });
      const result = await repo.testCount([]);
      expect(result).toBe(5);
    });

    it('should return 0 on error', async () => {
      const repo = new TestRepo();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.testCount([]);
      expect(result).toBe(0);
    });
  });

  // ─── 14. project-repository: updateProject and searchProjects ───
  describe('project-repository: updateProject and searchProjects', () => {
    it('should update project and return mapped doc', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'proj-1',
        $createdAt: '2025-01-01T00:00:00Z',
        $updatedAt: '2025-01-02T00:00:00Z',
        employer_id: 'emp-1',
        title: 'Updated Title',
        description: 'Updated desc',
        required_skills: '[]',
        budget: 1000,
        deadline: '2025-06-01',
        is_rush: false,
        rush_fee_percentage: 0,
        status: 'open',
        milestones: '[]',
        freelancer_limit: 5,
        tags: '[]',
        attachments: '[]',
      });
      const result = await projectRepository.updateProject('proj-1', { title: 'Updated Title' } as any);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Updated Title');
    });

    it('should search projects by keyword matching title', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'proj-2',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            employer_id: 'emp-1',
            title: 'React Developer Needed',
            description: 'Build a web app',
            required_skills: '[]',
            budget: 500,
            deadline: '2025-06-01',
            is_rush: false,
            rush_fee_percentage: 0,
            status: 'open',
            milestones: '[]',
            freelancer_limit: 3,
            tags: '[]',
            attachments: '[]',
          },
          {
            $id: 'proj-3',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            employer_id: 'emp-2',
            title: 'Python Script',
            description: 'Data processing script',
            required_skills: '[]',
            budget: 200,
            deadline: '2025-06-01',
            is_rush: false,
            rush_fee_percentage: 0,
            status: 'open',
            milestones: '[]',
            freelancer_limit: 1,
            tags: '[]',
            attachments: '[]',
          },
        ],
        total: 2,
      });
      const result = await projectRepository.searchProjects('react');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('React Developer Needed');
    });
  });

  // ─── 15. skill-repository: keyword filter callback in search ───
  describe('skill-repository: searchSkillsByKeyword filter', () => {
    it('should filter skills by keyword matching name', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'skill-1',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            category_id: 'cat-1',
            name: 'JavaScript',
            description: 'Programming language',
            is_active: true,
          },
          {
            $id: 'skill-2',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            category_id: 'cat-1',
            name: 'Python',
            description: 'Programming language',
            is_active: true,
          },
          {
            $id: 'skill-3',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            category_id: 'cat-2',
            name: 'Graphic Design',
            description: 'Visual design',
            is_active: true,
          },
        ],
        total: 3,
      });
      const result = await skillRepository.searchSkillsByKeyword('java');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('JavaScript');
    });

    it('should filter skills by keyword matching description', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'skill-4',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            category_id: 'cat-1',
            name: 'TypeScript',
            description: 'Typed JavaScript superset',
            is_active: true,
          },
          {
            $id: 'skill-5',
            $createdAt: '2025-01-01T00:00:00Z',
            $updatedAt: '2025-01-01T00:00:00Z',
            category_id: 'cat-2',
            name: 'Photoshop',
            description: 'Image editing software',
            is_active: true,
          },
        ],
        total: 2,
      });
      const result = await skillRepository.searchSkillsByKeyword('javascript');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('TypeScript');
    });
  });
});
