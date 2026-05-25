// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

const {
  mapUserFromEntity,
  mapProjectFromEntity,
  mapContractFromEntity,
  mapProposalFromEntity,
  mapDisputeFromEntity,
  mapMilestoneFromEntity,
  mapNotificationFromEntity,
} = await import('../../utils/entity-mapper.js');

// Also import mapReviewFromEntity indirectly via reputation-service
// since it's a private function, we test it through the service layer.
// For entity-mapper we test the exported functions directly.

const now = new Date().toISOString();

describe('Entity Mapper - Extended Coverage (null/undefined fields)', () => {
  describe('mapUserFromEntity', () => {
    it('should map user with null wallet_address', () => {
      const entity = {
        id: 'u1',
        email: 'test@example.com',
        password_hash: 'hash',
        name: null,
        role: 'freelancer',
        wallet_address: null,
        is_suspended: false,
        suspension_reason: null,
        mfa_enabled: false,
        created_at: now,
        updated_at: now,
      };
      const result = mapUserFromEntity(entity);
      expect(result.walletAddress).toBeNull();
      expect(result.name).toBe('');
    });

    it('should map user with undefined kycStatus', () => {
      const entity = {
        id: 'u2',
        email: 'user@test.com',
        password_hash: 'hash',
        name: 'Alice',
        role: 'employer',
        wallet_address: '0xabc',
        is_suspended: false,
        suspension_reason: null,
        mfa_enabled: false,
        created_at: now,
        updated_at: now,
      };
      const result = mapUserFromEntity(entity);
      expect(result.kycStatus).toBeUndefined();
    });

    it('should map user with kycStatus provided', () => {
      const entity = {
        id: 'u3',
        email: 'user@test.com',
        password_hash: 'hash',
        name: 'Bob',
        role: 'freelancer',
        wallet_address: '0xdef',
        is_suspended: false,
        suspension_reason: null,
        mfa_enabled: false,
        created_at: now,
        updated_at: now,
      };
      const result = mapUserFromEntity(entity, 'verified');
      expect(result.kycStatus).toBe('verified');
    });
  });

  describe('mapProjectFromEntity', () => {
    it('should map project with null milestones array', () => {
      const entity = {
        id: 'p1',
        employer_id: 'emp1',
        title: 'Project',
        description: 'Desc',
        required_skills: null,
        budget: 1000,
        deadline: now,
        is_rush: false,
        rush_fee_percentage: 25,
        status: 'open',
        milestones: null,
        freelancer_limit: 1,
        tags: null,
        attachments: null,
        created_at: now,
        updated_at: now,
      };
      const result = mapProjectFromEntity(entity);
      expect(result.milestones).toEqual([]);
      expect(result.requiredSkills).toEqual([]);
      expect(result.tags).toEqual([]);
      expect(result.attachments).toEqual([]);
    });

    it('should map project with empty milestones', () => {
      const entity = {
        id: 'p2',
        employer_id: 'emp1',
        title: 'Project 2',
        description: 'Desc',
        required_skills: [],
        budget: 2000,
        deadline: now,
        is_rush: null,
        rush_fee_percentage: null,
        status: 'open',
        milestones: [],
        freelancer_limit: null,
        tags: [],
        attachments: [],
        created_at: now,
        updated_at: now,
      };
      const result = mapProjectFromEntity(entity);
      expect(result.isRush).toBe(false);
      expect(result.rushFeePercentage).toBe(25);
      expect(result.freelancerLimit).toBe(1);
    });

    it('should throw when entity is null', () => {
      expect(() => mapProjectFromEntity(null)).toThrow();
    });
  });

  describe('mapContractFromEntity', () => {
    it('should map contract with null escrow_address', () => {
      const entity = {
        id: 'c1',
        project_id: 'p1',
        proposal_id: 'prop1',
        freelancer_id: 'fl1',
        employer_id: 'emp1',
        escrow_address: null,
        base_amount: 1000,
        rush_fee: 0,
        total_amount: 1000,
        status: 'pending',
        created_at: now,
        updated_at: now,
      };
      const result = mapContractFromEntity(entity);
      expect(result.escrowAddress).toBeNull();
      expect(result.milestones).toEqual([]);
    });

    it('should map contract with project and freelancer data', () => {
      const entity = {
        id: 'c2',
        project_id: 'p1',
        proposal_id: 'prop1',
        freelancer_id: 'fl1',
        employer_id: 'emp1',
        escrow_address: '0xescrow',
        base_amount: 900,
        rush_fee: 100,
        total_amount: 1000,
        status: 'active',
        created_at: now,
        updated_at: now,
        project: { title: 'Test', description: 'Desc', deadline: now, milestones: [] },
        freelancer: {
          id: 'fl1',
          name: 'Freelancer',
          email: 'fl@test.com',
          freelancer_profile: [{ bio: 'Bio', hourly_rate: 50, availability: 'available' }],
        },
        employer: {
          id: 'emp1',
          name: 'Employer',
          email: 'emp@test.com',
          employer_profile: [{ company_name: 'Corp', industry: 'Tech', description: 'Desc' }],
        },
      };
      const result = mapContractFromEntity(entity);
      expect(result.freelancer?.name).toBe('Freelancer');
      expect(result.employer?.companyName).toBe('Corp');
      expect(result.title).toBe('Test');
    });

    it('should throw when entity is null', () => {
      expect(() => mapContractFromEntity(null)).toThrow();
    });
  });

  describe('mapProposalFromEntity', () => {
    it('should map proposal with null attachments', () => {
      const entity = {
        id: 'prop1',
        project_id: 'p1',
        freelancer_id: 'fl1',
        cover_letter: 'Cover letter',
        attachments: null,
        proposed_rate: 50,
        estimated_duration: 30,
        status: 'pending',
        created_at: now,
        updated_at: now,
      };
      const result = mapProposalFromEntity(entity);
      expect(result.attachments).toEqual([]);
    });

    it('should map proposal with attachments', () => {
      const entity = {
        id: 'prop2',
        project_id: 'p1',
        freelancer_id: 'fl1',
        cover_letter: 'Letter',
        attachments: [{ url: 'https://file.com/a.pdf', filename: 'a.pdf' }],
        proposed_rate: 75,
        estimated_duration: 14,
        status: 'accepted',
        created_at: now,
        updated_at: now,
      };
      const result = mapProposalFromEntity(entity);
      expect(result.attachments).toHaveLength(1);
    });

    it('should throw when entity is null', () => {
      expect(() => mapProposalFromEntity(null)).toThrow();
    });
  });

  describe('mapDisputeFromEntity', () => {
    it('should map dispute with null resolution and empty evidence', () => {
      const entity = {
        id: 'd1',
        contract_id: 'c1',
        milestone_id: 'm1',
        initiator_id: 'u1',
        reason: 'Bad work',
        evidence: [],
        status: 'open',
        resolution: null,
        created_at: now,
        updated_at: now,
      };
      const result = mapDisputeFromEntity(entity);
      expect(result.resolution).toBeNull();
      expect(result.evidence).toEqual([]);
    });

    it('should map dispute with resolution', () => {
      const entity = {
        id: 'd2',
        contract_id: 'c1',
        milestone_id: 'm1',
        initiator_id: 'u1',
        reason: 'Dispute reason',
        evidence: [
          { id: 'e1', submitter_id: 'u1', type: 'text', content: 'Evidence text', submitted_at: now },
        ],
        status: 'resolved',
        resolution: {
          decision: 'refund',
          reasoning: 'Work not delivered',
          resolved_by: 'admin1',
          resolved_at: now,
        },
        created_at: now,
        updated_at: now,
      };
      const result = mapDisputeFromEntity(entity);
      expect(result.resolution?.decision).toBe('refund');
      expect(result.resolution?.resolvedBy).toBe('admin1');
      expect(result.evidence).toHaveLength(1);
    });

    it('should map dispute with null evidence array', () => {
      const entity = {
        id: 'd3',
        contract_id: 'c1',
        milestone_id: 'm1',
        initiator_id: 'u1',
        reason: 'Reason',
        evidence: null,
        status: 'open',
        resolution: null,
        created_at: now,
        updated_at: now,
      };
      const result = mapDisputeFromEntity(entity);
      expect(result.evidence).toEqual([]);
    });
  });

  describe('mapMilestoneFromEntity', () => {
    it('should map milestone with null deliverable_files and rejection_reason', () => {
      const entity = {
        id: 'm1',
        title: 'Milestone 1',
        description: 'Desc',
        amount: 500,
        due_date: now,
        status: 'pending',
        deliverable_files: null,
        rejection_reason: null,
        revision_count: null,
      };
      const result = mapMilestoneFromEntity(entity);
      expect(result.deliverableFiles).toEqual([]);
      expect(result.revisionCount).toBe(0);
    });

    it('should map milestone with camelCase fields (deliverableFiles)', () => {
      const entity = {
        id: 'm2',
        title: 'Milestone 2',
        description: 'Desc',
        amount: 300,
        dueDate: now,
        status: 'submitted',
        deliverableFiles: ['file1.pdf', 'file2.pdf'],
        rejectionReason: 'Not good enough',
        revisionCount: 2,
        submittedAt: now,
      };
      const result = mapMilestoneFromEntity(entity);
      expect(result.deliverableFiles).toEqual(['file1.pdf', 'file2.pdf']);
      expect(result.rejectionReason).toBe('Not good enough');
      expect(result.revisionCount).toBe(2);
      expect(result.submittedAt).toBe(now);
    });

    it('should map milestone with snake_case fields', () => {
      const entity = {
        id: 'm3',
        title: 'Milestone 3',
        description: 'Desc',
        amount: 200,
        due_date: now,
        status: 'approved',
        deliverable_files: ['doc.pdf'],
        contract_id: 'c1',
        submitted_at: now,
        approved_at: now,
        completed_at: now,
        rejected_at: undefined,
        rejection_reason: undefined,
        revision_count: 1,
      };
      const result = mapMilestoneFromEntity(entity);
      expect(result.deliverableFiles).toEqual(['doc.pdf']);
      expect(result.contractId).toBe('c1');
      expect(result.approvedAt).toBe(now);
    });
  });

  describe('mapNotificationFromEntity', () => {
    it('should map notification with null data', () => {
      const entity = {
        id: 'n1',
        user_id: 'u1',
        type: 'message',
        title: 'New Message',
        message: 'You have a new message',
        data: null,
        is_read: false,
        created_at: now,
        updated_at: now,
      };
      const result = mapNotificationFromEntity(entity);
      expect(result.data).toBeNull();
      expect(result.isRead).toBe(false);
    });

    it('should map notification with data object', () => {
      const entity = {
        id: 'n2',
        user_id: 'u1',
        type: 'payment',
        title: 'Payment Received',
        message: 'You received a payment',
        data: { amount: 500, contractId: 'c1' },
        is_read: true,
        created_at: now,
        updated_at: now,
      };
      const result = mapNotificationFromEntity(entity);
      expect(result.data).toEqual({ amount: 500, contractId: 'c1' });
      expect(result.isRead).toBe(true);
    });
  });
});
