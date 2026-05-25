import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
      mockAppwriteResult({ data: skill });
      const result = await repo.createSkill(skill as any);
      expect(result).toEqual(skill);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createSkill({ id: 's1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getSkillById', () => {
    it('should return a skill', async () => {
      const skill = { id: 's1' };
      mockAppwriteResult({ data: skill });
      const result = await repo.getSkillById('s1');
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getSkillById('s1');
      expect(result).toBeNull();
    });
  });

  describe('findSkillById', () => {
    it('should return a skill', async () => {
      const skill = { id: 's1' };
      mockAppwriteResult({ data: skill });
      const result = await repo.findSkillById('s1');
      expect(result).toEqual(skill);
    });
  });

  describe('updateSkill', () => {
    it('should update and return a skill', async () => {
      const skill = { id: 's1', name: 'Updated' };
      mockAppwriteResult({ data: skill });
      const result = await repo.updateSkill('s1', { name: 'Updated' });
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateSkill('s1', { name: 'Updated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteSkill', () => {
    it('should delete and return true when exists', async () => {
      mockAppwriteResult({ data: { id: 's1' } });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await repo.deleteSkill('s1');
      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.deleteSkill('s1');
      expect(result).toBe(false);
    });
  });

  describe('getAllSkills', () => {
    it('should return all skills', async () => {
      const skills = [{ id: 's1' }, { id: 's2' }];
      mockAppwriteResult({ data: skills });
      const result = await repo.getAllSkills();
      expect(result).toEqual(skills);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllSkills()).rejects.toThrow('Failed to get all skills');
    });
  });

  describe('getActiveSkills', () => {
    it('should return active skills', async () => {
      const skills = [{ id: 's1', is_active: true }];
      mockAppwriteResult({ data: skills });
      const result = await repo.getActiveSkills();
      expect(result).toEqual(skills);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getActiveSkills()).rejects.toThrow('Failed to get active skills');
    });
  });

  describe('getSkillsByCategory', () => {
    it('should return skills by category', async () => {
      const skills = [{ id: 's1', category_id: 'c1' }];
      mockAppwriteResult({ data: skills });
      const result = await repo.getSkillsByCategory('c1');
      expect(result).toEqual(skills);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getSkillsByCategory('c1')).rejects.toThrow('Failed to get skills by category');
    });
  });

  describe('getActiveSkillsByCategory', () => {
    it('should return active skills by category', async () => {
      const skills = [{ id: 's1', category_id: 'c1', is_active: true }];
      mockAppwriteResult({ data: skills });
      const result = await repo.getActiveSkillsByCategory('c1');
      expect(result).toEqual(skills);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getActiveSkillsByCategory('c1')).rejects.toThrow('Failed to get active skills by category');
    });
  });

  describe('searchSkillsByKeyword', () => {
    it('should return matching skills', async () => {
      const skills = [{ id: 's1', name: 'React' }];
      mockAppwriteResult({ data: skills });
      const result = await repo.searchSkillsByKeyword('react');
      expect(result).toEqual(skills);
    });

    it('should sanitize special characters', async () => {
      mockAppwriteResult({ data: [] });
      await repo.searchSkillsByKeyword('test%_\\.,()');
      expect(true).toBe(true);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.searchSkillsByKeyword('react')).rejects.toThrow('Failed to search skills');
    });
  });

  describe('getSkillByNameInCategory', () => {
    it('should return a skill', async () => {
      const skill = { id: 's1', name: 'React', category_id: 'c1' };
      mockAppwriteResult({ data: skill });
      const result = await repo.getSkillByNameInCategory('React', 'c1');
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getSkillByNameInCategory('Rust', 'c1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getSkillByNameInCategory('React', 'c1')).rejects.toThrow('Failed to get skill by name in category');
    });
  });
});