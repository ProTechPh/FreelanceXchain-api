import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { Skill, SkillCategory } from '../../models/skill';
import { SkillCategoryEntity } from '../../repositories/skill-category-repository';
import { SkillEntity } from '../../repositories/skill-repository';

// In-memory stores for testing - using entity types
let categoryStore: Map<string, SkillCategoryEntity> = new Map();
let skillStore: Map<string, SkillEntity> = new Map();

// Mock the repositories before importing skill-service
jest.unstable_mockModule('../../repositories/skill-category-repository.js', () => ({
  skillCategoryRepository: {
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
  },
  SkillCategoryRepository: jest.fn(),
  SkillCategoryEntity: {} as SkillCategoryEntity,
}));

jest.unstable_mockModule('../../repositories/skill-repository.js', () => ({
  skillRepository: {
    createSkill: jest.fn(async (skill: Omit<SkillEntity, 'created_at' | 'updated_at'>) => {
      const now = new Date().toISOString();
      const entity: SkillEntity = { ...skill, created_at: now, updated_at: now };
      skillStore.set(entity.id, entity);
      return entity;
    }),
    findSkillById: jest.fn(async (id: string) => {
      return skillStore.get(id) ?? null;
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
  },
  SkillRepository: jest.fn(),
  SkillEntity: {} as SkillEntity,
}));

// Import after mocking
const {
  createCategory,
  getCategoryById,
  createSkill,
  getSkillById,
  deprecateSkill,
  getFullTaxonomy,
  searchSkills,
} = await import('../skill-service.js');

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
          // Clear store for each test case
          categoryStore.clear();

          // Create category
          const createResult = await createCategory(categoryInput);

          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const createdCategory = createResult.data;

          // Verify created data matches input
          expect(createdCategory.name).toBe(categoryInput.name);
          expect(createdCategory.description).toBe(categoryInput.description);
          expect(createdCategory.isActive).toBe(true);
          expect(createdCategory.id).toBeDefined();
          expect(createdCategory.createdAt).toBeDefined();

          // Retrieve and verify
          const getResult = await getCategoryById(createdCategory.id);

          expect(getResult.success).toBe(true);
          if (!getResult.success) return;

          const retrievedCategory = getResult.data;

          // Verify retrieved data matches created data
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
          // Clear stores for each test case
          categoryStore.clear();
          skillStore.clear();

          // First create a category
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;

          const category = categoryResult.data;

          // Create a skill in that category
          const skillInput = {
            categoryId: category.id,
            name: skillName,
            description: skillDescription,
          };

          const skillResult = await createSkill(skillInput);
          expect(skillResult.success).toBe(true);
          if (!skillResult.success) return;

          const createdSkill = skillResult.data;

          // Verify skill has correct category association
          expect(createdSkill.categoryId).toBe(category.id);

          // Retrieve skill and verify association persists
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
          // Clear stores for each test case
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

          // Get full taxonomy
          const taxonomy = await getFullTaxonomy();

          // Verify all active categories are present
          expect(taxonomy.categories.length).toBe(createdCategories.length);

          // Verify each category has its associated skills
          for (const category of taxonomy.categories) {
            const expectedSkills = createdSkills.filter(s => s.categoryId === category.id);
            expect(category.skills.length).toBe(expectedSkills.length);

            // Verify each skill in category
            for (const skill of category.skills) {
              expect(skill.categoryId).toBe(category.id);
              expect(skill.isActive).toBe(true);
            }
          }

          // Verify total skill count
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
          // Clear stores for each test case
          categoryStore.clear();
          skillStore.clear();

          // Create a category
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;

          const category = categoryResult.data;

          // Create unique skills
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

          // Deprecate one skill
          const skillToDeprecate = createdSkills[deprecateIndex % createdSkills.length]!;
          const deprecateResult = await deprecateSkill(skillToDeprecate.id);
          expect(deprecateResult.success).toBe(true);

          // Get full taxonomy (should only include active skills)
          const taxonomy = await getFullTaxonomy();

          // Find the category in taxonomy
          const taxonomyCategory = taxonomy.categories.find(c => c.id === category.id);
          expect(taxonomyCategory).toBeDefined();
          if (!taxonomyCategory) return;

          // Verify deprecated skill is NOT in the taxonomy
          const deprecatedSkillInTaxonomy = taxonomyCategory.skills.find(
            s => s.id === skillToDeprecate.id
          );
          expect(deprecatedSkillInTaxonomy).toBeUndefined();

          // Verify other skills ARE in the taxonomy
          const activeSkillCount = createdSkills.length - 1;
          expect(taxonomyCategory.skills.length).toBe(activeSkillCount);

          // Verify all skills in taxonomy are active
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
          // Clear stores for each test case
          categoryStore.clear();
          skillStore.clear();

          // Create a category
          const categoryResult = await createCategory(categoryInput);
          expect(categoryResult.success).toBe(true);
          if (!categoryResult.success) return;

          const category = categoryResult.data;

          // Create unique skills
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

          // Search for skills
          const searchResults = await searchSkills(keyword);

          // Verify all results contain the keyword in name or description
          for (const result of searchResults) {
            const nameContains = result.name.toLowerCase().includes(keyword);
            const descContains = result.description.toLowerCase().includes(keyword);
            expect(nameContains || descContains).toBe(true);

            // Verify category name is included
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
