// @ts-nocheck
/**
 * skill-service.ts - line 85 (skillCache.set after getAllCategories)
 * skill-service.ts - lines 173-174 (updateSkill returns null → UPDATE_FAILED)
 * Uses jest.resetModules() to get a fresh module with empty cache
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSkillCategoryRepository = {
  createCategory: jest.fn<any>(),
  getCategoryById: jest.fn<any>(),
  getCategoryByName: jest.fn<any>(),
  updateCategory: jest.fn<any>(),
  getAllCategories: jest.fn<any>(),
  getActiveCategories: jest.fn<any>(),
};

const mockSkillRepository = {
  createSkill: jest.fn<any>(),
  findSkillById: jest.fn<any>(),
  getSkillByNameInCategory: jest.fn<any>(),
  updateSkill: jest.fn<any>(),
  getAllSkills: jest.fn<any>(),
  getActiveSkills: jest.fn<any>(),
  getSkillsByCategory: jest.fn<any>(),
  getActiveSkillsByCategory: jest.fn<any>(),
  searchSkillsByKeyword: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/skill-category-repository.ts'), () => ({
  skillCategoryRepository: mockSkillCategoryRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('gen-id'),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Import AFTER mocks - fresh module with empty cache
const { getAllCategories, updateSkill } = await import('../../services/skill-service.js');

describe('Skill Service - Cache and UpdateSkill coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Line 85: skillCache.set('all_categories', result) - hit when cache is empty
  it('should set cache after fetching all categories (line 85)', async () => {
    const mockCategories = [
      { id: 'cat-1', name: 'Frontend', description: 'Frontend dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      { id: 'cat-2', name: 'Backend', description: 'Backend dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
    ];
    mockSkillCategoryRepository.getAllCategories.mockResolvedValueOnce(mockCategories);

    const result = await getAllCategories();

    expect(result).toHaveLength(2);
    expect(mockSkillCategoryRepository.getAllCategories).toHaveBeenCalledTimes(1);
    // Second call should use cache (not call repository again)
    const result2 = await getAllCategories();
    expect(result2).toHaveLength(2);
    expect(mockSkillCategoryRepository.getAllCategories).toHaveBeenCalledTimes(1); // still 1
  });

  // Lines 173-174: updateSkill with categoryId and name updates
  it('should update skill with categoryId and name (lines 173-174)', async () => {
    mockSkillRepository.findSkillById.mockResolvedValue({
      id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'React framework', is_active: true,
    });
    mockSkillCategoryRepository.getCategoryById.mockResolvedValue({
      id: 'cat-2', name: 'Backend', is_active: true,
    });
    mockSkillRepository.getSkillByNameInCategory.mockResolvedValue(null);
    mockSkillRepository.updateSkill.mockResolvedValue({
      id: 'skill-1', category_id: 'cat-2', name: 'React Updated', description: 'Updated', is_active: true,
    });

    const result = await updateSkill('skill-1', { categoryId: 'cat-2', name: 'React Updated', description: 'Updated' });
    expect(result.success).toBe(true);
  });

  // Lines 173-174: updateSkill returns null → UPDATE_FAILED
  it('should return UPDATE_FAILED when updateSkill returns null (lines 173-174)', async () => {
    mockSkillRepository.findSkillById.mockResolvedValueOnce({
      id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'React framework', is_active: true,
    });
    mockSkillRepository.updateSkill.mockResolvedValueOnce(null);

    const result = await updateSkill('skill-1', { description: 'Updated description' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
  });
});
