// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

function toAppwriteDoc(data: any) {
  if (!data || typeof data !== 'object') return data;
  const { id, created_at, updated_at, skills, experience, ...rest } = data;
  const doc: any = { ...rest };
  if (id !== undefined) doc.$id = id;
  if (created_at !== undefined) doc.$createdAt = created_at;
  if (updated_at !== undefined) doc.$updatedAt = updated_at;
  if (skills !== undefined) doc.skills = typeof skills === 'string' ? skills : JSON.stringify(skills);
  if (experience !== undefined) doc.experience = typeof experience === 'string' ? experience : JSON.stringify(experience);
  return doc;
}

const { FreelancerProfileRepository } = await import('../../repositories/freelancer-profile-repository.js');

describe('FreelancerProfileRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repo = new FreelancerProfileRepository();
  });

  describe('createProfile', () => {
    it('should create and return a profile', async () => {
      const profile = { id: 'fp1', user_id: 'u1', bio: 'Developer', hourly_rate: 50, skills: [{ name: 'React', years_of_experience: 2 }], availability: 'available' };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc(profile));
      const result = await repo.createProfile(profile as any);
      expect(result.id).toBe('fp1');
      expect(result.user_id).toBe('u1');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createProfile({ id: 'fp1' } as any)).rejects.toThrow();
    });
  });

  describe('getProfileByUserId', () => {
    it('should return a profile by user id', async () => {
      const doc = toAppwriteDoc({ id: 'fp1', user_id: 'u1', bio: 'Developer' });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await repo.getProfileByUserId('u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fp1');
    });

    it('should normalize persisted skill shapes before returning a profile', async () => {
      const doc = toAppwriteDoc({
        id: 'fp1',
        user_id: 'u1',
        bio: 'Developer',
        skills: [
          { name: 'React', yearsOfExperience: 4 },
          { skillName: 'TypeScript', yearsOfExperience: 3 },
          { skill_name: 'Node.js', years_of_experience: 2 },
          'Rust',
          { years_of_experience: 8 },
        ],
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await repo.getProfileByUserId('u1');

      expect(result!.skills).toEqual([
        { name: 'React', years_of_experience: 4 },
        { name: 'TypeScript', years_of_experience: 3 },
        { name: 'Node.js', years_of_experience: 2 },
        { name: 'Rust', years_of_experience: 0 },
      ]);
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

  describe('updateProfile', () => {
    it('should update and return a profile', async () => {
      const doc = toAppwriteDoc({ id: 'fp1', bio: 'Updated' });
      mockDatabases.updateDocument.mockResolvedValueOnce(doc);
      const result = await repo.updateProfile('fp1', { bio: 'Updated' });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fp1');
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateProfile('fp1', { bio: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('getAvailableProfiles', () => {
    it('should return available profiles', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1', availability: 'available' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getAvailableProfiles();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('fp1');
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAvailableProfiles();
      expect(result).toEqual([]);
    });
  });

  describe('searchBySkills', () => {
    it('should return paginated profiles matching skills', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1', skills: [{ name: 'React', years_of_experience: 2 }] })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.searchBySkills(['React']);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should match a legacy persisted skill after normalization', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1', skills: [{ skill_name: 'React', years_of_experience: 2 }] })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await repo.searchBySkills(['React']);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.skills).toEqual([{ name: 'React', years_of_experience: 2 }]);
    });

    it('should handle custom options and hasMore=true', async () => {
      const docs = [
        toAppwriteDoc({ id: 'fp1', skills: [{ name: 'React', years_of_experience: 2 }] }),
        toAppwriteDoc({ id: 'fp2', skills: [{ name: 'React', years_of_experience: 3 }] }),
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.searchBySkills(['React'], { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.searchBySkills(['React']);
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.searchBySkills(['React']);
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('searchByKeyword', () => {
    it('should return profiles matching keyword in bio', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1', bio: 'React developer' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.searchByKeyword('react');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1', bio: 'React developer' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.searchByKeyword('react', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.searchByKeyword('react');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.searchByKeyword('react');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllProfilesPaginated', () => {
    it('should return paginated profiles', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getAllProfilesPaginated();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const docs = [toAppwriteDoc({ id: 'fp1' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 5 });
      const result = await repo.getAllProfilesPaginated({ limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getAllProfilesPaginated();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAllProfilesPaginated();
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('FreelancerProfileRepository - mapProfile experience parsing', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new FreelancerProfileRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  it('should parse experience from JSON string to array', async () => {
    const experienceArr = [
      { id: 'e1', title: 'Senior Dev', company: 'ACME', description: 'Work', start_date: '2020-01-01', end_date: null },
    ];
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'fp1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        user_id: 'u1',
        bio: 'Test bio',
        skills: '[]',
        experience: JSON.stringify(experienceArr),
        availability: 'available',
      }],
      total: 1,
    });

    const result = await repo.getAvailableProfiles();
    expect(result).toHaveLength(1);
    expect(result[0]!.experience).toEqual(experienceArr);
    expect(Array.isArray(result[0]!.experience)).toBe(true);
  });

  it('should parse experience from JSON string via searchBySkills', async () => {
    const experienceArr = [
      { id: 'e2', title: 'Dev', company: 'XYZ', description: 'Code', start_date: '2021-01-01', end_date: '2023-01-01' },
    ];
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'fp2',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        user_id: 'u2',
        bio: 'Developer',
        skills: JSON.stringify([{ name: 'TypeScript', years_of_experience: 3 }]),
        experience: JSON.stringify(experienceArr),
        availability: 'available',
      }],
      total: 1,
    });

    const result = await repo.searchBySkills(['TypeScript']);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.experience).toEqual(experienceArr);
  });

  it('should leave experience as-is when it is already an array', async () => {
    const experienceArr = [{ id: 'e3', title: 'Lead', company: 'ABC', description: 'Lead dev', start_date: '2019-01-01', end_date: null }];
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'fp3',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        user_id: 'u3',
        bio: 'Lead dev',
        experience: experienceArr,
        availability: 'available',
      }],
      total: 1,
    });

    const result = await repo.getAvailableProfiles();
    expect(result).toHaveLength(1);
    expect(result[0]!.experience).toEqual(experienceArr);
  });
});
