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

const { EmployerProfileRepository } = await import('../../repositories/employer-profile-repository.js');

describe('EmployerProfileRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repo = new EmployerProfileRepository();
  });

  describe('createProfile', () => {
    it('should create and return a profile', async () => {
      const profile = { id: 'ep1', user_id: 'u1', company_name: 'Acme', description: 'Tech company', industry: 'Tech' };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc(profile));
      const result = await repo.createProfile(profile as any);
      expect(result.id).toBe('ep1');
      expect(result.company_name).toBe('Acme');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createProfile({ id: 'ep1' } as any)).rejects.toThrow();
    });
  });

  describe('getProfileByUserId', () => {
    it('should return a profile by user id', async () => {
      const doc = toAppwriteDoc({ id: 'ep1', user_id: 'u1', company_name: 'Acme' });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await repo.getProfileByUserId('u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ep1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getProfileByUserId('u1');
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getProfileByUserId('u1');
      expect(result).toBeNull();
    });
  });

  describe('getProfilesByUserIds', () => {
    it('should return a map of profiles keyed by user_id', async () => {
      const docs = [
        toAppwriteDoc({ id: 'ep1', user_id: 'u1', company_name: 'Acme' }),
        toAppwriteDoc({ id: 'ep2', user_id: 'u2', company_name: 'Globex' }),
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getProfilesByUserIds(['u1', 'u2']);
      expect(result.size).toBe(2);
      expect(result.get('u1')?.company_name).toBe('Acme');
      expect(result.get('u2')?.company_name).toBe('Globex');
    });

    it('should dedupe user ids before querying', async () => {
      const docs = [toAppwriteDoc({ id: 'ep1', user_id: 'u1', company_name: 'Acme' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getProfilesByUserIds(['u1', 'u1', 'u1']);
      expect(result.size).toBe(1);
      expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(1);
    });

    it('should return an empty map for an empty input array without querying', async () => {
      const result = await repo.getProfilesByUserIds([]);
      expect(result.size).toBe(0);
      expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    });

    it('should return an empty map when no profiles match', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getProfilesByUserIds(['u1']);
      expect(result.size).toBe(0);
    });

    it('should return an empty map on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('query failed'));
      const result = await repo.getProfilesByUserIds(['u1']);
      expect(result.size).toBe(0);
    });
  });

  describe('updateProfile', () => {
    it('should update and return a profile', async () => {
      const doc = toAppwriteDoc({ id: 'ep1', company_name: 'Updated' });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);
      const result = await repo.updateProfile('ep1', { company_name: 'Updated' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ep1');
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateProfile('ep1', { company_name: 'Updated' });
      expect(result).toBeNull();
    });
  });
});
