// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const {
  createKycVerification,
  getKycVerificationById,
  getKycVerificationByUserId,
  getKycVerificationBySessionId,
  updateKycVerification,
  getKycVerificationsByStatus,
  getPendingReviews,
  deleteKycVerification,
  getKycVerificationHistory,
} = await import('../../repositories/didit-kyc-repository.js');

const { Query } = await import('../../config/appwrite.js');

function toAppwriteDoc(data: any) {
  if (!data || typeof data !== 'object') return data;
  const { id, created_at, updated_at, decline_reasons, review_reasons, metadata, ...rest } = data;
  const doc: any = { ...rest };
  if (id !== undefined) doc.$id = id;
  if (created_at !== undefined) doc.$createdAt = created_at;
  if (updated_at !== undefined) doc.$updatedAt = updated_at;
  if (decline_reasons !== undefined) doc.decline_reasons = typeof decline_reasons === 'string' ? decline_reasons : JSON.stringify(decline_reasons);
  if (review_reasons !== undefined) doc.review_reasons = typeof review_reasons === 'string' ? review_reasons : JSON.stringify(review_reasons);
  if (metadata !== undefined) doc.metadata = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
  return doc;
}

describe('DiditKycRepository', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    (Query as any).isNull = jest.fn();
  });

  describe('createKycVerification', () => {
    it('should create and return a verification', async () => {
      const verification = { id: 'k1', user_id: 'u1', status: 'pending' };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc(verification));
      const result = await createKycVerification({ id: 'k1', user_id: 'u1', status: 'pending' } as any);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return null on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      const result = await createKycVerification({ id: 'k1' } as any);
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationById', () => {
    it('should return a verification', async () => {
      const doc = toAppwriteDoc({ id: 'k1', user_id: 'u1', status: 'pending' });
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await getKycVerificationById('k1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return null on database error', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await getKycVerificationById('k1');
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationByUserId', () => {
    it('should return a verification', async () => {
      const doc = toAppwriteDoc({ id: 'k1', user_id: 'u1', status: 'pending' });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await getKycVerificationByUserId('u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await getKycVerificationByUserId('u1');
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await getKycVerificationByUserId('u1');
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationBySessionId', () => {
    it('should return a verification', async () => {
      const doc = toAppwriteDoc({ id: 'k1', didit_session_id: 'sess-1' });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).toBeNull();
    });
  });

  describe('updateKycVerification', () => {
    it('should update and return a verification', async () => {
      const doc = toAppwriteDoc({ id: 'k1', status: 'approved' });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);
      const result = await updateKycVerification('k1', { status: 'approved' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return existing verification when updates are empty', async () => {
      const doc = toAppwriteDoc({ id: 'k1', status: 'pending' });
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await updateKycVerification('k1', {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe('k1');
    });

    it('should return null on database error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      const result = await updateKycVerification('k1', { status: 'approved' });
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationsByStatus', () => {
    it('should return verifications by status', async () => {
      const docs = [toAppwriteDoc({ id: 'k1', status: 'approved' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await getKycVerificationsByStatus('approved');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('k1');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await getKycVerificationsByStatus('approved');
      expect(result).toEqual([]);
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews', async () => {
      const docs = [toAppwriteDoc({ id: 'k1', status: 'completed', reviewed_by: null })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await getPendingReviews();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('k1');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await getPendingReviews();
      expect(result).toEqual([]);
    });
  });

  describe('deleteKycVerification', () => {
    it('should return true on success', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await deleteKycVerification('k1');
      expect(result).toBe(true);
    });

    it('should return false on database error', async () => {
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('delete failed'));
      const result = await deleteKycVerification('k1');
      expect(result).toBe(false);
    });
  });

  describe('getKycVerificationHistory', () => {
    it('should return history', async () => {
      const docs = [toAppwriteDoc({ id: 'k1' }), toAppwriteDoc({ id: 'k2' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await getKycVerificationHistory('u1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('k1');
      expect(result[1]!.id).toBe('k2');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await getKycVerificationHistory('u1');
      expect(result).toEqual([]);
    });
  });
});
