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

    it('should return empty array on database error (base repo catches)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await userCustomSkillRepository.getUserCustomSkills('user-1');
      expect(result).toEqual([]);
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

    it('should return empty array on database error (base repo catches)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('search failed'));
      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'react');
      expect(result).toEqual([]);
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

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await skillSuggestionRepository.getSkillSuggestionByName('Rust');
      expect(result).toBeNull();
    });

    it('should return null on database error (base repo catches)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await skillSuggestionRepository.getSkillSuggestionByName('Rust');
      expect(result).toBeNull();
    });
  });

  describe('incrementSkillSuggestionCount', () => {
    it('should increment and return updated suggestion', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 5 };
      const updated = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-02', times_requested: 6 };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockResolvedValueOnce(updated);
      const result = await skillSuggestionRepository.incrementSkillSuggestionCount('sg1');
      expect(result).not.toBeNull();
      expect(result!.times_requested).toBe(6);
    });

    it('should return null when suggestion not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await skillSuggestionRepository.incrementSkillSuggestionCount('sg1');
      expect(result).toBeNull();
    });

    it('should return null on update error (base repo catches)', async () => {
      const existing = { $id: 'sg1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', times_requested: 5 };
      mockDatabases.getDocument.mockResolvedValueOnce(existing);
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      const result = await skillSuggestionRepository.incrementSkillSuggestionCount('sg1');
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

    it('should return empty array on database error (base repo catches)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await skillSuggestionRepository.getPendingSkillSuggestions();
      expect(result).toEqual([]);
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

  it('should throw in getUserCustomSkills when listWithQueries fails (line 53)', async () => {
    jest.spyOn(userCustomSkillRepository as any, 'listWithQueries')
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

  it('should throw in searchUserCustomSkills when listWithQueries fails (line 103)', async () => {
    jest.spyOn(userCustomSkillRepository as any, 'listWithQueries')
      .mockRejectedValueOnce(new Error('index error'));

    await expect(userCustomSkillRepository.searchUserCustomSkills('u1', 'react'))
      .rejects.toThrow('Failed to search user custom skills: index error');
  });
});

describe('SkillSuggestionRepository - error handling (branch coverage)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw in getSkillSuggestionByName when findOne fails (line 125)', async () => {
    jest.spyOn(skillSuggestionRepository, 'findOne' as any)
      .mockRejectedValueOnce(new Error('db error'));

    await expect(skillSuggestionRepository.getSkillSuggestionByName('TypeScript'))
      .rejects.toThrow('Failed to get skill suggestion: db error');
  });

  it('should throw in incrementSkillSuggestionCount when getById fails (line 135)', async () => {
    jest.spyOn(skillSuggestionRepository, 'getById' as any)
      .mockRejectedValueOnce(new Error('record not found'));

    await expect(skillSuggestionRepository.incrementSkillSuggestionCount('ss1'))
      .rejects.toThrow('Failed to increment skill suggestion count: record not found');
  });

  it('should throw in getPendingSkillSuggestions when listWithQueries fails (line 146)', async () => {
    jest.spyOn(skillSuggestionRepository as any, 'listWithQueries')
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
