// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import {
  createInMemoryStore,
  createMockProjectRepository,
} from '../helpers/mock-repository-factory.js';
import { createTestProject, createTestSkill } from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const projectStore = createInMemoryStore();
const proposalStore = createInMemoryStore();
const skillStore = createInMemoryStore();

const mockProjectRepo = createMockProjectRepository(projectStore);

const mockProposalRepo = {
  hasAcceptedProposal: jest.fn(async (projectId: string) => {
    for (const p of proposalStore.values()) {
      const proposal = p as any;
      if (proposal.project_id === projectId && proposal.status === 'accepted') return true;
    }
    return false;
  }),
  getProposalCountsByProjects: jest.fn(async () => new Map()),
};

const mockSkillRepo = {
  findSkillById: jest.fn(async (id: string) => skillStore.get(id) ?? null),
};

const mockContractRepo = {
  getContractsByProject: jest.fn(async () => []),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

const {
  setMilestones,
  listProjectsBySkills,
  listProjectsByBudgetRange,
  listProjectsByCategory,
  listProjectsByMultipleCategories,
} = await import('../../services/project-service.js');

const EMP = 'emp-1';
const SKILL_ID = 'skill-1';
const CATEGORY_ID = 'cat-1';

function makeProject(overrides = {}) {
  const p = createTestProject({ employer_id: EMP, status: 'open', budget: 1000, milestones: [], ...overrides });
  projectStore.set(p.id, p);
  return p;
}

describe('Project Service - Extended Coverage (setMilestones, search/filter)', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();
    jest.clearAllMocks();

    const skill = createTestSkill({ id: SKILL_ID, name: 'TypeScript', category_id: CATEGORY_ID, is_active: true });
    skillStore.set(skill.id, skill);
  });

  describe('setMilestones', () => {
    it('should succeed when milestones sum matches budget', async () => {
      const p = makeProject({ budget: 1000 });
      const milestones = [
        { title: 'Phase 1', description: 'First phase', amount: 600, dueDate: new Date(Date.now() + 86400_000).toISOString() },
        { title: 'Phase 2', description: 'Second phase', amount: 400, dueDate: new Date(Date.now() + 86400_000 * 2).toISOString() },
      ];

      const result = await setMilestones(p.id, EMP, milestones);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.milestones).toHaveLength(2);
    });

    it('should return NOT_FOUND when project does not exist', async () => {
      const milestones = [
        { title: 'Phase 1', description: 'Desc', amount: 1000, dueDate: new Date(Date.now() + 86400_000).toISOString() },
      ];
      const result = await setMilestones('nonexistent', EMP, milestones);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when employer does not own project', async () => {
      const p = makeProject();
      const milestones = [
        { title: 'Phase 1', description: 'Desc', amount: 1000, dueDate: new Date(Date.now() + 86400_000).toISOString() },
      ];
      const result = await setMilestones(p.id, 'wrong-employer', milestones);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return MILESTONE_SUM_MISMATCH when amounts do not match budget', async () => {
      const p = makeProject({ budget: 1000 });
      const milestones = [
        { title: 'Phase 1', description: 'Desc', amount: 300, dueDate: new Date(Date.now() + 86400_000).toISOString() },
        { title: 'Phase 2', description: 'Desc', amount: 300, dueDate: new Date(Date.now() + 86400_000 * 2).toISOString() },
      ];

      const result = await setMilestones(p.id, EMP, milestones);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('MILESTONE_SUM_MISMATCH');
    });

    it('should return PROJECT_LOCKED when project has accepted proposals', async () => {
      const p = makeProject({ budget: 1000 });
      const proposalId = generateId();
      proposalStore.set(proposalId, { id: proposalId, project_id: p.id, status: 'accepted', freelancer_id: 'fl-1' });

      const milestones = [
        { title: 'Phase 1', description: 'Desc', amount: 1000, dueDate: new Date(Date.now() + 86400_000).toISOString() },
      ];

      const result = await setMilestones(p.id, EMP, milestones);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROJECT_LOCKED');
    });
  });

  describe('listProjectsBySkills', () => {
    it('should return projects matching skill IDs', async () => {
      makeProject({
        required_skills: [{ skill_id: SKILL_ID, skill_name: 'TypeScript', category_id: CATEGORY_ID, years_of_experience: 0 }],
      });
      makeProject({
        required_skills: [{ skill_id: 'other-skill', skill_name: 'Python', category_id: 'cat-2', years_of_experience: 0 }],
      });

      const result = await listProjectsBySkills([SKILL_ID]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
      }
    });

    it('should return empty results when no projects match', async () => {
      makeProject({ required_skills: [] });

      const result = await listProjectsBySkills(['nonexistent-skill']);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });

  describe('listProjectsByBudgetRange', () => {
    it('should return projects within budget range', async () => {
      makeProject({ budget: 500 });
      makeProject({ budget: 1500 });
      makeProject({ budget: 3000 });

      const result = await listProjectsByBudgetRange(400, 2000);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });

    it('should return empty when no projects in range', async () => {
      makeProject({ budget: 100 });

      const result = await listProjectsByBudgetRange(5000, 10000);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });

  describe('listProjectsByCategory', () => {
    it('should return open projects matching category', async () => {
      makeProject({
        status: 'open',
        required_skills: [{ skill_id: SKILL_ID, skill_name: 'TypeScript', category_id: CATEGORY_ID, years_of_experience: 0 }],
      });
      makeProject({
        status: 'open',
        required_skills: [{ skill_id: 'other', skill_name: 'Go', category_id: 'cat-other', years_of_experience: 0 }],
      });

      const result = await listProjectsByCategory(CATEGORY_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
      }
    });

    it('should return empty when no projects match category', async () => {
      makeProject({ status: 'open', required_skills: [] });

      const result = await listProjectsByCategory('nonexistent-cat');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });

  describe('listProjectsByMultipleCategories', () => {
    it('should return projects matching any of the categories', async () => {
      makeProject({
        status: 'open',
        required_skills: [{ skill_id: SKILL_ID, skill_name: 'TypeScript', category_id: CATEGORY_ID, years_of_experience: 0 }],
      });
      makeProject({
        status: 'open',
        required_skills: [{ skill_id: 'sk2', skill_name: 'Rust', category_id: 'cat-2', years_of_experience: 0 }],
      });
      makeProject({
        status: 'open',
        required_skills: [{ skill_id: 'sk3', skill_name: 'Java', category_id: 'cat-3', years_of_experience: 0 }],
      });

      const result = await listProjectsByMultipleCategories([CATEGORY_ID, 'cat-2']);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });

    it('should return empty when no categories match', async () => {
      makeProject({ status: 'open', required_skills: [] });

      const result = await listProjectsByMultipleCategories(['nonexistent-1', 'nonexistent-2']);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });

    it('should return empty for empty category array', async () => {
      makeProject({ status: 'open', required_skills: [{ skill_id: SKILL_ID, skill_name: 'TS', category_id: CATEGORY_ID, years_of_experience: 0 }] });

      const result = await listProjectsByMultipleCategories([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });
});
