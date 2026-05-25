// @ts-nocheck
/**
 * user-custom-skill-service.ts - catch block coverage
 * Lines 117, 177, 194, 221, 293
 * These are catch blocks that need explicit throw testing
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockUserCustomSkillRepository = {
  getUserCustomSkills: jest.fn<any>(),
  getUserCustomSkillById: jest.fn<any>(),
  createUserCustomSkill: jest.fn<any>(),
  updateUserCustomSkill: jest.fn<any>(),
  deleteUserCustomSkill: jest.fn<any>(),
  searchUserCustomSkills: jest.fn<any>(),
  getSkillSuggestionByName: jest.fn<any>(),
  createSkillSuggestion: jest.fn<any>(),
  incrementSkillSuggestionCount: jest.fn<any>(),
  getPendingSkillSuggestions: jest.fn<any>(),
  updateSkillSuggestionStatus: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-custom-skill-repository.ts'), () => ({
  userCustomSkillRepository: mockUserCustomSkillRepository,
}));

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  searchSkills: jest.fn<any>().mockResolvedValue([]),
  getActiveSkills: jest.fn<any>().mockResolvedValue([]),
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('gen-id'),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const {
  createUserCustomSkill,
  updateUserCustomSkill,
  deleteUserCustomSkill,
  updateSkillSuggestionStatus,
} = await import('../../services/user-custom-skill-service.js');

describe('User Custom Skill Service - Catch Block Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Line 117: createUserCustomSkill catch block
  it('should return CREATE_FAILED when repository throws (line 117)', async () => {
    mockUserCustomSkillRepository.getUserCustomSkills.mockResolvedValue([]);
    mockUserCustomSkillRepository.createUserCustomSkill.mockRejectedValue(new Error('DB insert failed'));

    const result = await createUserCustomSkill('user-1', 'Test User', {
      name: 'New Skill',
      description: 'A new custom skill description',
      yearsOfExperience: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CREATE_FAILED');
      expect(result.error.details).toContain('DB insert failed');
    }
  });

  it('should return CREATE_FAILED with non-Error thrown (line 117)', async () => {
    mockUserCustomSkillRepository.getUserCustomSkills.mockResolvedValue([]);
    mockUserCustomSkillRepository.createUserCustomSkill.mockRejectedValue('string error');

    const result = await createUserCustomSkill('user-1', 'Test User', {
      name: 'New Skill',
      description: 'A new custom skill description',
      yearsOfExperience: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CREATE_FAILED');
      expect(result.error.details).toContain('Unknown error');
    }
  });

  // Lines 177, 194: updateUserCustomSkill catch block
  it('should return UPDATE_FAILED when updateUserCustomSkill repository throws (lines 177, 194)', async () => {
    mockUserCustomSkillRepository.getUserCustomSkillById.mockResolvedValue({
      id: 'cs-1', user_id: 'user-1', name: 'Skill', description: 'Desc',
    });
    mockUserCustomSkillRepository.updateUserCustomSkill.mockRejectedValue(new Error('Update failed'));

    const result = await updateUserCustomSkill('cs-1', 'user-1', { description: 'Updated' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
      expect(result.error.details).toContain('Update failed');
    }
  });

  it('should return UPDATE_FAILED with non-Error thrown (lines 177, 194)', async () => {
    mockUserCustomSkillRepository.getUserCustomSkillById.mockResolvedValue({
      id: 'cs-1', user_id: 'user-1', name: 'Skill', description: 'Desc',
    });
    mockUserCustomSkillRepository.updateUserCustomSkill.mockRejectedValue(42);

    const result = await updateUserCustomSkill('cs-1', 'user-1', { description: 'Updated' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
      expect(result.error.details).toContain('Unknown error');
    }
  });

  // Line 221: deleteUserCustomSkill catch block
  it('should return DELETE_FAILED when deleteUserCustomSkill repository throws (line 221)', async () => {
    mockUserCustomSkillRepository.getUserCustomSkillById.mockResolvedValue({
      id: 'cs-1', user_id: 'user-1', name: 'Skill',
    });
    mockUserCustomSkillRepository.deleteUserCustomSkill.mockRejectedValue(new Error('Delete failed'));

    const result = await deleteUserCustomSkill('cs-1', 'user-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DELETE_FAILED');
      expect(result.error.details).toContain('Delete failed');
    }
  });

  // Line 293: updateSkillSuggestionStatus catch block
  it('should return UPDATE_FAILED when updateSkillSuggestionStatus repository throws (line 293)', async () => {
    mockUserCustomSkillRepository.updateSkillSuggestionStatus.mockRejectedValue(new Error('Status update failed'));

    const result = await updateSkillSuggestionStatus('suggestion-1', 'approved');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
      expect(result.error.details).toContain('Status update failed');
    }
  });
});
