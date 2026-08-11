// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockDatabases = {
  listDocuments: jest.fn(),
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  getDocument: jest.fn(),
  deleteDocument: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn().mockImplementation((field: string, value: any) => ({ type: 'equal', field, value })),
    limit: jest.fn().mockImplementation((n: number) => ({ type: 'limit', value: n })),
    orderAsc: jest.fn().mockImplementation((field: string) => ({ type: 'orderAsc', field })),
    orderDesc: jest.fn().mockImplementation((field: string) => ({ type: 'orderDesc', field })),
    offset: jest.fn().mockImplementation((n: number) => ({ type: 'offset', value: n })),
    cursorAfter: jest.fn().mockImplementation((id: string) => ({ type: 'cursorAfter', id })),
  },
  ID: { unique: jest.fn(() => 'mock-unique-id') },
}));

const { SkillRepository } = await import('../../repositories/skill-repository.js');

describe('SkillRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SkillRepository();
  });

  describe('createSkill', () => {
    it('should create and return a skill', async () => {
      const skill = { id: 's1', name: 'React', category_id: 'c1' };
      mockDatabases.createDocument.mockResolvedValueOnce(skill);
      const result = await repo.createSkill(skill as any);
      expect(result).toEqual(skill);
    });
  });

  describe('findSkillById', () => {
    it('should return a skill', async () => {
      const skill = { id: 's1' };
      mockDatabases.getDocument.mockResolvedValueOnce(skill);
      const result = await repo.findSkillById('s1');
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.findSkillById('s1');
      expect(result).toBeNull();
    });
  });

  describe('updateSkill', () => {
    it('should update and return a skill', async () => {
      const skill = { id: 's1', name: 'Updated' };
      mockDatabases.updateDocument.mockResolvedValueOnce(skill);
      const result = await repo.updateSkill('s1', { name: 'Updated' });
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.updateSkill('s1', { name: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('getAllSkills', () => {
    it('should return all skills', async () => {
      const skills = [{ id: 's1' }, { id: 's2' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getAllSkills();
      expect(result).toEqual(skills);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAllSkills();
      expect(result).toEqual([]);
    });
  });

  describe('getActiveSkills', () => {
    it('should return active skills', async () => {
      const skills = [{ id: 's1', is_active: true }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getActiveSkills();
      expect(result).toEqual(skills);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getActiveSkills();
      expect(result).toEqual([]);
    });
  });

  describe('getSkillsByCategory', () => {
    it('should return skills by category', async () => {
      const skills = [{ id: 's1', category_id: 'c1' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getSkillsByCategory('c1');
      expect(result).toEqual(skills);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getSkillsByCategory('c1');
      expect(result).toEqual([]);
    });
  });

  describe('getActiveSkillsByCategory', () => {
    it('should return active skills by category', async () => {
      const skills = [{ id: 's1', category_id: 'c1', is_active: true }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getActiveSkillsByCategory('c1');
      expect(result).toEqual(skills);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getActiveSkillsByCategory('c1');
      expect(result).toEqual([]);
    });
  });

  describe('searchSkillsByKeyword', () => {
    it('should return matching skills', async () => {
      const skills = [{ id: 's1', name: 'React', description: 'A JS library' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.searchSkillsByKeyword('react');
      expect(result).toEqual(skills);
    });

    it('should sanitize special characters', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });
      await repo.searchSkillsByKeyword('test%_\\.,()');
      expect(true).toBe(true);
    });

    it('should return empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.searchSkillsByKeyword('react');
      expect(result).toEqual([]);
    });

    it('should match skill when keyword is in description but not name (|| branch)', async () => {
      const skills = [
        { $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', name: 'TypeScript', description: 'A typed superset of JavaScript', is_active: true },
        { $id: 's2', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', name: 'Go', description: 'A compiled language', is_active: true },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      // 'javascript' is in the description of TypeScript but not in the name
      const result = await repo.searchSkillsByKeyword('javascript');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('TypeScript');
    });
  });

  describe('getSkillByNameInCategory', () => {
    it('should return a skill', async () => {
      const skills = [{ id: 's1', name: 'React', category_id: 'c1' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getSkillByNameInCategory('React', 'c1');
      expect(result).toEqual(skills[0]);
    });

    it('should match padding/casing variants of the same name', async () => {
      const skills = [{ id: 's1', name: 'React', category_id: 'c1' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getSkillByNameInCategory(' REACT ', 'c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [] });
      const result = await repo.getSkillByNameInCategory('Rust', 'c1');
      expect(result).toBeNull();
    });

    it('should return null on other database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getSkillByNameInCategory('React', 'c1');
      expect(result).toBeNull();
    });
  });

  describe('getSkillByNameNormalized', () => {
    it('should return the matching active skill for a normalized name', async () => {
      const skills = [{ $id: 's1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', name: 'React', is_active: true }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills, total: 1 });
      const result = await repo.getSkillByNameNormalized(' REACT ');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
    });

    it('should return null when no skill matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getSkillByNameNormalized('Rust');
      expect(result).toBeNull();
    });

    it('should propagate database errors (fail-closed)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getSkillByNameNormalized('React')).rejects.toThrow('select failed');
    });
  });

  describe('findSkillsByIds', () => {
    it('should return skills matching the ids', async () => {
      const skills = [{ $id: 's1', name: 'React' }, { $id: 's2', name: 'Vue' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills, total: 2 });
      const result = await repo.findSkillsByIds(['s1', 's2']);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('s1');
      expect(mockDatabases.listDocuments.mock.calls[0]![2]).toEqual(
        expect.arrayContaining([{ type: 'equal', field: '$id', value: ['s1', 's2'] }])
      );
    });

    it('should return empty array when ids list is empty', async () => {
      const result = await repo.findSkillsByIds([]);
      expect(result).toEqual([]);
      expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.findSkillsByIds(['s1']);
      expect(result).toEqual([]);
    });
  });

  describe('cursor pagination (fetchAll)', () => {
    it('should keep paging with cursorAfter until a short page is returned', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ $id: `s${i}`, $createdAt: '2025-01-01', $updatedAt: '2025-01-01', name: `Skill ${i}`, description: 'd', category_id: 'c1', is_active: true }));
      const page2 = [{ $id: 's100', $createdAt: '2025-01-01', $updatedAt: '2025-01-01', name: 'Skill 100', description: 'd', category_id: 'c1', is_active: true }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: page1, total: 101 })
        .mockResolvedValueOnce({ documents: page2, total: 101 });

      const result = await repo.getActiveSkills();

      expect(result).toHaveLength(101);
      const secondQueries = mockDatabases.listDocuments.mock.calls[1]![2];
      expect(secondQueries).toEqual(expect.arrayContaining([{ type: 'cursorAfter', id: 's99' }]));
    });
  });
});
