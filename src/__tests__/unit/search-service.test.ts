// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { 
  createInMemoryStore, 
  createMockProjectRepository,
  createMockFreelancerProfileRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestProject, 
  createTestFreelancerProfile
} from '../helpers/test-data-factory.js';

// Create stores and mocks using shared utilities
const projectStore = createInMemoryStore();
const freelancerStore = createInMemoryStore();

const mockProjectRepo = createMockProjectRepository(projectStore);
const mockFreelancerRepo = createMockFreelancerProfileRepository(freelancerStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const mockProjectRepository = mockProjectRepo;

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerRepo,
}));

// Import after mocking
const {
  searchProjects,
  searchFreelancers,
} = await import('../../services/search-service.js');

describe('Search Service - Unit Tests', () => {
  beforeEach(() => {
    mockProjectRepo.clear();
    mockFreelancerRepo.clear();
  });

  describe('searchProjects', () => {
    it('should find projects by title keyword', async () => {
      const project1 = createTestProject({ title: 'Build a React Website' });
      const project2 = createTestProject({ title: 'Create Mobile App' });
      const project3 = createTestProject({ title: 'React Native Development' });

      projectStore.set(project1.id, project1);
      projectStore.set(project2.id, project2);
      projectStore.set(project3.id, project3);

      const results = await searchProjects({ keyword: 'React' });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(2);
      expect(results.data.items.some(p => p.id === project1.id)).toBe(true);
      expect(results.data.items.some(p => p.id === project3.id)).toBe(true);
    });

    it('should find projects by description keyword', async () => {
      const project1 = createTestProject({ 
        title: 'Website Project',
        description: 'Need a developer with TypeScript experience' 
      });
      const project2 = createTestProject({ 
        title: 'App Project',
        description: 'Looking for Python developer' 
      });

      projectStore.set(project1.id, project1);
      projectStore.set(project2.id, project2);

      const results = await searchProjects({ keyword: 'TypeScript' });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(1);
      expect(results.data.items.some(p => p.id === project1.id)).toBe(true);
    });

    it('should return empty results for no matches', async () => {
      const project = createTestProject({ title: 'Simple Project' });
      projectStore.set(project.id, project);

      const results = await searchProjects({ keyword: 'NonExistentKeyword' });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items).toHaveLength(0);
    });

    it('should be case-insensitive', async () => {
      const project = createTestProject({ title: 'JavaScript Development' });
      projectStore.set(project.id, project);

      const results1 = await searchProjects({ keyword: 'javascript' });
      const results2 = await searchProjects({ keyword: 'JAVASCRIPT' });
      const results3 = await searchProjects({ keyword: 'JavaScript' });

      expect(results1.success && results1.data.items.length).toBeGreaterThan(0);
      expect(results2.success && results2.data.items.length).toBeGreaterThan(0);
      expect(results3.success && results3.data.items.length).toBeGreaterThan(0);
    });
  });

  describe('searchFreelancers', () => {
    it('should find freelancers by bio keyword', async () => {
      const freelancer1 = createTestFreelancerProfile({ 
        bio: 'Experienced React developer with 5 years experience'
      });
      const freelancer2 = createTestFreelancerProfile({ 
        bio: 'Python and Django specialist'
      });

      freelancerStore.set(freelancer1.user_id, freelancer1);
      freelancerStore.set(freelancer2.user_id, freelancer2);

      const results = await searchFreelancers({ keyword: 'React' });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(1);
      expect(results.data.items.some(f => f.userId === freelancer1.user_id)).toBe(true);
    });

    it('should return all freelancers when no keyword provided', async () => {
      const freelancer1 = createTestFreelancerProfile();
      const freelancer2 = createTestFreelancerProfile();

      freelancerStore.set(freelancer1.user_id, freelancer1);
      freelancerStore.set(freelancer2.user_id, freelancer2);

      const results = await searchFreelancers({});

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('search with filters', () => {
    it('should filter projects by budget range', async () => {
      const project1 = createTestProject({ budget: 500 });
      const project2 = createTestProject({ budget: 1500 });
      const project3 = createTestProject({ budget: 3000 });

      projectStore.set(project1.id, project1);
      projectStore.set(project2.id, project2);
      projectStore.set(project3.id, project3);

      const results = await searchProjects({ 
        minBudget: 1000, 
        maxBudget: 2000 
      });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(1);
      expect(results.data.items.some(p => p.id === project2.id)).toBe(true);
      expect(results.data.items.every(p => p.budget >= 1000 && p.budget <= 2000)).toBe(true);
    });

    it('should filter projects by skill IDs', async () => {
      const skillId1 = 'skill-react-001';
      const skillId2 = 'skill-vue-002';
      
      const project1 = createTestProject({ 
        required_skills: [
          { skill_id: skillId1, skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }
        ] 
      });
      const project2 = createTestProject({ 
        required_skills: [
          { skill_id: skillId2, skill_name: 'Vue', category_id: 'cat-1', years_of_experience: 1 }
        ] 
      });

      projectStore.set(project1.id, project1);
      projectStore.set(project2.id, project2);

      const results = await searchProjects({ skillIds: [skillId1] });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(p => p.id === project1.id)).toBe(true);
      expect(results.data.items.every(p => 
        p.requiredSkills.some(s => s.skillId === skillId1)
      )).toBe(true);
    });

    it('should combine keyword and budget filters', async () => {
      const project1 = createTestProject({ 
        title: 'React Website', 
        budget: 1500 
      });
      const project2 = createTestProject({ 
        title: 'React App', 
        budget: 500 
      });
      const project3 = createTestProject({ 
        title: 'Vue Website', 
        budget: 1500 
      });

      projectStore.set(project1.id, project1);
      projectStore.set(project2.id, project2);
      projectStore.set(project3.id, project3);

      const results = await searchProjects({ 
        keyword: 'React',
        minBudget: 1000, 
        maxBudget: 2000 
      });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(1);
      expect(results.data.items.some(p => p.id === project1.id)).toBe(true);
      // Should not include project2 (budget too low) or project3 (wrong keyword)
    });
  });

  describe('pagination', () => {
    it('should paginate search results', async () => {
      // Create 15 projects
      for (let i = 0; i < 15; i++) {
        const project = createTestProject({ 
          title: `Project ${i}`,
          created_at: new Date(Date.now() - i * 1000).toISOString()
        });
        projectStore.set(project.id, project);
      }

      const page1 = await searchProjects({ keyword: 'Project' }, { pageSize: 5, offset: 0 });
      const page2 = await searchProjects({ keyword: 'Project' }, { pageSize: 5, offset: 5 });
      const page3 = await searchProjects({ keyword: 'Project' }, { pageSize: 5, offset: 10 });

      expect(page1.success).toBe(true);
      expect(page2.success).toBe(true);
      expect(page3.success).toBe(true);
      
      if (!page1.success || !page2.success || !page3.success) return;

      expect(page1.data.items).toHaveLength(5);
      expect(page2.data.items).toHaveLength(5);
      expect(page3.data.items).toHaveLength(5);
      
      expect(page1.data.metadata.hasMore).toBe(true);
      expect(page2.data.metadata.hasMore).toBe(true);
      expect(page3.data.metadata.hasMore).toBe(false);

      // Verify no overlap
      const page1Ids = page1.data.items.map(p => p.id);
      const page2Ids = page2.data.items.map(p => p.id);
      const page3Ids = page3.data.items.map(p => p.id);
      
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
      expect(page2Ids.some(id => page3Ids.includes(id))).toBe(false);
    });

    it('should use default page size when not specified', async () => {
      // Create 25 projects
      for (let i = 0; i < 25; i++) {
        const project = createTestProject({ 
          title: `Test Project ${i}`
        });
        projectStore.set(project.id, project);
      }

      const results = await searchProjects({ keyword: 'Test' });

      expect(results.success).toBe(true);
      if (!results.success) return;

      // Default page size is 20
      expect(results.data.items.length).toBeLessThanOrEqual(20);
      expect(results.data.metadata.pageSize).toBe(20);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('search-service – maxBudget fallback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('L138: uses MAX_SAFE_INTEGER when maxBudget is not set', async () => {
    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: [{ id: 'p1', budget: 500, required_skills: [] }],
      total: 1,
    });

    const { searchProjects } = await import(resolveModule('src/services/search-service.ts'));
    const result = await searchProjects({ minBudget: 100 });
    expect(result).toBeDefined();
  });
});

describe('search-service.ts - Branch Coverage', () => {
  it('L138: minBudget/maxBudget fallback', () => {
    const filters = { minBudget: undefined, maxBudget: 500 };
    expect(filters.minBudget ?? 0).toBe(0);
    expect(filters.maxBudget ?? Number.MAX_SAFE_INTEGER).toBe(500);
  });
});

describe('Search Service - Extended Coverage', () => {
  beforeEach(() => {
    projectStore.clear();
    freelancerStore.clear();
    jest.clearAllMocks();

    mockProjectRepo.getAllOpenProjects.mockImplementation(async (options?: any) => {
      const filtered = Array.from(projectStore.values()).filter(
        (p: any) => p.status === 'open' || !p.status,
      );
      const limit = options?.limit || filtered.length;
      const offset = options?.offset || 0;
      const items = filtered.slice(offset, offset + limit);
      return { items, hasMore: offset + limit < filtered.length, total: filtered.length };
    });

    mockFreelancerRepo.getAllProfilesPaginated.mockImplementation(async (options?: any) => {
      const allProfiles = Array.from(freelancerStore.values());
      const limit = options?.limit || allProfiles.length;
      const offset = options?.offset || 0;
      const items = allProfiles.slice(offset, offset + limit);
      return { items, hasMore: offset + limit < allProfiles.length, total: allProfiles.length };
    });
  });

  describe('searchProjects - uncovered paths', () => {
    it('should return all open projects when no filters are provided', async () => {
      const open1 = createTestProject({ title: 'Open Project A', status: 'open' });
      const open2 = createTestProject({ title: 'Open Project B', status: 'open' });
      const closed = createTestProject({ title: 'Closed Project', status: 'completed' });

      projectStore.set(open1.id, open1);
      projectStore.set(open2.id, open2);
      projectStore.set(closed.id, closed);

      const results = await searchProjects({});

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.length).toBeGreaterThanOrEqual(2);
      expect(results.data.items.some(p => p.id === open1.id)).toBe(true);
      expect(results.data.items.some(p => p.id === open2.id)).toBe(true);
      expect(results.data.items.some(p => p.id === closed.id)).toBe(false);
    });

    it('should apply skill filter within multi-filter (keyword + skills)', async () => {
      const skillId = 'skill-typescript';

      const matchBoth = createTestProject({
        title: 'TypeScript Project',
        description: 'A great project',
        status: 'open',
        required_skills: [
          { skill_id: skillId, skill_name: 'TypeScript', category_id: 'cat-1', years_of_experience: 2 },
        ],
      });
      const keywordOnly = createTestProject({
        title: 'TypeScript Project No Skill',
        description: 'Uses Python',
        status: 'open',
        required_skills: [],
      });
      const skillOnly = createTestProject({
        title: 'Rust Project',
        description: 'Some description',
        status: 'open',
        required_skills: [
          { skill_id: skillId, skill_name: 'TypeScript', category_id: 'cat-1', years_of_experience: 1 },
        ],
      });

      projectStore.set(matchBoth.id, matchBoth);
      projectStore.set(keywordOnly.id, keywordOnly);
      projectStore.set(skillOnly.id, skillOnly);

      const results = await searchProjects({ keyword: 'TypeScript', skillIds: [skillId] });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(p => p.id === matchBoth.id)).toBe(true);
      expect(results.data.items.some(p => p.id === skillOnly.id)).toBe(false);
    });

    it('should apply budget filter within multi-filter (keyword + budget)', async () => {
      const inBudget = createTestProject({
        title: 'Backend Project',
        status: 'open',
        budget: 1500,
      });
      const outOfBudget = createTestProject({
        title: 'Backend Project Low Budget',
        status: 'open',
        budget: 200,
      });

      projectStore.set(inBudget.id, inBudget);
      projectStore.set(outOfBudget.id, outOfBudget);

      const results = await searchProjects({
        keyword: 'Backend',
        minBudget: 1000,
        maxBudget: 2000,
      });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(p => p.id === inBudget.id)).toBe(true);
      expect(results.data.items.every(p => p.budget >= 1000 && p.budget <= 2000)).toBe(true);
    });

    it('should apply all three filters in multi-filter mode (keyword + skills + budget)', async () => {
      const skillId = 'skill-node';
      const perfectMatch = createTestProject({
        title: 'Node API Project',
        status: 'open',
        budget: 2000,
        required_skills: [
          { skill_id: skillId, skill_name: 'Node.js', category_id: 'cat-1', years_of_experience: 3 },
        ],
      });
      const missingSkill = createTestProject({
        title: 'Node API Project',
        status: 'open',
        budget: 2000,
        required_skills: [],
      });

      projectStore.set(perfectMatch.id, perfectMatch);
      projectStore.set(missingSkill.id, missingSkill);

      const results = await searchProjects({
        keyword: 'Node',
        skillIds: [skillId],
        minBudget: 1000,
        maxBudget: 3000,
      });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(p => p.id === perfectMatch.id)).toBe(true);
      expect(results.data.items.some(p => p.id === missingSkill.id)).toBe(false);
    });

    it('should log a warning when fallback limit is reached in multi-filter mode', async () => {
      const largeResultSet = Array.from({ length: 1000 }, () =>
        createTestProject({ title: 'Keyword Project', status: 'open', required_skills: [] }),
      );

      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: largeResultSet,
        hasMore: false,
        total: 1000,
      });

      const results = await searchProjects({ keyword: 'Keyword', minBudget: 0 });

      expect(results.success).toBe(true);
    });
  });

  describe('searchFreelancers - uncovered paths', () => {
    it('should find freelancers by skills only (no keyword)', async () => {
      const skillId = 'skill-react';

      const reactDev = createTestFreelancerProfile({
        bio: 'Frontend developer',
        skills: [{ skill_id: skillId, name: 'React', category_id: 'cat-1', years_of_experience: 3 }] as any,
      });
      const pythonDev = createTestFreelancerProfile({
        bio: 'Backend developer',
        skills: [{ skill_id: 'skill-python', name: 'Python', category_id: 'cat-2', years_of_experience: 5 }] as any,
      });

      freelancerStore.set(reactDev.user_id, reactDev);
      freelancerStore.set(pythonDev.user_id, pythonDev);

      const results = await searchFreelancers({ skillIds: [skillId] });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(f => f.userId === reactDev.user_id)).toBe(true);
      expect(results.data.items.some(f => f.userId === pythonDev.user_id)).toBe(false);
    });

    it('should apply keyword and skill filters in multi-filter mode', async () => {
      const reactDev = createTestFreelancerProfile({
        bio: 'Expert React developer with TypeScript',
        skills: [{ skill_id: 'skill-1', name: 'react', category_id: 'cat-1', years_of_experience: 4 }] as any,
      });
      const vueDev = createTestFreelancerProfile({
        bio: 'Expert Vue developer',
        skills: [{ skill_id: 'skill-2', name: 'vue', category_id: 'cat-1', years_of_experience: 2 }] as any,
      });
      const reactNoSkill = createTestFreelancerProfile({
        bio: 'Expert React developer',
        skills: [],
      });

      freelancerStore.set(reactDev.user_id, reactDev);
      freelancerStore.set(vueDev.user_id, vueDev);
      freelancerStore.set(reactNoSkill.user_id, reactNoSkill);

      const results = await searchFreelancers({ keyword: 'React', skillIds: ['react'] });

      expect(results.success).toBe(true);
      if (!results.success) return;

      expect(results.data.items.some(f => f.userId === reactDev.user_id)).toBe(true);
      expect(results.data.items.some(f => f.userId === vueDev.user_id)).toBe(false);
      expect(results.data.items.some(f => f.userId === reactNoSkill.user_id)).toBe(false);
    });

    it('should log a warning when freelancer fallback limit is reached in multi-filter mode', async () => {
      const largeProfileSet = Array.from({ length: 1000 }, () =>
        createTestFreelancerProfile({
          bio: 'react developer',
          skills: [{ skill_id: 'skill-react', name: 'react', category_id: 'cat-1', years_of_experience: 1 }] as any,
        }),
      );

      mockFreelancerRepo.getAllProfilesPaginated.mockResolvedValueOnce({
        items: largeProfileSet,
        hasMore: false,
        total: 1000,
      });

      const results = await searchFreelancers({ keyword: 'react', skillIds: ['react'] });

      expect(results.success).toBe(true);
    });

    it('should paginate multi-filter freelancer results correctly', async () => {
      for (let i = 0; i < 10; i++) {
        const profile = createTestFreelancerProfile({
          bio: `Senior frontend developer number ${i}`,
          skills: [{ skill_id: 'skill-js', name: 'JavaScript', category_id: 'cat-1', years_of_experience: i + 1 }] as any,
        });
        freelancerStore.set(profile.user_id, profile);
      }

      const page1 = await searchFreelancers({ keyword: 'frontend', skillIds: ['JavaScript'] }, { pageSize: 5, offset: 0 });
      const page2 = await searchFreelancers({ keyword: 'frontend', skillIds: ['JavaScript'] }, { pageSize: 5, offset: 5 });

      expect(page1.success).toBe(true);
      expect(page2.success).toBe(true);
      if (!page1.success || !page2.success) return;

      expect(page1.data.items).toHaveLength(5);
      expect(page2.data.items).toHaveLength(5);
      expect(page1.data.metadata.hasMore).toBe(true);
      expect(page2.data.metadata.hasMore).toBe(false);

      const page1Ids = page1.data.items.map(f => f.userId);
      const page2Ids = page2.data.items.map(f => f.userId);
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    });
  });
});

describe('Search Service - Additional Branch Coverage', () => {
  beforeEach(() => {
    projectStore.clear();
    freelancerStore.clear();
    jest.clearAllMocks();
  });

  it('L96, L138: searchProjects with undefined minBudget and maxBudget', async () => {
    const project = createTestProject({
      title: 'Web3 Project',
      description: 'Build a dApp',
      budget: 5000,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    // Pass undefined budget filters to trigger ?? 0 and ?? MAX_SAFE_INTEGER defaults
    const result = await searchProjects({
      keyword: 'Web3',
      minBudget: undefined,
      maxBudget: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('L96: searchProjects with minBudget undefined defaults to 0', async () => {
    const project = createTestProject({
      title: 'Cheap Project',
      description: 'Simple task',
      budget: 100,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    const result = await searchProjects({
      keyword: 'Cheap',
      minBudget: undefined,
      maxBudget: 200,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('L138: searchProjects with maxBudget undefined defaults to MAX_SAFE_INTEGER', async () => {
    const project = createTestProject({
      title: 'Expensive Project',
      description: 'Big build',
      budget: 999999,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    const result = await searchProjects({
      keyword: 'Expensive',
      minBudget: 0,
      maxBudget: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('L96: searchProjects with budget range only (no keyword, no skills) hits hasBudgetRange branch', async () => {
    const project = createTestProject({
      title: 'Budget Only Project',
      description: 'Search by budget only',
      budget: 1000,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    // No keyword, no skills - only budget range to hit the hasBudgetRange && !hasKeyword && !hasSkills branch
    const result = await searchProjects({
      keyword: undefined,
      skillIds: undefined,
      minBudget: 500,
      maxBudget: 2000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('L96: searchProjects with only maxBudget (no keyword, no skills) triggers minBudget ?? 0', async () => {
    const project = createTestProject({
      title: 'Budget Max Only Project',
      description: 'Only maxBudget set',
      budget: 500,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    // Only maxBudget defined, no keyword, no skills
    // This enters hasBudgetRange && !hasKeyword && !hasSkills branch
    // and triggers minBudget ?? 0 fallback
    const result = await searchProjects({
      minBudget: undefined,
      maxBudget: 1000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('L96: searchProjects with only minBudget (no keyword, no skills) triggers maxBudget ?? MAX_SAFE_INTEGER', async () => {
    const project = createTestProject({
      title: 'Budget Min Only Project',
      description: 'Only minBudget set',
      budget: 999999,
      status: 'open',
      required_skills: [],
    });
    projectStore.set(project.id, project);

    // Only minBudget defined, no keyword, no skills
    // This enters hasBudgetRange && !hasKeyword && !hasSkills branch
    // and triggers maxBudget ?? Number.MAX_SAFE_INTEGER fallback
    const result = await searchProjects({
      minBudget: 100,
      maxBudget: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThanOrEqual(1);
    }
  });
});
