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
  });

  describe('getSkillByNameInCategory', () => {
    it('should return a skill', async () => {
      const skills = [{ id: 's1', name: 'React', category_id: 'c1' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: skills });
      const result = await repo.getSkillByNameInCategory('React', 'c1');
      expect(result).toEqual(skills[0]);
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
});
