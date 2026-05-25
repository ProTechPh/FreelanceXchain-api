// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUserCustomSkills = jest.fn<any>();
const mockGetUserCustomSkillById = jest.fn<any>();
const mockCreateUserCustomSkillRepo = jest.fn<any>();
const mockUpdateUserCustomSkillRepo = jest.fn<any>();
const mockDeleteUserCustomSkillRepo = jest.fn<any>();
const mockSearchUserCustomSkillsRepo = jest.fn<any>();
const mockGetSkillSuggestionByName = jest.fn<any>();
const mockIncrementSkillSuggestionCount = jest.fn<any>();
const mockCreateSkillSuggestion = jest.fn<any>();
const mockGetPendingSkillSuggestions = jest.fn<any>();
const mockUpdateSkillSuggestionStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/user-custom-skill-repository.ts'), () => ({
  userCustomSkillRepository: {
    getUserCustomSkills: mockGetUserCustomSkills,
    getUserCustomSkillById: mockGetUserCustomSkillById,
    createUserCustomSkill: mockCreateUserCustomSkillRepo,
    updateUserCustomSkill: mockUpdateUserCustomSkillRepo,
    deleteUserCustomSkill: mockDeleteUserCustomSkillRepo,
    searchUserCustomSkills: mockSearchUserCustomSkillsRepo,
    getSkillSuggestionByName: mockGetSkillSuggestionByName,
    incrementSkillSuggestionCount: mockIncrementSkillSuggestionCount,
    createSkillSuggestion: mockCreateSkillSuggestion,
    getPendingSkillSuggestions: mockGetPendingSkillSuggestions,
    updateSkillSuggestionStatus: mockUpdateSkillSuggestionStatus,
  },
  UserCustomSkillEntity: {},
  SkillSuggestionEntity: {},
}));

const mockSearchSkills = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  searchSkills: mockSearchSkills,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('generated-id'),
}));

describe('User Custom Skill Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/user-custom-skill-service.js');
  };

  describe('createUserCustomSkill', () => {
    it('should create custom skill successfully', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([]);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'Custom Skill',
        description: 'A custom skill', years_of_experience: 3,
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Custom Skill',
        description: 'A custom skill',
        yearsOfExperience: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Custom Skill');
    });

    it('should create skill with category and suggest for global', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([]);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'New Skill',
        description: 'Desc', years_of_experience: 2, category_name: 'Web Dev',
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockResolvedValueOnce(null);
      mockCreateSkillSuggestion.mockResolvedValueOnce(undefined);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'New Skill',
        description: 'Desc',
        yearsOfExperience: 2,
        categoryName: 'Web Dev',
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      expect(mockCreateSkillSuggestion).toHaveBeenCalled();
    });

    it('should increment suggestion count if suggestion already exists', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([]);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'Existing Suggestion',
        description: 'Desc', years_of_experience: 1,
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockResolvedValueOnce({ id: 'suggestion-1', times_requested: 2 });
      mockIncrementSkillSuggestionCount.mockResolvedValueOnce(undefined);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Existing Suggestion',
        description: 'Desc',
        yearsOfExperience: 1,
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      expect(mockIncrementSkillSuggestionCount).toHaveBeenCalledWith('suggestion-1');
    });

    it('should fail when skill exists in global taxonomy', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([
        { id: 'skill-1', name: 'React', categoryName: 'Frontend' },
      ]);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'React',
        description: 'React framework',
        yearsOfExperience: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_EXISTS_GLOBALLY');
    });

    it('should fail when user already has duplicate custom skill', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([]);
      mockGetUserCustomSkills.mockResolvedValueOnce([
        { id: 'existing-1', name: 'My Skill', user_id: 'user-1' },
      ]);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'My Skill',
        description: 'Duplicate',
        yearsOfExperience: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
    });

    it('should handle repository errors', async () => {
      const { createUserCustomSkill } = await importModule();

      mockSearchSkills.mockResolvedValueOnce([]);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      mockCreateUserCustomSkillRepo.mockRejectedValueOnce(new Error('DB error'));

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'New Skill',
        description: 'Desc',
        yearsOfExperience: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CREATE_FAILED');
    });
  });

  describe('getUserCustomSkills', () => {
    it('should return mapped custom skills', async () => {
      const { getUserCustomSkills } = await importModule();

      mockGetUserCustomSkills.mockResolvedValueOnce([
        { id: 'cs-1', user_id: 'user-1', name: 'Skill 1', description: 'Desc', years_of_experience: 2, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getUserCustomSkills('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cs-1');
      expect(result[0].userId).toBe('user-1');
      expect(result[0].name).toBe('Skill 1');
    });

    it('should return empty array when no skills', async () => {
      const { getUserCustomSkills } = await importModule();

      mockGetUserCustomSkills.mockResolvedValueOnce([]);

      const result = await getUserCustomSkills('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getUserCustomSkillById', () => {
    it('should return skill when found', async () => {
      const { getUserCustomSkillById } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill', description: 'Desc',
        years_of_experience: 2, is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await getUserCustomSkillById('cs-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('cs-1');
    });

    it('should return error when not found', async () => {
      const { getUserCustomSkillById } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce(null);

      const result = await getUserCustomSkillById('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });
  });

  describe('updateUserCustomSkill', () => {
    it('should update skill successfully', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Old Name', description: 'Old',
        years_of_experience: 1, is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      // getUserCustomSkills for duplicate check (since name is changing)
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      mockUpdateUserCustomSkillRepo.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'New Name', description: 'New',
        years_of_experience: 3, is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateUserCustomSkill('cs-1', 'user-1', {
        name: 'New Name',
        description: 'New',
        yearsOfExperience: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Name');
    });

    it('should fail when skill not found', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce(null);

      const result = await updateUserCustomSkill('nonexistent', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('should fail when renaming to duplicate name', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill A',
      });
      mockGetUserCustomSkills.mockResolvedValueOnce([
        { id: 'cs-2', name: 'Skill B', user_id: 'user-1' },
      ]);

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'Skill B' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
    });

    it('should handle update failure from repository', async () => {
      const { updateUserCustomSkill } = await importModule();

      // Clear and set up fresh mocks
      mockGetUserCustomSkillById.mockReset();
      mockUpdateUserCustomSkillRepo.mockReset();
      mockGetUserCustomSkills.mockReset();
      
      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
        description: 'Old', years_of_experience: 1,
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      // Name is changing, so duplicate check happens
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      mockUpdateUserCustomSkillRepo.mockResolvedValueOnce(null);

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'Different Name' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should handle repository errors', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
      });
      mockUpdateUserCustomSkillRepo.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateUserCustomSkill('cs-1', 'user-1', { description: 'Updated' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('deleteUserCustomSkill', () => {
    it('should delete skill successfully', async () => {
      const { deleteUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
      });
      mockDeleteUserCustomSkillRepo.mockResolvedValueOnce(undefined);

      const result = await deleteUserCustomSkill('cs-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should fail when skill not found', async () => {
      const { deleteUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce(null);

      const result = await deleteUserCustomSkill('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('should handle repository errors', async () => {
      const { deleteUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
      });
      mockDeleteUserCustomSkillRepo.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteUserCustomSkill('cs-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DELETE_FAILED');
    });
  });

  describe('searchUserCustomSkills', () => {
    it('should return matching skills', async () => {
      const { searchUserCustomSkills } = await importModule();

      mockSearchUserCustomSkillsRepo.mockResolvedValueOnce([
        { id: 'cs-1', user_id: 'user-1', name: 'React Native', description: 'Mobile', years_of_experience: 2, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await searchUserCustomSkills('user-1', 'React');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('React Native');
    });
  });

  describe('getPendingSkillSuggestions', () => {
    it('should return pending suggestions', async () => {
      const { getPendingSkillSuggestions } = await importModule();

      mockGetPendingSkillSuggestions.mockResolvedValueOnce([
        { id: 'sug-1', user_id: 'user-1', skill_name: 'New Skill', skill_description: 'Desc', suggested_by: 'User', times_requested: 3, status: 'pending', created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getPendingSkillSuggestions();

      expect(result).toHaveLength(1);
      expect(result[0].skillName).toBe('New Skill');
    });
  });

  describe('updateSkillSuggestionStatus', () => {
    it('should approve suggestion', async () => {
      const { updateSkillSuggestionStatus } = await importModule();

      mockUpdateSkillSuggestionStatus.mockResolvedValueOnce({
        id: 'sug-1', user_id: 'user-1', skill_name: 'Skill', skill_description: 'Desc',
        suggested_by: 'User', times_requested: 1, status: 'approved',
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateSkillSuggestionStatus('sug-1', 'approved');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('approved');
    });

    it('should reject suggestion', async () => {
      const { updateSkillSuggestionStatus } = await importModule();

      mockUpdateSkillSuggestionStatus.mockResolvedValueOnce({
        id: 'sug-1', user_id: 'user-1', skill_name: 'Skill', skill_description: 'Desc',
        suggested_by: 'User', times_requested: 1, status: 'rejected',
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateSkillSuggestionStatus('sug-1', 'rejected');

      expect(result.success).toBe(true);
    });

    it('should fail when suggestion not found', async () => {
      const { updateSkillSuggestionStatus } = await importModule();

      mockUpdateSkillSuggestionStatus.mockResolvedValueOnce(null);

      const result = await updateSkillSuggestionStatus('nonexistent', 'approved');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUGGESTION_NOT_FOUND');
    });

    it('should handle repository errors', async () => {
      const { updateSkillSuggestionStatus } = await importModule();

      mockUpdateSkillSuggestionStatus.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateSkillSuggestionStatus('sug-1', 'approved');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});
