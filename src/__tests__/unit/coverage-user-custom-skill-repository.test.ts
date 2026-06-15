// @ts-nocheck
/**
 * Targets remaining uncovered lines/branches in user-custom-skill-repository.ts:
 * - Lines 53, 63, 77, 87, 103, 125, 135, 146, 157: Catch blocks that re-throw
 *   (These are unreachable through normal operations because base repo methods catch errors first.
 *    We mock the base class methods to throw directly, bypassing base repo error handling.)
 * - Branch L99: searchUserCustomSkills description match branch
 */
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
    offset: (value: number) => ({ value, method: 'offset' }),
  },
  ID: { unique: () => 'generated-id' },
}));

const { userCustomSkillRepository, skillSuggestionRepository } = await import('../../repositories/user-custom-skill-repository.js');

describe('UserCustomSkillRepository - Catch Block Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // L53: getUserCustomSkills catch block
  describe('getUserCustomSkills catch block (L53)', () => {
    it('should throw with wrapped error when listWithQueries throws directly', async () => {
      // Mock listWithQueries on the instance to bypass base repo try/catch
      const origListWithQueries = (userCustomSkillRepository as any).listWithQueries;
      (userCustomSkillRepository as any).listWithQueries = jest.fn().mockRejectedValue(new Error('DB query failed'));

      await expect(userCustomSkillRepository.getUserCustomSkills('user-1'))
        .rejects.toThrow('Failed to get user custom skills: DB query failed');

      // Restore
      (userCustomSkillRepository as any).listWithQueries = origListWithQueries;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origListWithQueries = (userCustomSkillRepository as any).listWithQueries;
      (userCustomSkillRepository as any).listWithQueries = jest.fn().mockRejectedValue('string error');

      await expect(userCustomSkillRepository.getUserCustomSkills('user-1'))
        .rejects.toThrow('Failed to get user custom skills');

      (userCustomSkillRepository as any).listWithQueries = origListWithQueries;
    });
  });

  // L63: getUserCustomSkillById catch block
  describe('getUserCustomSkillById catch block (L63)', () => {
    it('should throw with wrapped error when getById throws directly', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue(new Error('Get failed'));

      await expect(userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1'))
        .rejects.toThrow('Failed to get user custom skill: Get failed');

      (userCustomSkillRepository as any).getById = origGetById;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue(42);

      await expect(userCustomSkillRepository.getUserCustomSkillById('s1', 'user-1'))
        .rejects.toThrow('Failed to get user custom skill');

      (userCustomSkillRepository as any).getById = origGetById;
    });
  });

  // L77: updateUserCustomSkill catch block
  describe('updateUserCustomSkill catch block (L77)', () => {
    it('should throw with wrapped error when getById throws', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue(new Error('Lookup failed'));

      await expect(userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' }))
        .rejects.toThrow('Failed to update user custom skill: Lookup failed');

      (userCustomSkillRepository as any).getById = origGetById;
    });

    it('should throw with wrapped error when update throws', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      const origUpdate = (userCustomSkillRepository as any).update;
      (userCustomSkillRepository as any).getById = jest.fn().mockResolvedValue({ id: 's1', user_id: 'user-1' });
      (userCustomSkillRepository as any).update = jest.fn().mockRejectedValue(new Error('Update failed'));

      await expect(userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' }))
        .rejects.toThrow('Failed to update user custom skill: Update failed');

      (userCustomSkillRepository as any).getById = origGetById;
      (userCustomSkillRepository as any).update = origUpdate;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue('string err');

      await expect(userCustomSkillRepository.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' }))
        .rejects.toThrow('Failed to update user custom skill');

      (userCustomSkillRepository as any).getById = origGetById;
    });
  });

  // L87: deleteUserCustomSkill catch block
  describe('deleteUserCustomSkill catch block (L87)', () => {
    it('should throw with wrapped error when getById throws', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue(new Error('Lookup failed'));

      await expect(userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1'))
        .rejects.toThrow('Failed to delete user custom skill: Lookup failed');

      (userCustomSkillRepository as any).getById = origGetById;
    });

    it('should throw with wrapped error when delete throws', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      const origDelete = (userCustomSkillRepository as any).delete;
      (userCustomSkillRepository as any).getById = jest.fn().mockResolvedValue({ id: 's1', user_id: 'user-1' });
      (userCustomSkillRepository as any).delete = jest.fn().mockRejectedValue(new Error('Delete failed'));

      await expect(userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1'))
        .rejects.toThrow('Failed to delete user custom skill: Delete failed');

      (userCustomSkillRepository as any).getById = origGetById;
      (userCustomSkillRepository as any).delete = origDelete;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origGetById = (userCustomSkillRepository as any).getById;
      (userCustomSkillRepository as any).getById = jest.fn().mockRejectedValue('str err');

      await expect(userCustomSkillRepository.deleteUserCustomSkill('s1', 'user-1'))
        .rejects.toThrow('Failed to delete user custom skill');

      (userCustomSkillRepository as any).getById = origGetById;
    });
  });

  // L103: searchUserCustomSkills catch block
  describe('searchUserCustomSkills catch block (L103)', () => {
    it('should throw with wrapped error when listWithQueries throws', async () => {
      const origListWithQueries = (userCustomSkillRepository as any).listWithQueries;
      (userCustomSkillRepository as any).listWithQueries = jest.fn().mockRejectedValue(new Error('Search failed'));

      await expect(userCustomSkillRepository.searchUserCustomSkills('user-1', 'react'))
        .rejects.toThrow('Failed to search user custom skills: Search failed');

      (userCustomSkillRepository as any).listWithQueries = origListWithQueries;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origListWithQueries = (userCustomSkillRepository as any).listWithQueries;
      (userCustomSkillRepository as any).listWithQueries = jest.fn().mockRejectedValue('err');

      await expect(userCustomSkillRepository.searchUserCustomSkills('user-1', 'react'))
        .rejects.toThrow('Failed to search user custom skills');

      (userCustomSkillRepository as any).listWithQueries = origListWithQueries;
    });
  });
});

describe('SkillSuggestionRepository - Catch Block Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // L125: getSkillSuggestionByName catch block
  describe('getSkillSuggestionByName catch block (L125)', () => {
    it('should throw with wrapped error when findOne throws', async () => {
      const origFindOne = (skillSuggestionRepository as any).findOne;
      (skillSuggestionRepository as any).findOne = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(skillSuggestionRepository.getSkillSuggestionByName('Rust'))
        .rejects.toThrow('Failed to get skill suggestion: Query failed');

      (skillSuggestionRepository as any).findOne = origFindOne;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origFindOne = (skillSuggestionRepository as any).findOne;
      (skillSuggestionRepository as any).findOne = jest.fn().mockRejectedValue('err');

      await expect(skillSuggestionRepository.getSkillSuggestionByName('Rust'))
        .rejects.toThrow('Failed to get skill suggestion');

      (skillSuggestionRepository as any).findOne = origFindOne;
    });
  });

  // L135: incrementSkillSuggestionCount catch block
  describe('incrementSkillSuggestionCount catch block (L135)', () => {
    it('should throw with wrapped error when getById throws', async () => {
      const origGetById = (skillSuggestionRepository as any).getById;
      (skillSuggestionRepository as any).getById = jest.fn().mockRejectedValue(new Error('Lookup failed'));

      await expect(skillSuggestionRepository.incrementSkillSuggestionCount('sg1'))
        .rejects.toThrow('Failed to increment skill suggestion count: Lookup failed');

      (skillSuggestionRepository as any).getById = origGetById;
    });

    it('should throw with wrapped error when update throws', async () => {
      const origGetById = (skillSuggestionRepository as any).getById;
      const origUpdate = (skillSuggestionRepository as any).update;
      (skillSuggestionRepository as any).getById = jest.fn().mockResolvedValue({ id: 'sg1', times_requested: 5 });
      (skillSuggestionRepository as any).update = jest.fn().mockRejectedValue(new Error('Update failed'));

      await expect(skillSuggestionRepository.incrementSkillSuggestionCount('sg1'))
        .rejects.toThrow('Failed to increment skill suggestion count: Update failed');

      (skillSuggestionRepository as any).getById = origGetById;
      (skillSuggestionRepository as any).update = origUpdate;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origGetById = (skillSuggestionRepository as any).getById;
      (skillSuggestionRepository as any).getById = jest.fn().mockRejectedValue('str');

      await expect(skillSuggestionRepository.incrementSkillSuggestionCount('sg1'))
        .rejects.toThrow('Failed to increment skill suggestion count');

      (skillSuggestionRepository as any).getById = origGetById;
    });
  });

  // L146: getPendingSkillSuggestions catch block
  describe('getPendingSkillSuggestions catch block (L146)', () => {
    it('should throw with wrapped error when listWithQueries throws', async () => {
      const origListWithQueries = (skillSuggestionRepository as any).listWithQueries;
      (skillSuggestionRepository as any).listWithQueries = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(skillSuggestionRepository.getPendingSkillSuggestions())
        .rejects.toThrow('Failed to get pending skill suggestions: Query failed');

      (skillSuggestionRepository as any).listWithQueries = origListWithQueries;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origListWithQueries = (skillSuggestionRepository as any).listWithQueries;
      (skillSuggestionRepository as any).listWithQueries = jest.fn().mockRejectedValue('err');

      await expect(skillSuggestionRepository.getPendingSkillSuggestions())
        .rejects.toThrow('Failed to get pending skill suggestions');

      (skillSuggestionRepository as any).listWithQueries = origListWithQueries;
    });
  });

  // L157: updateSkillSuggestionStatus catch block
  describe('updateSkillSuggestionStatus catch block (L157)', () => {
    it('should throw with wrapped error when update throws', async () => {
      const origUpdate = (skillSuggestionRepository as any).update;
      (skillSuggestionRepository as any).update = jest.fn().mockRejectedValue(new Error('Update failed'));

      await expect(skillSuggestionRepository.updateSkillSuggestionStatus('sg1', 'approved'))
        .rejects.toThrow('Failed to update skill suggestion status: Update failed');

      (skillSuggestionRepository as any).update = origUpdate;
    });

    it('should throw with wrapped error for non-Error thrown', async () => {
      const origUpdate = (skillSuggestionRepository as any).update;
      (skillSuggestionRepository as any).update = jest.fn().mockRejectedValue('str');

      await expect(skillSuggestionRepository.updateSkillSuggestionStatus('sg1', 'approved'))
        .rejects.toThrow('Failed to update skill suggestion status');

      (skillSuggestionRepository as any).update = origUpdate;
    });
  });
});

describe('UserCustomSkillRepository - Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // L99: searchUserCustomSkills description match branch
  describe('searchUserCustomSkills - description match branch (L99)', () => {
    it('should match skills where description matches but name does not', async () => {
      const docs = [
        {
          $id: 's1',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          user_id: 'user-1',
          name: 'React',
          description: 'Frontend framework for building UIs',
        },
        {
          $id: 's2',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          user_id: 'user-1',
          name: 'Node.js',
          description: 'Backend JavaScript runtime',
        },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });

      // Search for 'frontend' - doesn't match 'React' name, but matches description
      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'frontend');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('s1');
      expect(result[0]!.name).toBe('React');
    });

    it('should match both name and description when both match', async () => {
      const docs = [
        {
          $id: 's1',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          user_id: 'user-1',
          name: 'React Frontend',
          description: 'A frontend framework',
        },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'frontend');

      expect(result).toHaveLength(1);
    });

    it('should return empty when neither name nor description matches', async () => {
      const docs = [
        {
          $id: 's1',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          user_id: 'user-1',
          name: 'Python',
          description: 'Programming language',
        },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'frontend');

      expect(result).toHaveLength(0);
    });

    it('should be case-insensitive for description matching', async () => {
      const docs = [
        {
          $id: 's1',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          user_id: 'user-1',
          name: 'React',
          description: 'FRONTEND Framework',
        },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });

      const result = await userCustomSkillRepository.searchUserCustomSkills('user-1', 'frontend');

      expect(result).toHaveLength(1);
    });
  });
});
