// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

function toAppwriteDoc(data: any) {
  if (!data || typeof data !== 'object') return data;
  const { id, created_at, updated_at, ...rest } = data;
  const doc: any = { ...rest };
  if (id !== undefined) doc.$id = id;
  if (created_at !== undefined) doc.$createdAt = created_at;
  if (updated_at !== undefined) doc.$updatedAt = updated_at;
  return doc;
}

const { RushUpgradeRequestRepository } = await import('../../repositories/rush-upgrade-request-repository.js');

describe('RushUpgradeRequestRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repo = new RushUpgradeRequestRepository();
  });

  describe('createRequest', () => {
    it('should create and return a request', async () => {
      const request = { id: 'r1', contract_id: 'c1', requested_by: 'u1', proposed_percentage: 10, counter_percentage: null, status: 'pending', responded_by: null, responded_at: null };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc(request));
      const result = await repo.createRequest(request as any);
      expect(result.id).toBe('r1');
      expect(result.contract_id).toBe('c1');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createRequest({ id: 'r1' } as any)).rejects.toThrow();
    });
  });

  describe('getRequestById', () => {
    it('should return a request', async () => {
      const doc = toAppwriteDoc({ id: 'r1', contract_id: 'c1', status: 'pending' });
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await repo.getRequestById('r1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getRequestById('r1');
      expect(result).toBeNull();
    });
  });

  describe('updateRequest', () => {
    it('should update and return a request', async () => {
      const doc = toAppwriteDoc({ id: 'r1', status: 'accepted' });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);
      const result = await repo.updateRequest('r1', { status: 'accepted' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
      expect(result!.status).toBe('accepted');
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateRequest('r1', { status: 'accepted' });
      expect(result).toBeNull();
    });
  });

  describe('getRequestsByContract', () => {
    it('should return requests for a contract', async () => {
      const docs = [
        toAppwriteDoc({ id: 'r1', contract_id: 'c1', status: 'pending' }),
        toAppwriteDoc({ id: 'r2', contract_id: 'c1', status: 'accepted' }),
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getRequestsByContract('c1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[1]!.id).toBe('r2');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getRequestsByContract('c1');
      expect(result).toEqual([]);
    });
  });

  describe('getPendingRequestByContract', () => {
    it('should return pending request', async () => {
      const doc = toAppwriteDoc({ id: 'r1', contract_id: 'c1', status: 'pending' });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await repo.getPendingRequestByContract('c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('r1');
    });

    it('should return null when no pending request', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getPendingRequestByContract('c1');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getPendingRequestByContract('c1');
      expect(result).toBeNull();
    });
  });
});
