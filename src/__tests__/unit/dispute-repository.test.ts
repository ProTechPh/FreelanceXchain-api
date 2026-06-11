// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { DisputeRepository } = await import('../../repositories/dispute-repository.js');
const { Query } = await import('../../config/appwrite.js');

function toAppwriteDoc(data: any) {
  if (!data || typeof data !== 'object') return data;
  const { id, created_at, updated_at, evidence, resolution, ...rest } = data;
  const doc: any = { ...rest };
  if (id !== undefined) doc.$id = id;
  if (created_at !== undefined) doc.$createdAt = created_at;
  if (updated_at !== undefined) doc.$updatedAt = updated_at;
  if (evidence !== undefined) doc.evidence = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
  if (resolution !== undefined) doc.resolution = typeof resolution === 'string' ? resolution : JSON.stringify(resolution);
  return doc;
}

describe('DisputeRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    (Query as any).notEqual = jest.fn();
    mockDatabases.listDocuments.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockReset();
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
    mockDatabases.createDocument.mockReset();
    mockDatabases.createDocument.mockResolvedValue({ $id: 'doc-id' });
    mockDatabases.updateDocument.mockReset();
    mockDatabases.updateDocument.mockResolvedValue({ $id: 'doc-id' });
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.deleteDocument.mockResolvedValue({});
    repo = new DisputeRepository();
  });

  describe('createDispute', () => {
    it('should create and return a dispute', async () => {
      const dispute = { id: 'd1', contract_id: 'c1', status: 'open', evidence: [] };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc(dispute));
      const result = await repo.createDispute(dispute as any);
      expect(result.id).toBe('d1');
      expect(result.contract_id).toBe('c1');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createDispute({ id: 'd1', evidence: [] } as any)).rejects.toThrow();
    });
  });

  describe('getDisputeById', () => {
    it('should return a dispute', async () => {
      const doc = toAppwriteDoc({ id: 'd1', contract_id: 'c1', evidence: [] });
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await repo.getDisputeById('d1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('d1');
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getDisputeById('d1');
      expect(result).toBeNull();
    });
  });

  describe('updateDispute', () => {
    it('should update and return a dispute', async () => {
      const doc = toAppwriteDoc({ id: 'd1', status: 'resolved', evidence: [] });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);
      const result = await repo.updateDispute('d1', { status: 'resolved' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('d1');
      expect(result!.status).toBe('resolved');
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateDispute('d1', { status: 'resolved' });
      expect(result).toBeNull();
    });
  });

  describe('getDisputesByContract', () => {
    it('should return paginated disputes', async () => {
      const docs = [{ $id: 'd1', contract_id: 'c1', evidence: '[]' }, { $id: 'd2', contract_id: 'c1', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getDisputesByContract('c1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const docs = [{ $id: 'd1', contract_id: 'c1', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 5 });
      const result = await repo.getDisputesByContract('c1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getDisputesByContract('c1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getDisputesByContract('c1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllDisputesByContract', () => {
    it('should return all disputes for a contract', async () => {
      const docs = [{ $id: 'd1', contract_id: 'c1', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getAllDisputesByContract('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('d1');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAllDisputesByContract('c1');
      expect(result).toEqual([]);
    });
  });

  describe('getDisputeByMilestone', () => {
    it('should return a dispute', async () => {
      const doc = toAppwriteDoc({ id: 'd1', milestone_id: 'm1', evidence: [] });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('d1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('query failed'));
      const result = await repo.getDisputeByMilestone('m1');
      expect(result).toBeNull();
    });
  });

  describe('getDisputesByStatus', () => {
    it('should return paginated disputes by status', async () => {
      const docs = [{ $id: 'd1', status: 'open', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getDisputesByStatus('open');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('d1');
    });

    it('should handle custom options and empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getDisputesByStatus('open', { limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getDisputesByStatus('open');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getDisputesByInitiator', () => {
    it('should return paginated disputes by initiator', async () => {
      const docs = [{ $id: 'd1', initiator_id: 'u1', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getDisputesByInitiator('u1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('d1');
    });

    it('should handle custom options', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getDisputesByInitiator('u1', { limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getDisputesByInitiator('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllDisputes', () => {
    it('should return all disputes paginated', async () => {
      const docs = [{ $id: 'd1', evidence: '[]' }, { $id: 'd2', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getAllDisputes();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getAllDisputes({ limit: 5, offset: 0 });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAllDisputes();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getDisputesByUserId', () => {
    it('should return disputes for a user', async () => {
      const docs = [{ $id: 'd1', initiator_id: 'u1', evidence: '[]' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getDisputesByUserId('u1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('d1');
    });

    it('should filter by status', async () => {
      const docs = [
        { $id: 'd1', initiator_id: 'u1', status: 'open', evidence: '[]' },
        { $id: 'd2', initiator_id: 'u1', status: 'resolved', evidence: '[]' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getDisputesByUserId('u1', { status: 'open' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('d1');
    });

    it('should handle custom options and hasMore=true', async () => {
      const docs = [
        { $id: 'd1', initiator_id: 'u1', evidence: '[]' },
        { $id: 'd2', initiator_id: 'u1', evidence: '[]' },
        { $id: 'd3', initiator_id: 'u1', evidence: '[]' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 3 });
      const result = await repo.getDisputesByUserId('u1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(3);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getDisputesByUserId('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getDisputesByUserId('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });
});
