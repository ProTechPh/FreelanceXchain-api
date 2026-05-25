import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { EmployerProfileRepository } = await import('../../repositories/employer-profile-repository.js');

describe('EmployerProfileRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new EmployerProfileRepository();
  });

  describe('createProfile', () => {
    it('should create and return a profile', async () => {
      const profile = { id: 'ep1', user_id: 'u1', company_name: 'Acme' };
      mockAppwriteResult({ data: profile });
      const result = await repo.createProfile(profile as any);
      expect(result).toEqual(profile);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createProfile({ id: 'ep1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getProfileById', () => {
    it('should return a profile', async () => {
      const profile = { id: 'ep1' };
      mockAppwriteResult({ data: profile });
      const result = await repo.getProfileById('ep1');
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getProfileById('ep1');
      expect(result).toBeNull();
    });
  });

  describe('getProfileByUserId', () => {
    it('should return a profile by user id', async () => {
      const profile = { id: 'ep1', user_id: 'u1' };
      mockAppwriteResult({ data: profile });
      const result = await repo.getProfileByUserId('u1');
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getProfileByUserId('u1');
      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update and return a profile', async () => {
      const profile = { id: 'ep1', company_name: 'Updated' };
      mockAppwriteResult({ data: profile });
      const result = await repo.updateProfile('ep1', { company_name: 'Updated' });
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateProfile('ep1', { company_name: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteProfile', () => {
    it('should delete and return true when exists', async () => {
      mockAppwriteResult({ data: { id: 'ep1' } });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await repo.deleteProfile('ep1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.deleteProfile('ep1');
      expect(result).toBe(false);
    });
  });

  describe('getAllProfiles', () => {
    it('should return all profiles', async () => {
      const profiles = [{ id: 'ep1' }, { id: 'ep2' }];
      mockAppwriteResult({ data: profiles });
      const result = await repo.getAllProfiles();
      expect(result).toEqual(profiles);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllProfiles()).rejects.toThrow('Failed to query');
    });
  });

  describe('getProfilesByIndustry', () => {
    it('should return profiles by industry', async () => {
      const profiles = [{ id: 'ep1', industry: 'Tech' }];
      mockAppwriteResult({ data: profiles });
      const result = await repo.getProfilesByIndustry('Tech');
      expect(result).toEqual(profiles);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getProfilesByIndustry('Tech')).rejects.toThrow('Failed to get profiles by industry');
    });
  });
});