// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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
  SkillCategoryEntity: {},
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
  SkillEntity: {},
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('generated-id'),
}));

jest.unstable_mockModule(resolveModule('src/utils/cache.ts'), () => ({
  skillCache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
  },
}));

describe('Skill Service - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/skill-service.js');
  };

  describe('createCategory', () => {
    it('should create category successfully', async () => {
      const { createCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryByName.mockResolvedValueOnce(null);
      const created = { id: 'cat-1', name: 'Web Dev', description: 'Web development', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockSkillCategoryRepository.createCategory.mockResolvedValueOnce(created);

      const result = await createCategory({ name: 'Web Dev', description: 'Web development' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Web Dev');
    });

    it('should fail when category name already exists', async () => {
      const { createCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryByName.mockResolvedValueOnce({ id: 'existing', name: 'Web Dev' });

      const result = await createCategory({ name: 'Web Dev', description: 'Duplicate' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_CATEGORY');
    });
  });

  describe('getCategoryById', () => {
    it('should return category when found', async () => {
      const { getCategoryById } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Web Dev', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' });

      const result = await getCategoryById('cat-1');

      expect(result.success).toBe(true);
    });

    it('should return error when not found', async () => {
      const { getCategoryById } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce(null);

      const result = await getCategoryById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CATEGORY_NOT_FOUND');
    });
  });

  describe('updateCategory', () => {
    it('should update category successfully', async () => {
      const { updateCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Old Name', description: 'Desc', is_active: true });
      mockSkillCategoryRepository.getCategoryByName.mockResolvedValueOnce(null);
      mockSkillCategoryRepository.updateCategory.mockResolvedValueOnce({ id: 'cat-1', name: 'New Name', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await updateCategory('cat-1', { name: 'New Name' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('New Name');
    });

    it('should fail when category not found', async () => {
      const { updateCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce(null);

      const result = await updateCategory('nonexistent', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('should fail when new name already exists', async () => {
      const { updateCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Old Name' });
      mockSkillCategoryRepository.getCategoryByName.mockResolvedValueOnce({ id: 'cat-2', name: 'Existing' });

      const result = await updateCategory('cat-1', { name: 'Existing' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_CATEGORY');
    });

    it('should handle update failure', async () => {
      const { updateCategory } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Old Name' });
      mockSkillCategoryRepository.updateCategory.mockResolvedValueOnce(null);

      const result = await updateCategory('cat-1', { description: 'Updated' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('getAllCategories', () => {
    it('should return all categories', async () => {
      const { getAllCategories } = await importModule();

      mockSkillCategoryRepository.getAllCategories.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Web', description: 'Web dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getAllCategories();

      expect(result).toHaveLength(1);
    });
  });

  describe('getActiveCategories', () => {
    it('should return only active categories', async () => {
      const { getActiveCategories } = await importModule();

      mockSkillCategoryRepository.getActiveCategories.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Web', description: 'Web dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getActiveCategories();

      expect(result).toHaveLength(1);
    });
  });

  describe('createSkill', () => {
    it('should create skill successfully', async () => {
      const { createSkill } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Web' });
      mockSkillRepository.getSkillByNameInCategory.mockResolvedValueOnce(null);
      mockSkillRepository.createSkill.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'React framework', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' });

      const result = await createSkill({ categoryId: 'cat-1', name: 'React', description: 'React framework' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('React');
    });

    it('should fail when category not found', async () => {
      const { createSkill } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce(null);

      const result = await createSkill({ categoryId: 'nonexistent', name: 'React', description: 'Desc' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('should fail when skill name already exists in category', async () => {
      const { createSkill } = await importModule();

      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce({ id: 'cat-1', name: 'Web' });
      mockSkillRepository.getSkillByNameInCategory.mockResolvedValueOnce({ id: 'existing', name: 'React' });

      const result = await createSkill({ categoryId: 'cat-1', name: 'React', description: 'Desc' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_SKILL');
    });
  });

  describe('getSkillById', () => {
    it('should return skill when found', async () => {
      const { getSkillById } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' });

      const result = await getSkillById('skill-1');

      expect(result.success).toBe(true);
    });

    it('should return error when not found', async () => {
      const { getSkillById } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce(null);

      const result = await getSkillById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });
  });

  describe('updateSkill', () => {
    it('should update skill successfully', async () => {
      const { updateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Old', is_active: true });
      mockSkillRepository.updateSkill.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'New', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await updateSkill('skill-1', { description: 'New' });

      expect(result.success).toBe(true);
    });

    it('should fail when skill not found', async () => {
      const { updateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce(null);

      const result = await updateSkill('nonexistent', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('should fail when new category not found', async () => {
      const { updateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React' });
      mockSkillCategoryRepository.getCategoryById.mockResolvedValueOnce(null);

      const result = await updateSkill('skill-1', { categoryId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('should fail when new name already exists in category', async () => {
      const { updateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React' });
      mockSkillRepository.getSkillByNameInCategory.mockResolvedValueOnce({ id: 'skill-2', name: 'Vue' });

      const result = await updateSkill('skill-1', { name: 'Vue' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_SKILL');
    });

    it('should handle update failure', async () => {
      const { updateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React' });
      mockSkillRepository.updateSkill.mockResolvedValueOnce(null);

      const result = await updateSkill('skill-1', { description: 'Updated' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('deprecateSkill', () => {
    it('should deprecate skill successfully', async () => {
      const { deprecateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', is_active: true });
      mockSkillRepository.updateSkill.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', is_active: false, description: 'Desc', created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await deprecateSkill('skill-1');

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
    });

    it('should fail when skill not found', async () => {
      const { deprecateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce(null);

      const result = await deprecateSkill('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('should handle update failure', async () => {
      const { deprecateSkill } = await importModule();

      mockSkillRepository.findSkillById.mockResolvedValueOnce({ id: 'skill-1', category_id: 'cat-1', name: 'React', is_active: true });
      mockSkillRepository.updateSkill.mockResolvedValueOnce(null);

      const result = await deprecateSkill('skill-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('getAllSkills', () => {
    it('should return all skills', async () => {
      const { getAllSkills } = await importModule();

      mockSkillRepository.getAllSkills.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getAllSkills();
      expect(result).toHaveLength(1);
    });
  });

  describe('getActiveSkills', () => {
    it('should return active skills', async () => {
      const { getActiveSkills } = await importModule();

      mockSkillRepository.getActiveSkills.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getActiveSkills();
      expect(result).toHaveLength(1);
    });
  });

  describe('getSkillsByCategory', () => {
    it('should return skills for category', async () => {
      const { getSkillsByCategory } = await importModule();

      mockSkillRepository.getSkillsByCategory.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getSkillsByCategory('cat-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getActiveSkillsByCategory', () => {
    it('should return active skills for category', async () => {
      const { getActiveSkillsByCategory } = await importModule();

      mockSkillRepository.getActiveSkillsByCategory.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getActiveSkillsByCategory('cat-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('searchSkills', () => {
    it('should search skills by keyword', async () => {
      const { searchSkills } = await importModule();

      mockSkillRepository.searchSkillsByKeyword.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'React framework', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);
      mockSkillCategoryRepository.getAllCategories.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Frontend', description: 'Frontend dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await searchSkills('React');

      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Frontend');
    });

    it('should return Unknown for missing category', async () => {
      const { searchSkills } = await importModule();

      mockSkillRepository.searchSkillsByKeyword.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-unknown', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);
      mockSkillCategoryRepository.getAllCategories.mockResolvedValueOnce([]);

      const result = await searchSkills('React');

      expect(result[0].categoryName).toBe('Unknown');
    });
  });

  describe('getFullTaxonomy', () => {
    it('should return full taxonomy', async () => {
      const { getFullTaxonomy } = await importModule();

      mockSkillCategoryRepository.getActiveCategories.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Frontend', description: 'Frontend dev', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);
      mockSkillRepository.getActiveSkills.mockResolvedValueOnce([
        { id: 'skill-1', category_id: 'cat-1', name: 'React', description: 'Desc', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);

      const result = await getFullTaxonomy();

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].skills).toHaveLength(1);
    });

    it('should handle categories with no skills', async () => {
      const { getFullTaxonomy } = await importModule();

      mockSkillCategoryRepository.getActiveCategories.mockResolvedValueOnce([
        { id: 'cat-1', name: 'Empty', description: 'No skills', is_active: true, created_at: '2025-01-01', updated_at: '2025-01-01' },
      ]);
      mockSkillRepository.getActiveSkills.mockResolvedValueOnce([]);

      const result = await getFullTaxonomy();

      expect(result.categories[0].skills).toEqual([]);
    });
  });

  describe('validateSkillIds', () => {
    it('should validate skill IDs correctly', async () => {
      const { validateSkillIds } = await importModule();

      mockSkillRepository.findSkillById
        .mockResolvedValueOnce({ id: 'skill-1', is_active: true })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'skill-3', is_active: false });

      const result = await validateSkillIds(['skill-1', 'skill-2', 'skill-3']);

      expect(result.valid).toEqual(['skill-1']);
      expect(result.invalid).toEqual(['skill-2', 'skill-3']);
    });

    it('should return all valid for existing active skills', async () => {
      const { validateSkillIds } = await importModule();

      mockSkillRepository.findSkillById
        .mockResolvedValueOnce({ id: 'skill-1', is_active: true })
        .mockResolvedValueOnce({ id: 'skill-2', is_active: true });

      const result = await validateSkillIds(['skill-1', 'skill-2']);

      expect(result.valid).toEqual(['skill-1', 'skill-2']);
      expect(result.invalid).toEqual([]);
    });

    it('should handle empty array', async () => {
      const { validateSkillIds } = await importModule();

      const result = await validateSkillIds([]);

      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });
});
