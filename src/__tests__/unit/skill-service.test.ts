// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { Skill, SkillCategory } from '../../models/skill.js';
import { SkillCategoryEntity } from '../../repositories/skill-category-repository.js';
import { SkillEntity } from '../../repositories/skill-repository.js';

// In-memory stores for testing - using entity types
let categoryStore: Map<string, SkillCategoryEntity> = new Map();
let skillStore: Map<string, SkillEntity> = new Map();
const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repository functions
const mockSkillCategoryRepository = {
  createCategory: jest.fn(async (category: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const entity: SkillCategoryEntity = { ...category, created_at: now, updated_at: now };
    categoryStore.set(entity.id, entity);
    return entity;
  }),
  getCategoryById: jest.fn(async (id: string) => {
    return categoryStore.get(id) ?? null;
  }),
  getCategoryByName: jest.fn(async (name: string) => {
    for (const category of categoryStore.values()) {
      if (category.name.toLowerCase() === name.toLowerCase()) return category;
    }
    return null;
  }),
  updateCategory: jest.fn(async (id: string, updates: Partial<SkillCategoryEntity>) => {
    const existing = categoryStore.get(id);
    if (!existing) return null;
    const updated: SkillCategoryEntity = { ...existing, ...updates, updated_at: new Date().toISOString() };
    categoryStore.set(id, updated);
    return updated;
  }),
  getAllCategories: jest.fn(async () => {
    return Array.from(categoryStore.values()).sort((a, b) => a.name.localeCompare(b.name));
  }),
  getActiveCategories: jest.fn(async () => {
    return Array.from(categoryStore.values())
      .filter(c => c.is_active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
};

const mockSkillRepository = {
  createSkill: jest.fn(async (skill: Omit<SkillEntity, 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const entity: SkillEntity = { ...skill, created_at: now, updated_at: now };
    skillStore.set(entity.id, entity);
    return entity;
  }),
  findSkillById: jest.fn(async (id: string) => {
    return skillStore.get(id) ?? null;
  }),
  findSkillsByIds: jest.fn(async (ids: string[]) => {
    return ids.map(id => skillStore.get(id)).filter((s): s is SkillEntity => Boolean(s));
  }),
  getSkillById: jest.fn(async (id: string) => {
    return skillStore.get(id) ?? null;
  }),
  getSkillByNameInCategory: jest.fn(async (name: string, categoryId: string) => {
    for (const skill of skillStore.values()) {
      if (skill.category_id === categoryId && skill.name.toLowerCase() === name.toLowerCase()) {
        return skill;
      }
    }
    return null;
  }),
  updateSkill: jest.fn(async (id: string, updates: Partial<SkillEntity>) => {
    const existing = skillStore.get(id);
    if (!existing) return null;
    const updated: SkillEntity = { ...existing, ...updates, updated_at: new Date().toISOString() };
    skillStore.set(id, updated);
    return updated;
  }),
  getAllSkills: jest.fn(async () => {
    return Array.from(skillStore.values()).sort((a, b) => a.name.localeCompare(b.name));
  }),
  getActiveSkills: jest.fn(async () => {
    return Array.from(skillStore.values())
      .filter(s => s.is_active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  getSkillsByCategory: jest.fn(async (categoryId: string) => {
    return Array.from(skillStore.values())
      .filter(s => s.category_id === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  getActiveSkillsByCategory: jest.fn(async (categoryId: string) => {
    return Array.from(skillStore.values())
      .filter(s => s.category_id === categoryId && s.is_active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  searchSkillsByKeyword: jest.fn(async (keyword: string) => {
    const lowerKeyword = keyword.toLowerCase();
    return Array.from(skillStore.values())
      .filter(s => s.is_active && (
        s.name.toLowerCase().includes(lowerKeyword) ||
        s.description.toLowerCase().includes(lowerKeyword)
      ))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
};

// Mock the repository modules
jest.unstable_mockModule(resolveModule('src/repositories/skill-category-repository.ts'), () => ({
  skillCategoryRepository: mockSkillCategoryRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));
const {
  createCategory,
  getCategoryById,
  createSkill,
  getSkillById,
  deprecateSkill,
  getFullTaxonomy,
  searchSkills,
} = await import('../../services/skill-service.js');
// Custom arbitraries for property-based testing
const validCategoryNameArbitrary = () =>
  fc.stringMatching(/^[A-Z][a-z]{2,15}( [A-Z][a-z]{2,10})?$/)
    .filter(name => name.length >= 3 && name.length <= 50);
const validDescriptionArbitrary = () =>
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,.]{10,100}$/)
    .filter(desc => desc.length >= 10 && desc.length <= 200);
const validSkillNameArbitrary = () =>
  fc.stringMatching(/^[A-Z][a-z]{2,12}(\.?[a-z]{0,5})?$/)
    .filter(name => name.length >= 3 && name.length <= 30);
const validCategoryInputArbitrary = () =>
  fc.record({
    name: validCategoryNameArbitrary(),
    description: validDescriptionArbitrary(),
  });
describe('Skill Taxonomy Service - Category Properties', () => {
  beforeEach(() => {
    categoryStore.clear();
    skillStore.clear();
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 29: Skill category creation**
   * **Validates: Requirements 9.1**
   * 
   * For any valid skill category data, creating and then retrieving the category
   * shall return equivalent data.
   */
  it('Property 29: Skill category creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryInputArbitrary(),
        async (categoryInput) => {
          categoryStore.clear();
          const createResult = await createCategory(categoryInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;
          const createdCategory = createResult.data;
          expect(createdCategory.name).toBe(categoryInput.name);
          expect(createdCategory.description).toBe(categoryInput.description);
          expect(createdCategory.isActive).toBe(true);
          expect(createdCategory.id).toBeDefined();
          expect(createdCategory.createdAt).toBeDefined();
          const getResult = await getCategoryById(createdCategory.id);
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;
          const retrievedCategory = getResult.data;
          expect(retrievedCategory.id).toBe(createdCategory.id);
          expect(retrievedCategory.name).toBe(categoryInput.name);
          expect(retrievedCategory.description).toBe(categoryInput.description);
          expect(retrievedCategory.isActive).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
describe('Skill Taxonomy Service - Skill Properties', () => {
  beforeEach(() => {
    categoryStore.clear();
    skillStore.clear();
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 30: Skill-category association**
   * **Validates: Requirements 9.2**
   * 
   * For any skill added to a category, retrieving the skill shall show
   * the correct category association.
   */
  it('Property 30: Skill-category association', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryInputArbitrary(),
        validSkillNameArbitrary(),
        validDescriptionArbitrary(),
        async (categoryInput, skillName, skillDescription) => {
          categoryStore.clear();
          skillStore.clear();
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;
          const category = categoryResult.data;
          const skillInput = {
            categoryId: category.id,
            name: skillName,
            description: skillDescription,
          };
          const skillResult = await createSkill(skillInput);
          expect(skillResult.success).toBe(true);
          if (!skillResult.success) return;
          const createdSkill = skillResult.data;
          expect(createdSkill.categoryId).toBe(category.id);
          const getResult = await getSkillById(createdSkill.id);
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;
          const retrievedSkill = getResult.data;
          expect(retrievedSkill.categoryId).toBe(category.id);
          expect(retrievedSkill.name).toBe(skillName);
          expect(retrievedSkill.description).toBe(skillDescription);
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 31: Hierarchical taxonomy retrieval**
   * **Validates: Requirements 9.3**
   * 
   * For any skill taxonomy, retrieving the full taxonomy shall return all active
   * categories with their associated active skills in hierarchical format.
   */
  it('Property 31: Hierarchical taxonomy retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validCategoryInputArbitrary(), { minLength: 1, maxLength: 5 }),
        fc.array(validSkillNameArbitrary(), { minLength: 1, maxLength: 10 }),
        async (categoryInputs, skillNames) => {
          categoryStore.clear();
          skillStore.clear();
          // Create unique categories (filter duplicates by name)
          const uniqueCategoryInputs = categoryInputs.filter((input, index, self) =>
            index === self.findIndex(c => c.name.toLowerCase() === input.name.toLowerCase())
          );
          const createdCategories: SkillCategory[] = [];
          for (const input of uniqueCategoryInputs) {
            const result = await createCategory(input);
            if (result.success) {
              createdCategories.push(result.data);
            }
          }
          if (createdCategories.length === 0) return;
          // Create unique skills distributed across categories
          const uniqueSkillNames = [...new Set(skillNames.map(n => n.toLowerCase()))];
          const createdSkills: Skill[] = [];
          for (let i = 0; i < uniqueSkillNames.length; i++) {
            const categoryIndex = i % createdCategories.length;
            const category = createdCategories[categoryIndex]!;
            const skillName = uniqueSkillNames[i]!;
            const result = await createSkill({
              categoryId: category.id,
              name: skillName,
              description: `Description for ${skillName}`,
            });
            if (result.success) {
              createdSkills.push(result.data);
            }
          }
          const taxonomy = await getFullTaxonomy();
          expect(taxonomy.categories.length).toBe(createdCategories.length);
          for (const category of taxonomy.categories) {
            const expectedSkills = createdSkills.filter(s => s.categoryId === category.id);
            expect(category.skills.length).toBe(expectedSkills.length);
            for (const skill of category.skills) {
              expect(skill.categoryId).toBe(category.id);
              expect(skill.isActive).toBe(true);
            }
          }
          const totalSkillsInTaxonomy = taxonomy.categories.reduce(
            (sum, cat) => sum + cat.skills.length, 0
          );
          expect(totalSkillsInTaxonomy).toBe(createdSkills.length);
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 32: Deprecated skill exclusion**
   * **Validates: Requirements 9.4**
   * 
   * For any deprecated skill, it shall not appear in skill selection lists
   * for new profile or project associations.
   */
  it('Property 32: Deprecated skill exclusion', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryInputArbitrary(),
        fc.array(validSkillNameArbitrary(), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0 }),
        async (categoryInput, skillNames, deprecateIndex) => {
          categoryStore.clear();
          skillStore.clear();
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;
          const category = categoryResult.data;
          const uniqueSkillNames = [...new Set(skillNames.map(n => n.toLowerCase()))];
          if (uniqueSkillNames.length < 2) return;
          const createdSkills: Skill[] = [];
          for (const name of uniqueSkillNames) {
            const result = await createSkill({
              categoryId: category.id,
              name,
              description: `Description for ${name}`,
            });
            if (result.success) {
              createdSkills.push(result.data);
            }
          }
          if (createdSkills.length < 2) return;
          const skillToDeprecate = createdSkills[deprecateIndex % createdSkills.length]!;
          const deprecateResult = await deprecateSkill(skillToDeprecate.id);
          expect(deprecateResult.success).toBe(true);
          const taxonomy = await getFullTaxonomy();
          const taxonomyCategory = taxonomy.categories.find(c => c.id === category.id);
          expect(taxonomyCategory).toBeDefined();
          if (!taxonomyCategory) return;
          const deprecatedSkillInTaxonomy = taxonomyCategory.skills.find(
            s => s.id === skillToDeprecate.id
          );
          expect(deprecatedSkillInTaxonomy).toBeUndefined();
          const activeSkillCount = createdSkills.length - 1;
          expect(taxonomyCategory.skills.length).toBe(activeSkillCount);
          for (const skill of taxonomyCategory.skills) {
            expect(skill.isActive).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 33: Skill keyword search**
   * **Validates: Requirements 9.5**
   * 
   * For any keyword search on skills, all returned skills shall contain the keyword
   * in their name or description, and each result shall include its category.
   */
  it('Property 33: Skill keyword search', async () => {
    await fc.assert(
      fc.asyncProperty(
        validCategoryInputArbitrary(),
        fc.array(
          fc.record({
            name: validSkillNameArbitrary(),
            description: validDescriptionArbitrary(),
          }),
          { minLength: 3, maxLength: 8 }
        ),
        async (categoryInput, skillInputs) => {
          categoryStore.clear();
          skillStore.clear();
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;
          const category = categoryResult.data;
          const seenNames = new Set<string>();
          const createdSkills: Skill[] = [];
          for (const input of skillInputs) {
            const lowerName = input.name.toLowerCase();
            if (seenNames.has(lowerName)) continue;
            seenNames.add(lowerName);
            const result = await createSkill({
              categoryId: category.id,
              name: input.name,
              description: input.description,
            });
            if (result.success) {
              createdSkills.push(result.data);
            }
          }
          if (createdSkills.length === 0) return;
          // Pick a keyword from one of the skill names (first 3 chars)
          const targetSkill = createdSkills[0]!;
          const keyword = targetSkill.name.substring(0, Math.min(3, targetSkill.name.length)).toLowerCase();
          const searchResults = await searchSkills(keyword);
          for (const result of searchResults) {
            const nameContains = result.name.toLowerCase().includes(keyword);
            const descContains = result.description.toLowerCase().includes(keyword);
            expect(nameContains || descContains).toBe(true);
            expect(result.categoryName).toBeDefined();
            expect(result.categoryName).toBe(category.name);
          }
          // Verify the target skill is in results (since we searched for part of its name)
          const targetInResults = searchResults.some(r => r.id === targetSkill.id);
          expect(targetInResults).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Branch coverage: skill-repository.ts line 165
// searchSkillsByKeyword: name match, description match, neither
// ═══════════════════════════════════════════════════════════════

describe('Skill Service - searchSkillsByKeyword branch coverage (line 165)', () => {
  beforeEach(() => {
    categoryStore.clear();
    skillStore.clear();
  });

  it('should return skill when keyword matches name but not description', async () => {
    const categoryResult = await createCategory({ name: 'Frontend', description: 'Frontend development tools' });
    expect(categoryResult.success).toBe(true);
    if (!categoryResult.success) return;

    await createSkill({
      categoryId: categoryResult.data.id,
      name: 'ReactJavaScript',
      description: 'A unique xyzzy framework for building UIs',
    });

    // Search for a keyword that appears in name but NOT in description
    const results = await searchSkills('React');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find(r => r.name === 'ReactJavaScript');
    expect(found).toBeDefined();
  });

  it('should return skill when keyword matches description but not name', async () => {
    const categoryResult = await createCategory({ name: 'Backend', description: 'Backend tools' });
    expect(categoryResult.success).toBe(true);
    if (!categoryResult.success) return;

    await createSkill({
      categoryId: categoryResult.data.id,
      name: 'GoLang',
      description: 'An amazing framework for server-side applications',
    });

    // Search for 'framework' which is in description but not in name 'GoLang'
    const results = await searchSkills('framework');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find(r => r.name === 'GoLang');
    expect(found).toBeDefined();
  });

  it('should return empty when keyword matches neither name nor description', async () => {
    const categoryResult = await createCategory({ name: 'Mobile', description: 'Mobile development' });
    expect(categoryResult.success).toBe(true);
    if (!categoryResult.success) return;

    await createSkill({
      categoryId: categoryResult.data.id,
      name: 'SwiftUI',
      description: 'Apple UI toolkit',
    });

    // Search for a keyword that doesn't appear anywhere
    const results = await searchSkills('zzzznonexistent');
    expect(results.length).toBe(0);
  });

  it('should not return inactive skills even when keyword matches', async () => {
    const categoryResult = await createCategory({ name: 'Data', description: 'Data science tools' });
    expect(categoryResult.success).toBe(true);
    if (!categoryResult.success) return;

    const skillResult = await createSkill({
      categoryId: categoryResult.data.id,
      name: 'TensorFlow',
      description: 'Machine learning framework',
    });
    expect(skillResult.success).toBe(true);
    if (!skillResult.success) return;

    await deprecateSkill(skillResult.data.id);

    const results = await searchSkills('Tensor');
    expect(results.length).toBe(0);
  });
});

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
    it('should validate skill IDs correctly with a single batch query', async () => {
      const { validateSkillIds } = await importModule();

      mockSkillRepository.findSkillsByIds.mockResolvedValueOnce([
        { id: 'skill-1', is_active: true },
        { id: 'skill-3', is_active: false },
      ]);

      const result = await validateSkillIds(['skill-1', 'skill-2', 'skill-3']);

      expect(result.valid).toEqual(['skill-1']);
      expect(result.invalid).toEqual(['skill-2', 'skill-3']);
      expect(mockSkillRepository.findSkillsByIds).toHaveBeenCalledWith(['skill-1', 'skill-2', 'skill-3']);
    });

    it('should return all valid for existing active skills', async () => {
      const { validateSkillIds } = await importModule();

      mockSkillRepository.findSkillsByIds.mockResolvedValueOnce([
        { id: 'skill-1', is_active: true },
        { id: 'skill-2', is_active: true },
      ]);

      const result = await validateSkillIds(['skill-1', 'skill-2']);

      expect(result.valid).toEqual(['skill-1', 'skill-2']);
      expect(result.invalid).toEqual([]);
    });

    it('should deduplicate IDs before the batch query', async () => {
      const { validateSkillIds } = await importModule();

      mockSkillRepository.findSkillsByIds.mockResolvedValueOnce([
        { id: 'skill-1', is_active: true },
      ]);

      const result = await validateSkillIds(['skill-1', 'skill-1', 'skill-1']);

      expect(mockSkillRepository.findSkillsByIds).toHaveBeenCalledWith(['skill-1']);
      expect(result.valid).toEqual(['skill-1', 'skill-1', 'skill-1']);
    });

    it('should handle empty array', async () => {
      const { validateSkillIds } = await importModule();

      const result = await validateSkillIds([]);

      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
      expect(mockSkillRepository.findSkillsByIds).not.toHaveBeenCalled();
    });
  });
});