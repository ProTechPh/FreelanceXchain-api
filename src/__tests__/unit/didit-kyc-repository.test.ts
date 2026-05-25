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

describe('DiditKycRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createKycVerification', () => {
    it('should create and return a verification', async () => {
      const verification = { id: 'k1', user_id: 'u1', status: 'pending' };
      mockAppwriteResult({ data: verification });
      const result = await createKycVerification({ id: 'k1', user_id: 'u1', status: 'pending' } as any);
      expect(result).toEqual(verification);
    });

    it('should return null on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      const result = await createKycVerification({ id: 'k1' } as any);
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationById', () => {
    it('should return a verification', async () => {
      const verification = { id: 'k1' };
      mockAppwriteResult({ data: verification });
      const result = await getKycVerificationById('k1');
      expect(result).toEqual(verification);
    });

    it('should return null on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getKycVerificationById('k1');
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationByUserId', () => {
    it('should return a verification', async () => {
      const verification = { id: 'k1', user_id: 'u1' };
      mockAppwriteResult({ data: verification });
      const result = await getKycVerificationByUserId('u1');
      expect(result).toEqual(verification);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await getKycVerificationByUserId('u1');
      expect(result).toBeNull();
    });

    it('should return null on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getKycVerificationByUserId('u1');
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationBySessionId', () => {
    it('should return a verification', async () => {
      const verification = { id: 'k1', didit_session_id: 'sess-1' };
      mockAppwriteResult({ data: verification });
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).toEqual(verification);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).toBeNull();
    });

    it('should return null on other errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getKycVerificationBySessionId('sess-1');
      expect(result).toBeNull();
    });
  });

  describe('updateKycVerification', () => {
    it('should update and return a verification', async () => {
      const verification = { id: 'k1', status: 'approved' };
      mockAppwriteResult({ data: verification });
      const result = await updateKycVerification('k1', { status: 'approved' });
      expect(result).toEqual(verification);
    });

    it('should return null on database error', async () => {
      mockAppwriteResult({ error: { message: 'update failed' } });
      const result = await updateKycVerification('k1', { status: 'approved' });
      expect(result).toBeNull();
    });
  });

  describe('getKycVerificationsByStatus', () => {
    it('should return verifications by status', async () => {
      const verifications = [{ id: 'k1', status: 'approved' }];
      mockAppwriteResult({ data: verifications });
      const result = await getKycVerificationsByStatus('approved');
      expect(result).toEqual(verifications);
    });

    it('should return empty array on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getKycVerificationsByStatus('approved');
      expect(result).toEqual([]);
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews', async () => {
      const reviews = [{ id: 'k1', status: 'completed', reviewed_by: null }];
      mockAppwriteResult({ data: reviews });
      const result = await getPendingReviews();
      expect(result).toEqual(reviews);
    });

    it('should return empty array on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getPendingReviews();
      expect(result).toEqual([]);
    });
  });

  describe('deleteKycVerification', () => {
    it('should return true on success', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await deleteKycVerification('k1');
      expect(result).toBe(true);
    });

    it('should return false on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('delete failed'));
      const result = await deleteKycVerification('k1');
      expect(result).toBe(false);
    });
  });

  describe('getKycVerificationHistory', () => {
    it('should return history', async () => {
      const history = [{ id: 'k1' }, { id: 'k2' }];
      mockAppwriteResult({ data: history });
      const result = await getKycVerificationHistory('u1');
      expect(result).toEqual(history);
    });

    it('should return empty array on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      const result = await getKycVerificationHistory('u1');
      expect(result).toEqual([]);
    });
  });
});