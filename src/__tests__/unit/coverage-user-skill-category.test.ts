// @ts-nocheck
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

const { updateUserCustomSkill } = await import('../../services/user-custom-skill-service.js');

describe('User Custom Skill - categoryName branch (line 177)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include categoryName in entityUpdates when provided', async () => {
    mockUserCustomSkillRepository.getUserCustomSkillById.mockResolvedValue({
      id: 'cs-1', user_id: 'user-1', name: 'Skill', description: 'Desc',
    });
    mockUserCustomSkillRepository.getUserCustomSkills.mockResolvedValue([]);
    mockUserCustomSkillRepository.updateUserCustomSkill.mockResolvedValue({
      id: 'cs-1', user_id: 'user-1', name: 'Updated Skill', description: 'Desc',
      category_name: 'test-cat',
    });

    const result = await updateUserCustomSkill('cs-1', 'user-1', {
      name: 'Updated Skill',
      categoryName: 'test-cat',
    });

    expect(result.success).toBe(true);
    expect(mockUserCustomSkillRepository.updateUserCustomSkill).toHaveBeenCalledWith(
      'cs-1', 'user-1',
      expect.objectContaining({ category_name: 'test-cat' })
    );
  });
});
