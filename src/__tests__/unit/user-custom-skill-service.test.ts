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
const mockRecordSuggestionRequest = jest.fn<any>();
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
  },
  skillSuggestionRepository: {
    getSkillSuggestionByName: mockGetSkillSuggestionByName,
    recordSuggestionRequest: mockRecordSuggestionRequest,
    createSkillSuggestion: mockCreateSkillSuggestion,
    getPendingSkillSuggestions: mockGetPendingSkillSuggestions,
    updateSkillSuggestionStatus: mockUpdateSkillSuggestionStatus,
  },
  UserCustomSkillEntity: {},
  SkillSuggestionEntity: {},
}));

const mockGetSkillByNameNormalized = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: {
    getSkillByNameNormalized: mockGetSkillByNameNormalized,
  },
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

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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

    it('should suggest for global without category name', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'Skill No Category',
        description: 'Desc', years_of_experience: 1,
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockResolvedValueOnce(null);
      mockCreateSkillSuggestion.mockResolvedValueOnce(undefined);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Skill No Category',
        description: 'Desc',
        yearsOfExperience: 1,
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      expect(mockCreateSkillSuggestion).toHaveBeenCalledTimes(1);
      const suggestionArg = mockCreateSkillSuggestion.mock.calls[0][0];
      expect(suggestionArg.skill_name).toBe('Skill No Category');
      expect(suggestionArg).not.toHaveProperty('category_name');
    });

    // BLF-skill.3: a repeat request from the SAME user must NOT inflate the
    // suggestion counter. The repository's recordSuggestionRequest performs the
    // per-user dedup; the service must always route through it with the userId.
    it('should record a suggestion request when the suggestion already exists', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'Existing Suggestion',
        description: 'Desc', years_of_experience: 1,
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockResolvedValueOnce({ id: 'suggestion-1', times_requested: 2 });
      mockRecordSuggestionRequest.mockResolvedValueOnce(undefined);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Existing Suggestion',
        description: 'Desc',
        yearsOfExperience: 1,
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      // The userId is passed so the repo can dedup per user (anti-spam).
      expect(mockRecordSuggestionRequest).toHaveBeenCalledWith('suggestion-1', 'user-1');
      expect(mockCreateSkillSuggestion).not.toHaveBeenCalled();
    });

    // BLF-skill.3: creating a fresh suggestion seeds requester_ids with the creator.
    it('should seed requester_ids when creating a new suggestion', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'Brand New Skill',
        description: 'Desc', years_of_experience: 1,
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockResolvedValueOnce(null);
      mockCreateSkillSuggestion.mockResolvedValueOnce(undefined);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Brand New Skill',
        description: 'Desc',
        yearsOfExperience: 1,
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      expect(mockCreateSkillSuggestion).toHaveBeenCalledTimes(1);
      const suggestionArg = mockCreateSkillSuggestion.mock.calls[0][0];
      expect(suggestionArg.times_requested).toBe(1);
      expect(suggestionArg.requester_ids).toEqual(['user-1']);
      expect(mockRecordSuggestionRequest).not.toHaveBeenCalled();
    });

    it('should fail when skill exists in global taxonomy', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce({
        id: 'skill-1', category_id: 'c1', name: 'React', is_active: true,
      });

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

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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

    it('should block a padded variant of a global skill (whitespace bypass)', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce({
        id: 'skill-1', category_id: 'c1', name: 'React', is_active: true,
      });

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: '  React  ',
        description: 'Frontend framework',
        yearsOfExperience: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_EXISTS_GLOBALLY');
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
    });

    it('should block a padded duplicate of the user\'s own custom skill', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([
        { id: 'existing-1', name: 'My Skill', user_id: 'user-1' },
      ]);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: ' MY SKILL ',
        description: 'Duplicate',
        yearsOfExperience: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
    });

    it('should enforce the per-user custom skill cap', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      const existing = Array.from({ length: 50 }, (_, i) => ({
        id: `existing-${i}`, name: `Skill ${i}`, user_id: 'user-1',
      }));
      mockGetUserCustomSkills.mockResolvedValueOnce(existing);

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'Brand New Skill',
        description: 'A brand new skill',
        yearsOfExperience: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TOO_MANY_CUSTOM_SKILLS');
      expect(mockCreateUserCustomSkillRepo).not.toHaveBeenCalled();
    });

    it('should fail when fetching existing custom skills errors', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockRejectedValueOnce(new Error('DB down'));

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'New Skill',
        description: 'Desc',
        yearsOfExperience: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CREATE_FAILED');
    });

    it('should fail closed when the global-taxonomy check errors', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockRejectedValueOnce(new Error('DB down'));

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'React',
        description: 'Frontend framework',
        yearsOfExperience: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CREATE_FAILED');
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
      expect(mockCreateUserCustomSkillRepo).not.toHaveBeenCalled();
    });

    it('should still succeed when the skill suggestion fails (skill already committed)', async () => {
      const { createUserCustomSkill } = await importModule();

      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([]);
      const created = {
        id: 'generated-id', user_id: 'user-1', name: 'New Skill',
        description: 'Desc', years_of_experience: 2,
        is_approved: false, suggested_for_global: true,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockCreateUserCustomSkillRepo.mockResolvedValueOnce(created);
      mockGetSkillSuggestionByName.mockRejectedValueOnce(new Error('suggestion lookup failed'));

      const result = await createUserCustomSkill('user-1', 'Test User', {
        name: 'New Skill',
        description: 'Desc',
        yearsOfExperience: 2,
        suggestForGlobal: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Skill');
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
      // getSkillByNameNormalized for the global-taxonomy check (since name is changing)
      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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
      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockResolvedValueOnce([
        { id: 'cs-2', name: 'Skill B', user_id: 'user-1' },
      ]);

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'Skill B' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
    });

    it('should fail when renaming to a name that exists in the global taxonomy', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'ReactJS',
      });
      mockGetSkillByNameNormalized.mockResolvedValueOnce({
        id: 'skill-1', category_id: 'c1', name: 'React', is_active: true,
      });

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'React' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_EXISTS_GLOBALLY');
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
    });

    it('should return UPDATE_FAILED when the duplicate check fetch errors', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill A',
      });
      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
      mockGetUserCustomSkills.mockRejectedValueOnce(new Error('DB down'));

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'Skill B' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
      expect(mockUpdateUserCustomSkillRepo).not.toHaveBeenCalled();
    });

    it('should fail closed when the global-taxonomy check errors on rename', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill A',
      });
      mockGetSkillByNameNormalized.mockRejectedValueOnce(new Error('DB down'));

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'Skill B' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
      expect(mockUpdateUserCustomSkillRepo).not.toHaveBeenCalled();
    });

    it('should allow a case-only rename without duplicate checks', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'React', description: 'UI',
        years_of_experience: 2, is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUpdateUserCustomSkillRepo.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'REACT', description: 'UI',
        years_of_experience: 2, is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateUserCustomSkill('cs-1', 'user-1', { name: 'REACT' });

      expect(result.success).toBe(true);
      expect(mockGetSkillByNameNormalized).not.toHaveBeenCalled();
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
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
      // Name is changing, so global + duplicate checks happen
      mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
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

    it('should skip duplicate check when name unchanged', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Same Name',
        description: 'Old', years_of_experience: 1,
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUpdateUserCustomSkillRepo.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Same Name',
        description: 'Updated', years_of_experience: 1,
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateUserCustomSkill('cs-1', 'user-1', { description: 'Updated' });

      expect(result.success).toBe(true);
      expect(mockGetUserCustomSkills).not.toHaveBeenCalled();
    });

    it('should update category name', async () => {
      const { updateUserCustomSkill } = await importModule();

      mockGetUserCustomSkillById.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
        description: 'Desc', years_of_experience: 1,
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUpdateUserCustomSkillRepo.mockResolvedValueOnce({
        id: 'cs-1', user_id: 'user-1', name: 'Skill',
        description: 'Desc', years_of_experience: 1,
        category_name: 'New Category',
        is_approved: false, suggested_for_global: false,
        created_at: '2025-01-01', updated_at: '2025-01-02',
      });

      const result = await updateUserCustomSkill('cs-1', 'user-1', { categoryName: 'New Category' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categoryName).toBe('New Category');
      }
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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('User Custom Skill Service - Direct Branch Coverage', () => {
  const importModule = async () => import('../../services/user-custom-skill-service.js');

  it('should return error when skill exists globally', async () => {
    const { createUserCustomSkill } = await importModule();
    mockGetSkillByNameNormalized.mockResolvedValueOnce({
      id: 's1', name: 'React', category_id: 'c1', is_active: true,
    });

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'React', description: 'Frontend framework', yearsOfExperience: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('SKILL_EXISTS_GLOBALLY');
  });

  it('should return error when user already has this skill', async () => {
    const { createUserCustomSkill } = await importModule();
    mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
    (userCustomSkillRepository as any).getUserCustomSkills = jest.fn().mockResolvedValueOnce([
      { id: 'sk-1', name: 'React' },
    ]);

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'React', description: 'Frontend framework', yearsOfExperience: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DUPLICATE_USER_SKILL');
  });

  it('should return error when custom skill not found by id', async () => {
    const { getUserCustomSkillById } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
    (userCustomSkillRepository as any).getUserCustomSkillById = jest.fn().mockResolvedValueOnce(null);

    const result = await getUserCustomSkillById('sk-1', 'u1');
    expect(result.success).toBe(false);
  });

  it('should handle searchUserCustomSkills', async () => {
    const { searchUserCustomSkills } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
    (userCustomSkillRepository as any).searchUserCustomSkills = jest.fn().mockResolvedValueOnce([
      { id: 'sk-1', user_id: 'u1', name: 'React', description: 'Frontend', years_of_experience: 3, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
    ]);

    const result = await searchUserCustomSkills('u1', 'React');
    expect(result.length).toBe(1);
  });
});


// ═══════════════════════════════════════════════════════════════
// Branch coverage: user-custom-skill-repository.ts line 99
// searchUserCustomSkills: name match, description match, neither
// ═══════════════════════════════════════════════════════════════

describe('User Custom Skill Service - searchUserCustomSkills branch coverage (line 99)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-wire the mock function on the repository object in case a previous
    // describe block replaced it with a new jest.fn()
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
    (userCustomSkillRepository as any).searchUserCustomSkills = mockSearchUserCustomSkillsRepo;
  });

  const importModule = async () => {
    return await import('../../services/user-custom-skill-service.js');
  };

  it('should return skill when keyword matches name but not description', async () => {
    const { searchUserCustomSkills } = await importModule();

    mockSearchUserCustomSkillsRepo.mockResolvedValueOnce([
      { id: 'cs-1', user_id: 'user-1', name: 'ReactNative', description: 'Mobile app toolkit', years_of_experience: 2, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
    ]);

    const result = await searchUserCustomSkills('user-1', 'React');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ReactNative');
  });

  it('should return skill when keyword matches description but not name', async () => {
    const { searchUserCustomSkills } = await importModule();

    mockSearchUserCustomSkillsRepo.mockResolvedValueOnce([
      { id: 'cs-2', user_id: 'user-1', name: 'GoLang', description: 'A powerful framework for backend services', years_of_experience: 3, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
    ]);

    const result = await searchUserCustomSkills('user-1', 'framework');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('GoLang');
  });

  it('should return empty when keyword matches neither name nor description', async () => {
    const { searchUserCustomSkills } = await importModule();

    mockSearchUserCustomSkillsRepo.mockResolvedValueOnce([]);

    const result = await searchUserCustomSkills('user-1', 'zzzznonexistent');
    expect(result).toHaveLength(0);
  });

  it('should return multiple skills when keyword matches multiple names', async () => {
    const { searchUserCustomSkills } = await importModule();

    mockSearchUserCustomSkillsRepo.mockResolvedValueOnce([
      { id: 'cs-1', user_id: 'user-1', name: 'ReactNative', description: 'Mobile toolkit', years_of_experience: 2, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
      { id: 'cs-2', user_id: 'user-1', name: 'ReactVR', description: 'VR framework', years_of_experience: 1, is_approved: false, suggested_for_global: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
    ]);

    const result = await searchUserCustomSkills('user-1', 'react');
    expect(result).toHaveLength(2);
  });
});

describe('User Custom Skill Service - Non-Error Throw Branch Coverage', () => {
  const importModule = async () => {
    return await import('../../services/user-custom-skill-service.js');
  };

  // Re-wire repository mock methods before each test, in case the "Direct Branch
  // Coverage" describe block replaced them with new jest.fn() instances.
  beforeEach(async () => {
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');
    (userCustomSkillRepository as any).getUserCustomSkills = mockGetUserCustomSkills;
    (userCustomSkillRepository as any).createUserCustomSkill = mockCreateUserCustomSkillRepo;
  });

  it('L118: error instanceof Error ? error.message : "Unknown error" when string thrown', async () => {
    const { createUserCustomSkill } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');

    // Set up prerequisite mocks so the function reaches the repository create call
    mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
    mockGetUserCustomSkills.mockResolvedValueOnce([]);
    (userCustomSkillRepository as any).createUserCustomSkill = jest.fn().mockRejectedValueOnce('raw string error');

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'Rust',
      description: 'Systems language',
      yearsOfExperience: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // The instance check goes into details[0], message is always 'Failed to create custom skill'
      expect(result.error.message).toBe('Failed to create custom skill');
      expect(result.error.details[0]).toBe('Unknown error');
    }
  });

  it('L118: error instanceof Error branch when Error is thrown', async () => {
    const { createUserCustomSkill } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');

    mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
    mockGetUserCustomSkills.mockResolvedValueOnce([]);
    (userCustomSkillRepository as any).createUserCustomSkill = jest.fn().mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'Rust',
      description: 'Systems language',
      yearsOfExperience: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to create custom skill');
      expect(result.error.details[0]).toBe('DB connection lost');
    }
  });

  it('L118: non-Error thrown as number', async () => {
    const { createUserCustomSkill } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');

    mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
    mockGetUserCustomSkills.mockResolvedValueOnce([]);
    (userCustomSkillRepository as any).createUserCustomSkill = jest.fn().mockRejectedValueOnce(42);

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'Go',
      description: 'Backend language',
      yearsOfExperience: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to create custom skill');
      expect(result.error.details[0]).toBe('Unknown error');
    }
  });

  it('L118: non-Error thrown as null', async () => {
    const { createUserCustomSkill } = await importModule();
    const { userCustomSkillRepository } = await import('../../repositories/user-custom-skill-repository.ts');

    mockGetSkillByNameNormalized.mockResolvedValueOnce(null);
    mockGetUserCustomSkills.mockResolvedValueOnce([]);
    (userCustomSkillRepository as any).createUserCustomSkill = jest.fn().mockRejectedValueOnce(null);

    const result = await createUserCustomSkill('u1', 'John', {
      name: 'Python',
      description: 'Scripting',
      yearsOfExperience: 5,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Failed to create custom skill');
      expect(result.error.details[0]).toBe('Unknown error');
    }
  });
});
