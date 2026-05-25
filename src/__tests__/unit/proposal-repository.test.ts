import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ProposalRepository } = await import('../../repositories/proposal-repository.js');

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
      expect(result).toEqual(proposal);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createProposal({ id: 'p1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getProposalById', () => {
    it('should return a proposal', async () => {
      const proposal = { id: 'p1' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.getProposalById('p1');
      expect(result).toEqual(proposal);
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
      expect(result).toEqual(proposal);
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
      expect(result).toEqual(proposal);
    });
  });

  describe('getProposalsByProject', () => {
    it('should return paginated proposals', async () => {
      const proposals = [{ id: 'p1' }, { id: 'p2' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: proposals, rowCount: 2 });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual(proposals);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const proposals = [{ id: 'p1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: proposals, rowCount: 1 });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(proposals);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getProposalsByProject('pr1')).rejects.toThrow('Failed to get proposals by project');
    });
  });

  describe('getProposalsByFreelancer', () => {
    it('should return proposals for a freelancer', async () => {
      const proposals = [{ id: 'p1', freelancer_id: 'f1' }];
      mockAppwriteResult({ data: proposals });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual(proposals);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getProposalsByFreelancer('f1')).rejects.toThrow('Failed to get proposals by freelancer');
    });
  });

  describe('hasAcceptedProposal', () => {
    it('should return true when accepted proposal exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(true);
    });

    it('should return false when no accepted proposal', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.hasAcceptedProposal('pr1')).rejects.toThrow('Failed to check accepted proposal');
    });
  });

  describe('getAcceptedProposalCount', () => {
    it('should return the count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(3);
    });

    it('should return 0 when none', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAcceptedProposalCount('pr1')).rejects.toThrow('Failed to get accepted proposal count');
    });
  });

  describe('getProposalCountByProject', () => {
    it('should return the count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(5);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getProposalCountByProject('pr1')).rejects.toThrow('Failed to get proposal count');
    });
  });

  describe('getProposalCountsByProjects', () => {
    it('should return empty map for empty input', async () => {
      const result = await repo.getProposalCountsByProjects([]);
      expect(result.size).toBe(0);
    });

    it('should return counts map', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ project_id: 'pr1', count: '2' }, { project_id: 'pr2', count: '1' }], rowCount: 2 });
      const result = await repo.getProposalCountsByProjects(['pr1', 'pr2']);
      expect(result.get('pr1')).toBe(2);
      expect(result.get('pr2')).toBe(1);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getProposalCountsByProjects(['pr1'])).rejects.toThrow('Failed to get proposal counts');
    });
  });

  describe('getExistingProposal', () => {
    it('should return existing proposal', async () => {
      const proposal = { id: 'p1', project_id: 'pr1', freelancer_id: 'f1' };
      mockAppwriteResult({ data: proposal });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toEqual(proposal);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getExistingProposal('pr1', 'f1')).rejects.toThrow('Failed to get existing proposal');
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
      const proposals = [{ id: 'p1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: proposals, rowCount: 1 });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(proposals);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should return hasMore=false when exactly at limit', async () => {
      const proposals = [{ id: 'p1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: proposals, rowCount: 1 });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('should handle empty count and return hasMore=false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getProposalsByProject('pr1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getProposalsByProject - pagination edge cases', () => {
    it('should handle single page results', async () => {
      const proposals = [{ id: 'p1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: proposals, rowCount: 1 });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(proposals);
      expect(result.hasMore).toBe(false);
    });

    it('should handle offset beyond total count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getProposalsByProject('pr1', { limit: 1, offset: 10 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getProposalsByFreelancer - edge cases', () => {
    it('should handle null data array', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual([]);
    });

    it('should handle empty freelancer list', async () => {
      mockAppwriteResult({ data: [] });
      const result = await repo.getProposalsByFreelancer('f1');
      expect(result).toEqual([]);
    });
  });

  describe('hasAcceptedProposal - edge cases', () => {
    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.hasAcceptedProposal('pr1')).rejects.toThrow('Failed to check accepted proposal');
    });

    it('should return false when exists is false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(false);
    });

    it('should return true when exists is true', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });
      const result = await repo.hasAcceptedProposal('pr1');
      expect(result).toBe(true);
    });
  });

  describe('getAcceptedProposalCount - edge cases', () => {
    it('should return 0 when none', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAcceptedProposalCount('pr1')).rejects.toThrow('Failed to get accepted proposal count');
    });

    it('should return 0 for null count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: null }], rowCount: 1 });
      const result = await repo.getAcceptedProposalCount('pr1');
      expect(result).toBeNaN();
    });
  });

  describe('getProposalCountByProject - edge cases', () => {
    it('should return 5 proposals', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      const result = await repo.getProposalCountByProject('pr1');
      expect(result).toBe(5);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getProposalCountByProject('pr1')).rejects.toThrow('Failed to get proposal count');
    });
  });

  describe('getProposalCountsByProjects - edge cases', () => {
    it('should return empty map for empty input', async () => {
      const result = await repo.getProposalCountsByProjects([]);
      expect(result.size).toBe(0);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getProposalCountsByProjects(['pr1']);
      expect(result.get('pr1')).toBeUndefined();
    });

    it('should handle partial results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ project_id: 'pr1', count: '2' }], rowCount: 1 });
      const result = await repo.getProposalCountsByProjects(['pr1', 'pr2', 'pr3']);
      expect(result.get('pr1')).toBe(2);
      expect(result.get('pr2')).toBeUndefined();
      expect(result.get('pr3')).toBeUndefined();
    });
  });

  describe('getExistingProposal - edge cases', () => {
    it('should handle null data and return null', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should handle not found and return null', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getExistingProposal('pr1', 'f1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getExistingProposal('pr1', 'f1')).rejects.toThrow('Failed to get existing proposal');
    });
  });
});