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
          '   ',
          42,
          { name: 'Go', years_of_experience: -5 },
        ],
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await repo.getProfileByUserId('u1');

      expect(result!.skills).toEqual([
        { name: 'React', years_of_experience: 4 },
        { name: 'TypeScript', years_of_experience: 3 },
        { name: 'Node.js', years_of_experience: 2 },
        { name: 'Rust', years_of_experience: 0 },
        { name: 'Go', years_of_experience: 0 },
      ]);
    });

    it('should normalize legacy experience fields and assign stable unique ids', async () => {
      const doc = toAppwriteDoc({
        id: 'fp1',
        user_id: 'u1',
        bio: 'Developer',
        experience: [
          { id: 'experience-1', title: 'Engineer', company: 'Current Co', description: 'Current contract', start_date: '2024-01-01', end_date: null },
          { id: 'experience-1', title: 'Developer', company: 'Duplicate Co', description: 'Duplicate persisted id', startDate: '2022-01-01', endDate: '2023-12-31' },
          { experience_id: 'experience-3', title: 'Consultant', company: 'Legacy Co', description: 'Legacy identifier', start_date: '2020-01-01', end_date: null },
          { title: 'Intern', company: 'Old Co', description: 'Missing persisted id', startDate: '2019-01-01', endDate: '2019-12-31' },
          'not an object',
        ],
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await repo.getProfileByUserId('u1');

      expect(result!.experience).toEqual([
        { id: 'experience-1', title: 'Engineer', company: 'Current Co', description: 'Current contract', start_date: '2024-01-01', end_date: null },
        { id: 'legacy-experience-1', title: 'Developer', company: 'Duplicate Co', description: 'Duplicate persisted id', start_date: '2022-01-01', end_date: '2023-12-31' },
        { id: 'experience-3', title: 'Consultant', company: 'Legacy Co', description: 'Legacy identifier', start_date: '2020-01-01', end_date: null },
        { id: 'legacy-experience-3', title: 'Intern', company: 'Old Co', description: 'Missing persisted id', start_date: '2019-01-01', end_date: '2019-12-31' },
      ]);
    });

    it('should fall back to null for missing end dates and de-duplicate legacy ids', async () => {
      const doc = toAppwriteDoc({
        id: 'fp1',
        user_id: 'u1',
        bio: 'Developer',
        experience: [
          { id: 'legacy-experience-1', title: 'First', company: 'A', start_date: '2020-01-01', end_date: '2020-12-31' },
          { title: 'Second', company: 'B', start_date: '2021-01-01' },
          { title: 'Third', company: 'C', startDate: '2022-01-01' },
        ],
      });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });

      const result = await repo.getProfileByUserId('u1');

      expect(result!.experience).toEqual([
        { id: 'legacy-experience-1', title: 'First', company: 'A', description: '', start_date: '2020-01-01', end_date: '2020-12-31' },
        { id: 'legacy-experience-1-1', title: 'Second', company: 'B', description: '', start_date: '2021-01-01', end_date: null },
        { id: 'legacy-experience-2', title: 'Third', company: 'C', description: '', start_date: '2022-01-01', end_date: null },
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

  describe('findByFilters', () => {
    it('should query only allowed primitive filters', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.findByFilters(
        { status: 'open', budget: 100, category: 'dev', title: 'Build', notAllowed: 'x', weird: { nested: 1 } },
        20
      );
      expect(result).toEqual([]);
      const queries = mockDatabases.listDocuments.mock.calls[0][2] as any[];
      const equals = queries.filter(q => q.startsWith('equal('));
      expect(equals.map(q => q.slice(6, q.indexOf(','))).sort()).toEqual(['budget', 'category', 'status', 'title']);
    });

    it('should accept boolean and array values on allowed columns and skip nulls', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.findByFilters({ status: true, category: ['dev', 'design'], budget: null }, 10);
      expect(result).toEqual([]);
      const queries = mockDatabases.listDocuments.mock.calls[0][2] as any[];
      const equals = queries.filter(q => q.startsWith('equal('));
      expect(equals.map(q => q.slice(6, q.indexOf(','))).sort()).toEqual(['category', 'status']);
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
