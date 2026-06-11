import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ProposalRepository } = await import('../../repositories/proposal-repository.js');

const db = () => (globalThis as any).__mockDatabases;

describe('ProposalRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProposalRepository();
  });

  describe('createProposal', () => {
    it('should create and return a proposal', async () => {
      const proposal = { id: 'p1', project_id: 'pr1', freelancer_id: 'f1' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.createProposal(proposal as any);
      expect(result.id).toBe('p1');
      expect(result.project_id).toBe('pr1');
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createProposal({ id: 'p1' } as any)).rejects.toThrow();
    });
  });

  describe('getProposalById', () => {
    it('should return a proposal', async () => {
      const proposal = { id: 'p1' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.getProposalById('p1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getProposalById('p1');
      expect(result).toBeNull();
    });
  });

  describe('updateProposal', () => {
    it('should update and return a proposal', async () => {
      const proposal = { id: 'p1', status: 'accepted' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.updateProposal('p1', { status: 'accepted' });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateProposal('p1', { status: 'accepted' });
      expect(result).toBeNull();
    });
  });

  describe('findProposalById', () => {
    it('should return a proposal', async () => {
      const proposal = { id: 'p1' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.findProposalById('p1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
    });
  });

  describe('getProposalsByProject', () => {
    it('should return paginated proposals', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1' }, { $id: 'p2', project_id: 'pr1' }],
        total: 2,
      });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1' }],
        total: 5,
      });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getProposalsByFreelancer', () => {
    it('should return proposals for a freelancer', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', freelancer_id: 'f1' }],
        total: 1,
      });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual([]);
    });
  });

  describe('hasAcceptedProposal', () => {
    it('should return true when accepted proposal exists', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1' }],
        total: 1,
      });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(true);
    });

    it('should return false when no accepted proposal', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });
  });

  describe('getAcceptedProposalCount', () => {
    it('should return the count', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1' }, { $id: 'p2' }, { $id: 'p3' }],
        total: 3,
      });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(3);
    });

    it('should return 0 when none', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });
  });

  describe('getProposalCountByProject', () => {
    it('should return the count', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1' }],
        total: 5,
      });
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(5);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(0);
    });
  });

  describe('getProposalCountsByProjects', () => {
    it('should return empty map for empty input', async () => {
      const result = await repo.getProposalCountsByProjects([]);
      expect(result.size).toBe(0);
    });

    it('should return counts map', async () => {
      db().listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'p1' }, { $id: 'p2' }], total: 2 })
        .mockResolvedValueOnce({ documents: [{ $id: 'p3' }], total: 1 });
      const result = await repo.getProposalCountsByProjects(['pr1', 'pr2']);
      expect(result.get('pr1')).toBe(2);
      expect(result.get('pr2')).toBe(1);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getProposalCountsByProjects(['pr1']);
      expect(result.get('pr1')).toBe(0);
    });
  });

  describe('getExistingProposal', () => {
    it('should return existing proposal', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1', freelancer_id: 'f1' }],
        total: 1,
      });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('p1');
    });

    it('should return null when not found', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });
  });
});

describe('ProposalRepository - Additional Branch Coverage', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProposalRepository();
  });

  describe('getProposalsByProject - hasMore calculation', () => {
    it('should return hasMore=true when more items available', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1' }],
        total: 5,
      });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should return hasMore=true when documents.length equals limit (more may exist)', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1' }],
        total: 1,
      });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should handle empty count and return hasMore=false', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getProposalsByProject - pagination edge cases', () => {
    it('should handle single page results', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1', project_id: 'pr1' }],
        total: 1,
      });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('should handle offset beyond total count', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 2,
      });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 10 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getProposalsByFreelancer - edge cases', () => {
    it('should handle null data array', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual([]);
    });

    it('should handle empty freelancer list', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual([]);
    });
  });

  describe('hasAcceptedProposal - edge cases', () => {
    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });

    it('should return false when exists is false', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });

    it('should return true when exists is true', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1' }],
        total: 1,
      });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(true);
    });
  });

  describe('getAcceptedProposalCount - edge cases', () => {
    it('should return 0 when none', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });

    it('should return 0 for null total', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });
  });

  describe('getProposalCountByProject - edge cases', () => {
    it('should return 5 proposals', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [{ $id: 'p1' }],
        total: 5,
      });
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(5);
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(0);
    });
  });

  describe('getProposalCountsByProjects - edge cases', () => {
    it('should return empty map for empty input', async () => {
      const result = await repo.getProposalCountsByProjects([]);
      expect(result.size).toBe(0);
    });

    it('should handle empty results', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getProposalCountsByProjects(['pr1']);
      expect(result.get('pr1')).toBe(0);
    });

    it('should handle partial results', async () => {
      db().listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'p1' }, { $id: 'p2' }], total: 2 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getProposalCountsByProjects(['pr1', 'pr2', 'pr3']);
      expect(result.get('pr1')).toBe(2);
      expect(result.get('pr2')).toBe(0);
      expect(result.get('pr3')).toBe(0);
    });
  });

  describe('getExistingProposal - edge cases', () => {
    it('should handle null data and return null', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should handle not found and return null', async () => {
      db().listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should handle database error gracefully', async () => {
      db().listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });
  });
});
