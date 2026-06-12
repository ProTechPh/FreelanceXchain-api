import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockQuery = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

const { UserCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.js');

describe('UserCustomSkillRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    repo = new UserCustomSkillRepository();
  });

  describe('createUserCustomSkill', () => {
    it('should create and return a user custom skill', async () => {
      const mockSkill = { id: 'skill-1', user_id: 'user-1', name: 'React', description: 'Frontend', years_of_experience: 2, is_approved: false, suggested_for_global: false };
      mockQuery.mockResolvedValueOnce({ rows: [mockSkill], rowCount: 1 });
      const result = await repo.createUserCustomSkill(mockSkill as any);
      expect(result).toEqual(mockSkill);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createUserCustomSkill({ id: 'skill-1' } as any)).rejects.toThrow('Failed to create user custom skill');
    });
  });

  describe('getUserCustomSkills', () => {
    it('should return skills for a user', async () => {
      const skills = [{ id: 's1' }, { id: 's2' }];
      mockQuery.mockResolvedValueOnce({ rows: skills, rowCount: 2 });
      const result = await repo.getUserCustomSkills('user-1');
      expect(result).toEqual(skills);
    });

    it('should return empty array when no skills found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getUserCustomSkills('user-1');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getUserCustomSkills('user-1')).rejects.toThrow('Failed to get user custom skills');
    });
  });

  describe('getUserCustomSkillById', () => {
    it('should return a skill by id', async () => {
      const skill = { id: 's1', user_id: 'user-1' };
      mockQuery.mockResolvedValueOnce({ rows: [skill], rowCount: 1 });
      const result = await repo.getUserCustomSkillById('s1', 'user-1');
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getUserCustomSkillById('s1', 'user-1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getUserCustomSkillById('s1', 'user-1')).rejects.toThrow('Failed to get user custom skill');
    });
  });

  describe('updateUserCustomSkill', () => {
    it('should update and return the skill', async () => {
      const skill = { id: 's1', user_id: 'user-1', name: 'Updated' };
      mockQuery.mockResolvedValueOnce({ rows: [skill], rowCount: 1 });
      const result = await repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' })).rejects.toThrow('Failed to update user custom skill');
    });
  });

  describe('deleteUserCustomSkill', () => {
    it('should delete and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 's1' }], rowCount: 1 });
      const result = await repo.deleteUserCustomSkill('s1', 'user-1');
      expect(result).toBe(true);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('delete failed'));
      await expect(repo.deleteUserCustomSkill('s1', 'user-1')).rejects.toThrow('Failed to delete user custom skill');
    });
  });

  describe('searchUserCustomSkills', () => {
    it('should return matching skills', async () => {
      const skills = [{ id: 's1', name: 'React' }];
      mockQuery.mockResolvedValueOnce({ rows: skills, rowCount: 1 });
      const result = await repo.searchUserCustomSkills('user-1', 'react');
      expect(result).toEqual(skills);
    });

    it('should return empty array on no matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.searchUserCustomSkills('user-1', 'xyz');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('search failed'));
      await expect(repo.searchUserCustomSkills('user-1', 'react')).rejects.toThrow('Failed to search user custom skills');
    });
  });

  describe('createSkillSuggestion', () => {
    it('should create and return a suggestion', async () => {
      const suggestion = { id: 'sg1', skill_name: 'Rust' };
      mockQuery.mockResolvedValueOnce({ rows: [suggestion], rowCount: 1 });
      const result = await repo.createSkillSuggestion(suggestion as any);
      expect(result).toEqual(suggestion);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createSkillSuggestion({ id: 'sg1' } as any)).rejects.toThrow('Failed to create skill suggestion');
    });
  });

  describe('getSkillSuggestionByName', () => {
    it('should return a suggestion by name', async () => {
      const suggestion = { id: 'sg1', skill_name: 'Rust' };
      mockQuery.mockResolvedValueOnce({ rows: [suggestion], rowCount: 1 });
      const result = await repo.getSkillSuggestionByName('Rust');
      expect(result).toEqual(suggestion);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getSkillSuggestionByName('Rust');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getSkillSuggestionByName('Rust')).rejects.toThrow('Failed to get skill suggestion');
    });
  });

  describe('incrementSkillSuggestionCount', () => {
    it('should increment and return updated suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'sg1', times_requested: 6 }], rowCount: 1 });
      const result = await repo.incrementSkillSuggestionCount('sg1');
      expect(result).toEqual({ id: 'sg1', times_requested: 6 });
    });

    it('should throw when update fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.incrementSkillSuggestionCount('sg1')).rejects.toThrow('Failed to increment skill suggestion count');
    });
  });

  describe('getPendingSkillSuggestions', () => {
    it('should return pending suggestions', async () => {
      const suggestions = [{ id: 'sg1', status: 'pending' }];
      mockQuery.mockResolvedValueOnce({ rows: suggestions, rowCount: 1 });
      const result = await repo.getPendingSkillSuggestions();
      expect(result).toEqual(suggestions);
    });

    it('should return empty array when none pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getPendingSkillSuggestions();
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getPendingSkillSuggestions()).rejects.toThrow('Failed to get pending skill suggestions');
    });
  });

  describe('updateSkillSuggestionStatus', () => {
    it('should update and return the suggestion', async () => {
      const suggestion = { id: 'sg1', status: 'approved' };
      mockQuery.mockResolvedValueOnce({ rows: [suggestion], rowCount: 1 });
      const result = await repo.updateSkillSuggestionStatus('sg1', 'approved');
      expect(result).toEqual(suggestion);
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.updateSkillSuggestionStatus('sg1', 'approved')).rejects.toThrow('Failed to update skill suggestion status');
    });
  });
});
