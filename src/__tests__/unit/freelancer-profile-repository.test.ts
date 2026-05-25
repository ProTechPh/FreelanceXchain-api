import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { FreelancerProfileRepository } = await import('../../repositories/freelancer-profile-repository.js');

describe('FreelancerProfileRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new FreelancerProfileRepository();
  });

  describe('createProfile', () => {
    it('should create and return a profile', async () => {
      const profile = { id: 'fp1', user_id: 'u1', bio: 'Developer' };
      mockAppwriteResult({ data: profile });
      const result = await repo.createProfile(profile as any);
      expect(result).toEqual(profile);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createProfile({ id: 'fp1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getProfileById', () => {
    it('should return a profile', async () => {
      const profile = { id: 'fp1' };
      mockAppwriteResult({ data: profile });
      const result = await repo.getProfileById('fp1');
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getProfileById('fp1');
      expect(result).toBeNull();
    });
  });

  describe('getProfileByUserId', () => {
    it('should return a profile by user id', async () => {
      const profile = { id: 'fp1', user_id: 'u1' };
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
      const profile = { id: 'fp1', bio: 'Updated' };
      mockAppwriteResult({ data: profile });
      const result = await repo.updateProfile('fp1', { bio: 'Updated' });
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateProfile('fp1', { bio: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteProfile', () => {
    it('should delete and return true when exists', async () => {
      mockAppwriteResult({ data: { id: 'fp1' } });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await repo.deleteProfile('fp1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.deleteProfile('fp1');
      expect(result).toBe(false);
    });
  });

  describe('getAllProfiles', () => {
    it('should return all profiles', async () => {
      const profiles = [{ id: 'fp1' }, { id: 'fp2' }];
      mockAppwriteResult({ data: profiles });
      const result = await repo.getAllProfiles();
      expect(result).toEqual(profiles);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllProfiles()).rejects.toThrow('Failed to query');
    });
  });

  describe('getProfilesBySkillId', () => {
    it('should return profiles filtered by skill', async () => {
      const profiles = [{ id: 'fp1', skills: [{ name: 'React', years_of_experience: 2 }] }];
      mockAppwriteResult({ data: profiles });
      const result = await repo.getProfilesBySkillId('react');
      expect(result).toEqual(profiles);
    });

    it('should return empty when no match', async () => {
      mockAppwriteResult({ data: [] });
      const result = await repo.getProfilesBySkillId('rust');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getProfilesBySkillId('react')).rejects.toThrow('Failed to get profiles by skill');
    });
  });

  describe('getAvailableProfiles', () => {
    it('should return available profiles', async () => {
      const profiles = [{ id: 'fp1', availability: 'available' }];
      mockAppwriteResult({ data: profiles });
      const result = await repo.getAvailableProfiles();
      expect(result).toEqual(profiles);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAvailableProfiles()).rejects.toThrow('Failed to get available profiles');
    });
  });

  describe('searchBySkills', () => {
    it('should return paginated profiles matching skills', async () => {
      const profiles = [{ id: 'fp1', total_count: '1' }];
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.searchBySkills(['React']);
      expect(result.items).toEqual(profiles);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const profiles = [{ id: 'fp1', total_count: '5' }];
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.searchBySkills(['React'], { limit: 1, offset: 0 });
      expect(result.items).toEqual(profiles);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.searchBySkills(['React']);
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.searchBySkills(['React'])).rejects.toThrow('Failed to search by skills');
    });
  });

  describe('searchByKeyword', () => {
    it('should return paginated profiles matching keyword', async () => {
      const profiles = [{ id: 'fp1', bio: 'React developer' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.searchByKeyword('react');
      expect(result.items).toEqual(profiles);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const profiles = [{ id: 'fp1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.searchByKeyword('react', { limit: 1, offset: 0 });
      expect(result.items).toEqual(profiles);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.searchByKeyword('react');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should sanitize special characters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await repo.searchByKeyword('test%_\\');
      expect(true).toBe(true);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.searchByKeyword('react')).rejects.toThrow('Failed to search by keyword');
    });
  });

  describe('getAllProfilesPaginated', () => {
    it('should return paginated profiles', async () => {
      const profiles = [{ id: 'fp1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.getAllProfilesPaginated();
      expect(result.items).toEqual(profiles);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const profiles = [{ id: 'fp1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: profiles, rowCount: 1 });
      const result = await repo.getAllProfilesPaginated({ limit: 1, offset: 0 });
      expect(result.items).toEqual(profiles);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getAllProfilesPaginated();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getAllProfilesPaginated()).rejects.toThrow();
    });
  });
});