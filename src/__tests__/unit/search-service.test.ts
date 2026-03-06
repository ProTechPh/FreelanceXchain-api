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
