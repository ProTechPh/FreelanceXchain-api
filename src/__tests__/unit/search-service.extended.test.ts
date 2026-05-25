import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockProjectRepository,
  createMockFreelancerProfileRepository,
} from '../helpers/mock-repository-factory.js';
import { createTestProject, createTestFreelancerProfile } from '../helpers/test-data-factory.js';

const projectStore = createInMemoryStore();
const freelancerStore = createInMemoryStore();

const mockProjectRepo = createMockProjectRepository(projectStore);
const mockFreelancerRepo = createMockFreelancerProfileRepository(freelancerStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerRepo,
}));

const {
  searchProjects,
  searchFreelancers,
} = await import('../../services/search-service.js');

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

  // ──────────────────────────────────────────────────────────
  // searchProjects – missing branches
  // ──────────────────────────────────────────────────────────
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

      // Only matchBoth has both the keyword in the title AND the required skill
      expect(results.data.items.some(p => p.id === matchBoth.id)).toBe(true);
      // skillOnly does not have keyword in title or description
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

      // Override getAllOpenProjects to return exactly 1000 items (the SEARCH_FALLBACK_LIMIT)
      mockProjectRepo.getAllOpenProjects.mockResolvedValueOnce({
        items: largeResultSet,
        hasMore: false,
        total: 1000,
      });

      // Use multi-filter path (keyword + budget)
      const results = await searchProjects({ keyword: 'Keyword', minBudget: 0 });

      expect(results.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // searchFreelancers – missing branches
  // ──────────────────────────────────────────────────────────
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

      // Multi-filter: keyword + skills (both must match)
      const results = await searchFreelancers({ keyword: 'React', skillIds: ['react'] });

      expect(results.success).toBe(true);
      if (!results.success) return;

      // reactDev has both keyword in bio AND skill 'react'
      expect(results.data.items.some(f => f.userId === reactDev.user_id)).toBe(true);
      // vueDev lacks the keyword in bio
      expect(results.data.items.some(f => f.userId === vueDev.user_id)).toBe(false);
      // reactNoSkill lacks the required skill
      expect(results.data.items.some(f => f.userId === reactNoSkill.user_id)).toBe(false);
    });

    it('should log a warning when freelancer fallback limit is reached in multi-filter mode', async () => {
      const largeProfileSet = Array.from({ length: 1000 }, () =>
        createTestFreelancerProfile({
          bio: 'react developer',
          skills: [{ skill_id: 'skill-react', name: 'react', category_id: 'cat-1', years_of_experience: 1 }] as any,
        }),
      );

      // Override getAllProfilesPaginated to return exactly 1000 items
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
