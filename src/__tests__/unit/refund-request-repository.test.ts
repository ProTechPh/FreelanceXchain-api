// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockListDocuments = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { RefundRequestRepository } = await import('../../repositories/refund-request-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('RefundRequestRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new RefundRequestRepository();
  });

  describe('create', () => {
    it('should create and return a refund request', async () => {
      const refund = { id: 'rr1', contract_id: 'c1', requested_by: 'u1', amount: 200, is_partial: false, reason: 'Late delivery', status: 'pending' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(refund));
      const result = await repo.create({ id: 'rr1', contract_id: 'c1', requested_by: 'u1', amount: 200, is_partial: false, reason: 'Late delivery', status: 'pending' } as any);
      expect(result.id).toBe('rr1');
      expect(result.status).toBe('pending');
    });
  });

  describe('getById', () => {
    it('should return a refund request by id', async () => {
      const refund = { id: 'rr1', contract_id: 'c1', status: 'pending' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(refund));
      const result = await repo.getById('rr1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rr1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('rr1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a refund request', async () => {
      const refund = { id: 'rr1', status: 'approved' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(refund));
      const result = await repo.update('rr1', { status: 'approved' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('rr1', { status: 'approved' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a refund request', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('rr1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('rr1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a refund request by column', async () => {
      const refund = { id: 'rr1', contract_id: 'c1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(refund)], total: 1 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rr1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).toBeNull();
    });
  });

  describe('findPendingByContract', () => {
    it('should return the pending refund request for a contract', async () => {
      const refund = { id: 'rr1', contract_id: 'c1', status: 'pending' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(refund)], total: 1 });
      const result = await repo.findPendingByContract('c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rr1');
      expect(result!.status).toBe('pending');
    });

    it('should return null when no pending refund exists', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findPendingByContract('c1');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findPendingByContract('c1');
      expect(result).toBeNull();
    });
  });

  describe('findByContract', () => {
    it('should return all refund requests for a contract', async () => {
      const refunds = [
        toAppwriteDoc({ id: 'rr1', contract_id: 'c1', status: 'pending' }),
        toAppwriteDoc({ id: 'rr2', contract_id: 'c1', status: 'approved' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: refunds, total: 2 });
      const result = await repo.findByContract('c1');
      expect(result).toHaveLength(2);
      expect(result[0].contract_id).toBe('c1');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByContract('c1');
      expect(result).toEqual([]);
    });
  });

  describe('findWithContract', () => {
    it('should return refund request with its contract', async () => {
      const refund = { id: 'rr1', contract_id: 'c1', status: 'pending', amount: 200 };
      const contract = { id: 'c1', project_id: 'p1', status: 'active' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(refund))
        .mockResolvedValueOnce(toAppwriteDoc(contract));

      const result = await repo.findWithContract('rr1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rr1');
      expect(result!.contract).not.toBeNull();
      expect(result!.contract.id).toBe('c1');
    });

    it('should return refund without contract if contract fetch fails', async () => {
      const refund = { id: 'rr1', contract_id: 'c1', status: 'pending' };
      mockGetDocument
        .mockResolvedValueOnce(toAppwriteDoc(refund))
        .mockRejectedValueOnce(new Error('contract not found'));

      const result = await repo.findWithContract('rr1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('rr1');
      expect(result!.contract).toBeNull();
    });

    it('should return null when refund not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.findWithContract('rr1');
      expect(result).toBeNull();
    });
  });
});
