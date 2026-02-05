import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { ProjectEntity } from '../../repositories/project-repository';
import { FreelancerProfileEntity } from '../../repositories/freelancer-profile-repository';
import { QueryOptions } from '../../repositories/base-repository';
import { generateId } from '../../utils/id';

// In-memory stores for testing - using entity types
let projectStore: Map<string, ProjectEntity> = new Map();
let freelancerStore: Map<string, FreelancerProfileEntity> = new Map();

// Mock the repositories before importing search-service
jest.unstable_mockModule('../../repositories/project-repository.js', () => ({
  projectRepository: {
    getAllOpenProjects: jest.fn(async (options?: QueryOptions) => {
      const items = Array.from(projectStore.values()).filter(p => p.status === 'open');
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
    searchProjects: jest.fn(async (keyword: string, options?: QueryOptions) => {
      const lowerKeyword = keyword.toLowerCase();
      const items = Array.from(projectStore.values()).filter(
        p => p.status === 'open' && (
          p.title.toLowerCase().includes(lowerKeyword) ||
          p.description.toLowerCase().includes(lowerKeyword)
        )
      );
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
    getProjectsBySkills: jest.fn(async (skillIds: string[], options?: QueryOptions) => {
      const skillIdSet = new Set(skillIds);
      const items = Array.from(projectStore.values()).filter(
        p => p.status === 'open' && p.required_skills.some(s => skillIdSet.has(s.skill_id))
      );
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
    getProjectsByBudgetRange: jest.fn(async (minBudget: number, maxBudget: number, options?: QueryOptions) => {
      const items = Array.from(projectStore.values()).filter(
        p => p.status === 'open' && p.budget >= minBudget && p.budget <= maxBudget
      );
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
  },
  ProjectRepository: jest.fn(),
  ProjectEntity: {} as ProjectEntity,
}));


jest.unstable_mockModule('../../repositories/freelancer-profile-repository.js', () => ({
  freelancerProfileRepository: {
    getAllProfilesPaginated: jest.fn(async (options?: QueryOptions) => {
      const items = Array.from(freelancerStore.values());
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
    searchBySkills: jest.fn(async (skillIds: string[], options?: QueryOptions) => {
      // For freelancers, skills are matched by name (format: 'Skill skill-X')
      const skillNames = new Set(skillIds.map(id => `Skill ${id}`));
      const items = Array.from(freelancerStore.values()).filter(
        p => p.skills.some(s => skillNames.has(s.name))
      );
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
    searchByKeyword: jest.fn(async (keyword: string, options?: QueryOptions) => {
      const lowerKeyword = keyword.toLowerCase();
      const items = Array.from(freelancerStore.values()).filter(
        p => p.bio.toLowerCase().includes(lowerKeyword)
      );
      const pageSize = options?.limit ?? 100;
      const pagedItems = items.slice(0, pageSize);
      return { items: pagedItems, hasMore: items.length > pageSize };
    }),
  },
  FreelancerProfileRepository: jest.fn(),
  FreelancerProfileEntity: {} as FreelancerProfileEntity,
}));

// Import after mocking
const { searchProjects, searchFreelancers } = await import('../search-service.js');

// Skill reference type for freelancer entity (matches what entity-mapper expects for FreelancerProfile)
type FreelancerSkillRefEntity = { name: string; years_of_experience: number };

// Skill reference type for project entity (matches what entity-mapper expects for Project)
type ProjectSkillRefEntity = { skill_id: string; skill_name: string; category_id: string; years_of_experience: number };

// Helper to create test project entities
function createTestProject(overrides: Partial<ProjectEntity> = {}): ProjectEntity {
  const id = generateId();
  const now = new Date().toISOString();
  return {
    id,
    employer_id: generateId(),
    title: `Project ${id.slice(0, 8)}`,
    description: `Description for project ${id.slice(0, 8)}`,
    required_skills: [],
    budget: 1000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    milestones: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Helper to create test freelancer profile entities
function createTestFreelancer(overrides: Partial<FreelancerProfileEntity> = {}): FreelancerProfileEntity {
  const id = generateId();
  const now = new Date().toISOString();
  return {
    id,
    user_id: generateId(),
    bio: `Bio for freelancer ${id.slice(0, 8)}`,
    hourly_rate: 50,
    skills: [],
    experience: [],
    availability: 'available',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Helper to create skill references for freelancers (entity format)
function createFreelancerSkillRef(skillName: string): FreelancerSkillRefEntity {
  return {
    name: skillName,
    years_of_experience: 2,
  };
}

// Helper to create skill references for projects (entity format)
function createProjectSkillRef(skillId: string, skillName: string): ProjectSkillRefEntity {
  return {
    skill_id: skillId,
    skill_name: skillName,
    category_id: 'cat-1',
    years_of_experience: 2,
  };
}


// Custom arbitraries for property-based testing
const validPageSizeArbitrary = () => fc.integer({ min: 1, max: 100 });

const validBudgetArbitrary = () => fc.integer({ min: 100, max: 100000 });

const validSkillIdArbitrary = () => fc.stringMatching(/^skill-[0-9]+$/);

const validSkillIdsArbitrary = () => fc.array(validSkillIdArbitrary(), { minLength: 1, maxLength: 5 });


describe('Search Service - Property Tests', () => {
  beforeEach(() => {
    projectStore.clear();
    freelancerStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 34: Search result pagination**
   * **Validates: Requirements 10.1, 10.4**
   * 
   * For any search query with pagination parameters, the results shall include
   * total count and pagination metadata, and the number of results shall not
   * exceed the page size.
   */
  it('Property 34: Search result pagination', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPageSizeArbitrary(),
        fc.integer({ min: 0, max: 50 }),
        async (pageSize, projectCount) => {
          // Clear stores for each test case
          projectStore.clear();

          // Create test projects
          for (let i = 0; i < projectCount; i++) {
            const project = createTestProject();
            projectStore.set(project.id, project);
          }

          // Search with pagination
          const result = await searchProjects({}, { pageSize });

          expect(result.success).toBe(true);
          if (!result.success) return;

          // Verify pagination metadata exists
          expect(result.data.metadata).toBeDefined();
          expect(result.data.metadata.pageSize).toBe(pageSize);
          expect(typeof result.data.metadata.hasMore).toBe('boolean');

          // Verify result count does not exceed page size
          expect(result.data.items.length).toBeLessThanOrEqual(pageSize);

          // If there are more items than page size, hasMore should be true
          if (projectCount > pageSize) {
            expect(result.data.metadata.hasMore).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 35: Project skill filter**
   * **Validates: Requirements 10.2**
   * 
   * For any project search with skill filters, all returned projects shall
   * require at least one of the specified skills.
   */
  it('Property 35: Project skill filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSkillIdsArbitrary(),
        fc.integer({ min: 1, max: 20 }),
        async (filterSkillIds, projectCount) => {
          // Clear stores for each test case
          projectStore.clear();

          // Create test projects with various skills
          const allSkillIds = ['skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5'];

          for (let i = 0; i < projectCount; i++) {
            // Randomly assign skills to projects
            const projectSkillIds = fc.sample(
              fc.subarray(allSkillIds, { minLength: 1, maxLength: 3 }),
              1
            )[0] ?? ['skill-1'];

            const project = createTestProject({
              required_skills: projectSkillIds.map(id => createProjectSkillRef(id, `Skill ${id}`)),
            });
            projectStore.set(project.id, project);
          }

          // Search with skill filter
          const result = await searchProjects({ skillIds: filterSkillIds });

          expect(result.success).toBe(true);
          if (!result.success) return;

          // Verify all returned projects have at least one of the filter skills
          const filterSkillIdSet = new Set(filterSkillIds);
          for (const project of result.data.items) {
            const hasMatchingSkill = project.requiredSkills.some(
              skill => skill.skillId && filterSkillIdSet.has(skill.skillId)
            );
            expect(hasMatchingSkill).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 36: Freelancer skill filter**
   * **Validates: Requirements 10.3**
   * 
   * For any freelancer search with skill filters, all returned freelancers
   * shall possess at least one of the specified skills.
   */
  it('Property 36: Freelancer skill filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSkillIdsArbitrary(),
        fc.integer({ min: 1, max: 20 }),
        async (filterSkillIds, freelancerCount) => {
          // Clear stores for each test case
          freelancerStore.clear();

          // Create test freelancers with various skills
          const allSkillIds = ['skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5'];

          for (let i = 0; i < freelancerCount; i++) {
            // Randomly assign skills to freelancers
            const freelancerSkillIds = fc.sample(
              fc.subarray(allSkillIds, { minLength: 1, maxLength: 3 }),
              1
            )[0] ?? ['skill-1'];

            const freelancer = createTestFreelancer({
              skills: freelancerSkillIds.map(id => createFreelancerSkillRef(`Skill ${id}`)),
            });
            freelancerStore.set(freelancer.id, freelancer);
          }

          // Search with skill filter
          const result = await searchFreelancers({ skillIds: filterSkillIds });

          expect(result.success).toBe(true);
          if (!result.success) return;

          // Verify all returned freelancers have at least one of the filter skills
          // Note: SkillReference only has 'name', not 'skillId', so we match by name
          const filterSkillNames = new Set(filterSkillIds.map(id => `Skill ${id}`));
          for (const freelancer of result.data.items) {
            const hasMatchingSkill = freelancer.skills.some(
              skill => filterSkillNames.has(skill.name)
            );
            expect(hasMatchingSkill).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 37: Budget range filter**
   * **Validates: Requirements 10.5**
   * 
   * For any project search with budget range filter, all returned projects
   * shall have a budget within the specified minimum and maximum values (inclusive).
   */
  it('Property 37: Budget range filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBudgetArbitrary(),
        validBudgetArbitrary(),
        fc.integer({ min: 1, max: 20 }),
        async (budget1, budget2, projectCount) => {
          // Clear stores for each test case
          projectStore.clear();

          // Ensure minBudget <= maxBudget
          const minBudget = Math.min(budget1, budget2);
          const maxBudget = Math.max(budget1, budget2);

          // Create test projects with various budgets
          for (let i = 0; i < projectCount; i++) {
            // Generate random budget between 100 and 100000
            const projectBudget = fc.sample(validBudgetArbitrary(), 1)[0] ?? 1000;

            const project = createTestProject({
              budget: projectBudget,
            });
            projectStore.set(project.id, project);
          }

          // Search with budget range filter
          const result = await searchProjects({ minBudget, maxBudget });

          expect(result.success).toBe(true);
          if (!result.success) return;

          // Verify all returned projects have budget within range
          for (const project of result.data.items) {
            expect(project.budget).toBeGreaterThanOrEqual(minBudget);
            expect(project.budget).toBeLessThanOrEqual(maxBudget);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
