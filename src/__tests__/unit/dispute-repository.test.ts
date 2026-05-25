import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { DisputeRepository } = await import('../../repositories/dispute-repository.js');

describe('DisputeRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new DisputeRepository();
  });

  describe('createDispute', () => {
    it('should create and return a dispute', async () => {
      const dispute = { id: 'd1', contract_id: 'c1', status: 'open' };
      mockAppwriteResult({ data: dispute });
      const result = await repo.createDispute(dispute as any);
      expect(result).toEqual(dispute);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createDispute({ id: 'd1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getDisputeById', () => {
    it('should return a dispute', async () => {
      const dispute = { id: 'd1' };
      mockAppwriteResult({ data: dispute });
      const result = await repo.getDisputeById('d1');
      expect(result).toEqual(dispute);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getDisputeById('d1');
      expect(result).toBeNull();
    });
  });

  describe('updateDispute', () => {
    it('should update and return a dispute', async () => {
      const dispute = { id: 'd1', status: 'resolved' };
      mockAppwriteResult({ data: dispute });
      const result = await repo.updateDispute('d1', { status: 'resolved' });
      expect(result).toEqual(dispute);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateDispute('d1', { status: 'resolved' });
      expect(result).toBeNull();
    });
  });

  describe('getDisputesByContract', () => {
    it('should return paginated disputes', async () => {
      const disputes = [{ id: 'd1' }, { id: 'd2' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 2 });
      const result = await repo.getDisputesByContract('c1');
      expect(result.items).toEqual(disputes);
      expect(result.total).toBe(2);
    });

    it('should handle custom options and hasMore=true', async () => {
      const disputes = [{ id: 'd1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByContract('c1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(disputes);
      expect(result.hasMore).toBe(true);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getDisputesByContract('c1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getDisputesByContract('c1')).rejects.toThrow('Failed to get disputes by contract');
    });
  });

  describe('getAllDisputesByContract', () => {
    it('should return all disputes for a contract', async () => {
      const disputes = [{ id: 'd1' }];
      mockAppwriteResult({ data: disputes });
      const result = await repo.getAllDisputesByContract('c1');
      expect(result).toEqual(disputes);
    });

    it('should return empty array when data is null', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getAllDisputesByContract('c1');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllDisputesByContract('c1')).rejects.toThrow('Failed to get all disputes by contract');
    });
  });

  describe('getDisputeByMilestone', () => {
    it('should return a dispute', async () => {
      const dispute = { id: 'd1', milestone_id: 'm1' };
      mockAppwriteResult({ data: dispute });
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).toEqual(dispute);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).toBeNull();
    });

    it('should throw on query error (line 104)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('query failed'));
      await expect(repo.getDisputeByMilestone('m1')).rejects.toThrow('Failed to get dispute by milestone');
    });
  });

  describe('getDisputesByStatus', () => {
    it('should return paginated disputes by status', async () => {
      const disputes = [{ id: 'd1', status: 'open' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByStatus('open');
      expect(result.items).toEqual(disputes);
    });

    it('should handle custom options and empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getDisputesByStatus('open', { limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getDisputesByStatus('open')).rejects.toThrow('Failed to get disputes by status');
    });
  });

  describe('getDisputesByInitiator', () => {
    it('should return paginated disputes by initiator', async () => {
      const disputes = [{ id: 'd1', initiator_id: 'u1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByInitiator('u1');
      expect(result.items).toEqual(disputes);
    });

    it('should handle custom options', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getDisputesByInitiator('u1', { limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getDisputesByInitiator('u1')).rejects.toThrow('Failed to get disputes by initiator');
    });
  });

  describe('getAllDisputes', () => {
    it('should return all disputes paginated', async () => {
      const disputes = [{ id: 'd1' }, { id: 'd2' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 2 });
      const result = await repo.getAllDisputes();
      expect(result.items).toEqual(disputes);
    });

    it('should filter by status when provided', async () => {
      const disputes = [{ id: 'd1', status: 'open' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getAllDisputes({ status: 'open' });
      expect(result.items).toEqual(disputes);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getAllDisputes({ limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAllDisputes()).rejects.toThrow('Failed to get all disputes');
    });
  });

  describe('getDisputesByUserId', () => {
    it('should return disputes for a user', async () => {
      const disputes = [{ id: 'd1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByUserId('u1');
      expect(result.items).toEqual(disputes);
    });

    it('should filter by status', async () => {
      const disputes = [{ id: 'd1', status: 'open' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByUserId('u1', { status: 'open' });
      expect(result.items).toEqual(disputes);
    });

    it('should handle custom options and hasMore=true', async () => {
      const disputes = [{ id: 'd1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: disputes, rowCount: 1 });
      const result = await repo.getDisputesByUserId('u1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(disputes);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getAllDisputes();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAllDisputes()).rejects.toThrow('Failed to get all disputes');
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getDisputesByUserId('u1')).rejects.toThrow('Failed to get disputes by user');
    });
  });
});