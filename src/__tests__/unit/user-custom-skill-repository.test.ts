import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { UserCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.js');

describe('UserCustomSkillRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new UserCustomSkillRepository();
  });

  describe('createUserCustomSkill', () => {
    it('should create and return a user custom skill', async () => {
      const mockSkill = { id: 'skill-1', user_id: 'user-1', name: 'React', description: 'Frontend', years_of_experience: 2, is_approved: false, suggested_for_global: false };
      mockAppwriteResult({ data: mockSkill });
      const result = await repo.createUserCustomSkill(mockSkill as any);
      expect(result).toEqual(mockSkill);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createUserCustomSkill({ id: 'skill-1' } as any)).rejects.toThrow('Failed to create user custom skill');
    });
  });

  describe('getUserCustomSkills', () => {
    it('should return skills for a user', async () => {
      const skills = [{ id: 's1' }, { id: 's2' }];
      mockAppwriteResult({ data: skills });
      const result = await repo.getUserCustomSkills('user-1');
      expect(result).toEqual(skills);
    });

    it('should return empty array when no skills found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getUserCustomSkills('user-1');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getUserCustomSkills('user-1')).rejects.toThrow('Failed to get user custom skills');
    });
  });

  describe('getUserCustomSkillById', () => {
    it('should return a skill by id', async () => {
      const skill = { id: 's1', user_id: 'user-1' };
      mockAppwriteResult({ data: skill });
      const result = await repo.getUserCustomSkillById('s1', 'user-1');
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getUserCustomSkillById('s1', 'user-1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'db error' } });
      await expect(repo.getUserCustomSkillById('s1', 'user-1')).rejects.toThrow('Failed to get user custom skill');
    });
  });

  describe('updateUserCustomSkill', () => {
    it('should update and return the skill', async () => {
      const skill = { id: 's1', user_id: 'user-1', name: 'Updated' };
      mockAppwriteResult({ data: skill });
      const result = await repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toEqual(skill);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'update failed' } });
      await expect(repo.updateUserCustomSkill('s1', 'user-1', { name: 'Updated' })).rejects.toThrow('Failed to update user custom skill');
    });
  });

  describe('deleteUserCustomSkill', () => {
    it('should delete and return true', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 's1' }], rowCount: 1 });
      const result = await repo.deleteUserCustomSkill('s1', 'user-1');
      expect(result).toBe(true);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('delete failed'));
      await expect(repo.deleteUserCustomSkill('s1', 'user-1')).rejects.toThrow('Failed to delete user custom skill');
    });
  });

  describe('searchUserCustomSkills', () => {
    it('should return matching skills', async () => {
      const skills = [{ id: 's1', name: 'React' }];
      mockAppwriteResult({ data: skills });
      const result = await repo.searchUserCustomSkills('user-1', 'react');
      expect(result).toEqual(skills);
    });

    it('should return empty array on no matches', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.searchUserCustomSkills('user-1', 'xyz');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'search failed' } });
      await expect(repo.searchUserCustomSkills('user-1', 'react')).rejects.toThrow('Failed to search user custom skills');
    });
  });

  describe('createSkillSuggestion', () => {
    it('should create and return a suggestion', async () => {
      const suggestion = { id: 'sg1', skill_name: 'Rust' };
      mockAppwriteResult({ data: suggestion });
      const result = await repo.createSkillSuggestion(suggestion as any);
      expect(result).toEqual(suggestion);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createSkillSuggestion({ id: 'sg1' } as any)).rejects.toThrow('Failed to create skill suggestion');
    });
  });

  describe('getSkillSuggestionByName', () => {
    it('should return a suggestion by name', async () => {
      const suggestion = { id: 'sg1', skill_name: 'Rust' };
      mockAppwriteResult({ data: suggestion });
      const result = await repo.getSkillSuggestionByName('Rust');
      expect(result).toEqual(suggestion);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getSkillSuggestionByName('Rust');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'db error' } });
      await expect(repo.getSkillSuggestionByName('Rust')).rejects.toThrow('Failed to get skill suggestion');
    });
  });

  describe('incrementSkillSuggestionCount', () => {
    it('should increment and return updated suggestion', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'sg1', times_requested: 6 }], rowCount: 1 });
      const result = await repo.incrementSkillSuggestionCount('sg1');
      expect(result).toEqual({ id: 'sg1', times_requested: 6 });
    });

    it('should throw when update fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.incrementSkillSuggestionCount('sg1')).rejects.toThrow('Failed to increment skill suggestion count');
    });
  });

  describe('getPendingSkillSuggestions', () => {
    it('should return pending suggestions', async () => {
      const suggestions = [{ id: 'sg1', status: 'pending' }];
      mockAppwriteResult({ data: suggestions });
      const result = await repo.getPendingSkillSuggestions();
      expect(result).toEqual(suggestions);
    });

    it('should return empty array when none pending', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getPendingSkillSuggestions();
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getPendingSkillSuggestions()).rejects.toThrow('Failed to get pending skill suggestions');
    });
  });

  describe('updateSkillSuggestionStatus', () => {
    it('should update and return the suggestion', async () => {
      const suggestion = { id: 'sg1', status: 'approved' };
      mockAppwriteResult({ data: suggestion });
      const result = await repo.updateSkillSuggestionStatus('sg1', 'approved');
      expect(result).toEqual(suggestion);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'update failed' } });
      await expect(repo.updateSkillSuggestionStatus('sg1', 'approved')).rejects.toThrow('Failed to update skill suggestion status');
    });
  });
});