import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDatabases = {
  createDocument: jest.fn<any>(),
  getDocument: jest.fn<any>(),
  updateDocument: jest.fn<any>(),
  deleteDocument: jest.fn<any>(),
  listDocuments: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
  Query: {
    equal: (field: string, value: any) => ({ field, value, method: 'equal' }),
    orderDesc: (field: string) => ({ field, method: 'orderDesc' }),
    orderAsc: (field: string) => ({ field, method: 'orderAsc' }),
    limit: (value: number) => ({ value, method: 'limit' }),
    cursorAfter: (id: string) => ({ id, method: 'cursorAfter' }),
  },
  ID: { unique: () => 'generated-id' },
}));

const { userCustomSkillRepository, skillSuggestionRepository } = await import('../../repositories/user-custom-skill-repository.js');

describe('UserCustomSkillRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUserCustomSkill', () => {
    it('should create and return a user custom skill', async () => {
      const input = { id: 'skill-1', user_id: 'user-1', name: 'React', description: 'Frontend', years_of_experience: 2, is_approved: false, suggested_for_global: false };
      const doc = { $id: 'skill-1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'React', description: 'Frontend', years_of_experience: 2, is_approved: false, suggested_for_global: false };
      mockDatabases.createDocument.mockResolvedValueOnce(doc);

      const result = await userCustomSkillRepository.createUserCustomSkill(input as any);
      expect(result.id).toBe('skill-1');
      expect(result.name).toBe('React');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(userCustomSkillRepository.createUserCustomSkill({ id: 'skill-1' } as any)).rejects.toThrow('Failed to create user custom skill');
    });
  });

  describe('getUserCustomSkills', () => {
    it('should return skills for a user', async () => {
      const docs = [
        { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill 1' },
        { $id: 's2', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill 2' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await userCustomSkillRepository.getUserCustomSkills('user-1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('s1');
    });

    it('should return empty array when no skills found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await userCustomSkillRepository.getUserCustomSkills('user-1');
      expect(result).toEqual([]);
    });

    it('should reject on database error (fetchAll propagates)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(userCustomSkillRepository.getUserCustomSkills('user-1'))
        .rejects.toThrow('Failed to get user custom skills');
    });

    it('should keep paging with cursorAfter until a short page is returned', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ $id: `s${i}`, $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: `Skill ${i}` }));
      const page2 = [{ $id: 's100', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill 100' }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: page1, total: 101 })
        .mockResolvedValueOnce({ documents: page2, total: 101 });

      const result = await userCustomSkillRepository.getUserCustomSkills('user-1');
      expect(result).toHaveLength(101);
      const secondQueries = mockDatabases.listDocuments.mock.calls[1]![2];
      expect(secondQueries).toEqual(expect.arrayContaining([{ id: 's99', method: 'cursorAfter' }]));
    });
  });

  describe('getUserCustomSkillById', () => {
    it('should return a skill by id', async () => {
      const doc = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill' };
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null when user_id does not match', async () => {
      const doc = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'other-user', name: 'Skill' };
      mockDatabases.getDocument.mockResolvedValueOnce(doc);
      const result = await userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null on database error (base repo catches)', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('db error'));
      const result = await userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('updateUserCustomSkill', () => {
    it('should update and return the skill', async () => {
      const existing = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Old' };
      const updated = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', user_id: 'user-1', name: 'Updated' };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockResolvedValueOnce(updated);
      const result = await userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated');
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should return null on database error (base repo catches)', async () => {
      const existing = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Old' };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      const result = await userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteUserCustomSkill', () => {
    it('should delete and return true', async () => {
      const existing = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill' };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1');
      expect(result).toBe(false);
    });

    it('should return false on database error (base repo catches)', async () => {
      const existing = { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Skill' };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('delete failed'));
      const result = await userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('searchUserCustomSkills', () => {
    it('should return matching skills', async () => {
      const docs = [
        { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'React', description: 'Frontend framework' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'react');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('React');
    });

    it('should return empty array on no matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'xyz');
      expect(result).toEqual([]);
    });

    it('should reject on database error (fetchAll propagates)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('search failed'));
      await expect(userCustomSkillRepository.searchUserCustomSkills('user-1', 'react'))
        .rejects.toThrow('Failed to search user custom skills');
    });

    it('should match skill when keyword is in description but not name (|| branch)', async () => {
      const docs = [
        { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'TypeScript', description: 'A typed superset of JavaScript', years_of_experience: 3, is_approved: true, suggested_for_global: false },
        { $id: 's2', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', user_id: 'user-1', name: 'Go', description: 'A compiled language', years_of_experience: 1, is_approved: true, suggested_for_global: false },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      // 'javascript' is in the description of TypeScript but not in the name
      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'javascript');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('TypeScript');
    });
  });
});

describe('SkillSuggestionRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSkillSuggestion', () => {
    it('should create and return a suggestion', async () => {
      const input = { id: 'sg1', skill_name: 'Rust', user_id: 'user-1', skill_description: 'Systems lang', suggested_by: 'User', times_requested: 1, status: 'pending' };
      const doc = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', skill_name: 'Rust', user_id: 'user-1', skill_description: 'Systems lang', suggested_by: 'User', times_requested: 1, status: 'pending' };
      mockDatabases.createDocument.mockResolvedValueOnce(doc);
      const result = await skillSuggestionRepository.createSkillSuggestion(input as any);
      expect(result.skill_name).toBe('Rust');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(skillSuggestionRepository.createSkillSuggestion({ id: 'sg1' } as any)).rejects.toThrow('Failed to create skill suggestion');
    });
  });

  describe('getSkillSuggestionByName', () => {
    it('should return a suggestion by name', async () => {
      const doc = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', skill_name: 'Rust' };
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await skillSuggestionRepository.getSkillSuggestionByName('Rust');
      expect(result).not.toBeNull();
      expect(result!.skill_name).toBe('Rust');
    });

    it('should match casing/padding variants of the same suggestion name', async () => {
      const doc = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', skill_name: 'React' };
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [doc], total: 1 });
      const result = await skillSuggestionRepository.getSkillSuggestionByName(' REACT ');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sg1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await skillSuggestionRepository.getSkillSuggestionByName('Rust');
      expect(result).toBeNull();
    });

    it('should reject on database error (fetchAll propagates)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('db error'));
      await expect(skillSuggestionRepository.getSkillSuggestionByName('Rust'))
        .rejects.toThrow('Failed to get skill suggestion');
    });
  });

  describe('recordSuggestionRequest', () => {
    it('should increment and return updated suggestion for a new requester', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 5, requester_ids: ['user-a'] };
      const updated = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', times_requested: 6, requester_ids: ['user-a', 'user-b'] };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockResolvedValueOnce(updated);
      const result = await skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-b');
      expect(result).not.toBeNull();
      expect(result!.times_requested).toBe(6);
      expect(result!.requester_ids).toEqual(['user-a', 'user-b']);
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    // BLF-skill.3: repeat request from the SAME user must not inflate the counter.
    it('should NOT increment when the same user requests again (anti-spam dedup)', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 3, requester_ids: ['user-a', 'user-b'] };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      const result = await skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-b');
      expect(result).not.toBeNull();
      expect(result!.times_requested).toBe(3);
      expect(result!.requester_ids).toEqual(['user-a', 'user-b']);
      // No update issued: deleting/re-creating the same skill must not bump popularity.
      expect(mockDatabases.updateDocument).not.toHaveBeenCalled();
    });

    it('should tolerate a suggestion whose requester_ids field is missing', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 1 };
      const updated = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', times_requested: 2, requester_ids: ['user-x'] };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockResolvedValueOnce(updated);
      const result = await skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-x');
      expect(result).not.toBeNull();
      expect(result!.times_requested).toBe(2);
    });

    // BLF-skill.3 race guard: the read-modify-write is serialized with withLock,
    // so two concurrent requests from the same NEW user cannot both read
    // requester_ids without that user and double-increment the counter.
    it('should not double-increment on concurrent requests from the same new user', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 1, requester_ids: [] };
      const updated = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', times_requested: 2, requester_ids: ['user-b'] };
      // First call reads the pristine doc; the serialized second call re-reads
      // the committed state (already contains user-b) and must NOT update again.
      mockDatabases.getDocument
        .mockResolvedValueOnce(existing)
        .mockResolvedValue(updated);
      mockDatabases.updateDocument.mockResolvedValue(updated);

      const [first, second] = await Promise.all([
        skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-b'),
        skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-b'),
      ]);

      expect(first!.times_requested).toBe(2);
      expect(second!.times_requested).toBe(2);
      // Exactly one increment: one update for the first caller, none for the second.
      expect(mockDatabases.updateDocument).toHaveBeenCalledTimes(1);
    });

    it('should return null when suggestion not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-a');
      expect(result).toBeNull();
    });

    it('should return null on update error (base repo catches)', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 5, requester_ids: [] };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      const result = await skillSuggestionRepository.recordSuggestionRequest('sg1', 'user-z');
      expect(result).toBeNull();
    });
  });

  describe('getPendingSkillSuggestions', () => {
    it('should return pending suggestions', async () => {
      const docs = [{ $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', status: 'pending' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await skillSuggestionRepository.getPendingSkillSuggestions();
      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('pending');
    });

    it('should return empty array when none pending', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await skillSuggestionRepository.getPendingSkillSuggestions();
      expect(result).toEqual([]);
    });

    it('should reject on database error (fetchAll propagates)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(skillSuggestionRepository.getPendingSkillSuggestions())
        .rejects.toThrow('Failed to get pending skill suggestions');
    });
  });

  describe('updateSkillSuggestionStatus', () => {
    it('should update and return the suggestion', async () => {
      const updated = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', status: 'approved' };
      mockDatabases.updateDocument.mockResolvedValueOnce(updated);
      const result = await skillSuggestionRepository.updateSkillSuggestionStatus('sg1', 'approved');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
    });

    it('should return null on database error (base repo catches)', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      const result = await skillSuggestionRepository.updateSkillSuggestionStatus('sg1', 'approved');
      expect(result).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('UserCustomSkillRepository - error handling (branch coverage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw in getUserCustomSkills when fetchAll fails', async () => {
    jest.spyOn(userCustomSkillRepository as any, 'fetchAll')
      .mockRejectedValueOnce(new Error('db connection lost'));

    await expect(userCustomSkillRepository.getUserCustomSkills('u1'))
      .rejects.toThrow('Failed to get user custom skills: db connection lost');
  });

  it('should throw in getUserCustomSkillById when getById fails (line 63)', async () => {
    jest.spyOn(userCustomSkillRepository, 'getById' as any)
      .mockRejectedValueOnce(new Error('query timeout'));

    await expect(userCustomSkillRepository.getUserCustomSkillById('s1', 'u1'))
      .rejects.toThrow('Failed to get user custom skill: query timeout');
  });

  it('should throw in updateUserCustomSkill when getById fails (line 77)', async () => {
    jest.spyOn(userCustomSkillRepository, 'getById' as any)
      .mockRejectedValueOnce(new Error('network error'));

    await expect(userCustomSkillRepository.updateUserCustomSkill('s1', 'u1', { name: 'Updated' }))
      .rejects.toThrow('Failed to update user custom skill: network error');
  });

  it('should throw in deleteUserCustomSkill when getById fails (line 87)', async () => {
    jest.spyOn(userCustomSkillRepository, 'getById' as any)
      .mockRejectedValueOnce(new Error('permission denied'));

    await expect(userCustomSkillRepository.deleteUserCustomSkill('s1', 'u1'))
      .rejects.toThrow('Failed to delete user custom skill: permission denied');
  });

  it('should throw in searchUserCustomSkills when fetchAll fails', async () => {
    jest.spyOn(userCustomSkillRepository as any, 'fetchAll')
      .mockRejectedValueOnce(new Error('index error'));

    await expect(userCustomSkillRepository.searchUserCustomSkills('u1', 'react'))
      .rejects.toThrow('Failed to search user custom skills: index error');
  });
});

describe('SkillSuggestionRepository - error handling (branch coverage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw in getSkillSuggestionByName when fetchAll fails', async () => {
    jest.spyOn(skillSuggestionRepository, 'fetchAll' as any)
      .mockRejectedValueOnce(new Error('db error'));

    await expect(skillSuggestionRepository.getSkillSuggestionByName('TypeScript'))
      .rejects.toThrow('Failed to get skill suggestion: db error');
  });

  it('should throw in recordSuggestionRequest when getById fails', async () => {
    jest.spyOn(skillSuggestionRepository, 'getById' as any)
      .mockRejectedValueOnce(new Error('record not found'));

    await expect(skillSuggestionRepository.recordSuggestionRequest('ss1', 'u1'))
      .rejects.toThrow('Failed to record skill suggestion request: record not found');
  });

  it('should throw in getPendingSkillSuggestions when fetchAll fails', async () => {
    jest.spyOn(skillSuggestionRepository as any, 'fetchAll')
      .mockRejectedValueOnce(new Error('table locked'));

    await expect(skillSuggestionRepository.getPendingSkillSuggestions())
      .rejects.toThrow('Failed to get pending skill suggestions: table locked');
  });

  it('should throw in updateSkillSuggestionStatus when update fails (line 157)', async () => {
    jest.spyOn(skillSuggestionRepository, 'update' as any)
      .mockRejectedValueOnce(new Error('write conflict'));

    await expect(skillSuggestionRepository.updateSkillSuggestionStatus('ss1', 'approved'))
      .rejects.toThrow('Failed to update skill suggestion status: write conflict');
  });

  it('should throw in updateSkillSuggestionStatus with rejected status', async () => {
    jest.spyOn(skillSuggestionRepository, 'update' as any)
      .mockRejectedValueOnce(new Error('constraint violation'));

    await expect(skillSuggestionRepository.updateSkillSuggestionStatus('ss2', 'rejected'))
      .rejects.toThrow('Failed to update skill suggestion status: constraint violation');
  });
});
