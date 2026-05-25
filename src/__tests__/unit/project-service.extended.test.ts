import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { createInMemoryStore, createMockProjectRepository } from '../helpers/mock-repository-factory.js';
import { createTestProject, createTestSkill, createTestMilestone } from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const projectStore = createInMemoryStore();
const proposalStore = createInMemoryStore();
const skillStore = createInMemoryStore();

const mockProjectRepo = createMockProjectRepository(projectStore);

const mockProposalRepo = {
  hasAcceptedProposal: jest.fn<any>(async (projectId: string) => {
    for (const p of proposalStore.values()) {
      const proposal = p as any;
      if (proposal.project_id === projectId && proposal.status === 'accepted') return true;
    }
    return false;
  }),
  getProposalCountsByProjects: jest.fn<any>(async () => new Map<string, number>()),
};

const mockSkillRepo = {
  findSkillById: jest.fn<any>(async (id: string) => skillStore.get(id) ?? null),
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

const {
  createProject,
  updateProject,
  addMilestones,
  setMilestones,
} = await import('../../services/project-service.js');

const EMP = 'emp-1';
const SKILL_ID = 'skill-active';

function makeProject(overrides: Record<string, any> = {}) {
  const p = createTestProject({ employer_id: EMP, status: 'open', budget: 1000, milestones: [], ...overrides });
  projectStore.set(p.id, p);
  return p;
}

function addAcceptedProposal(projectId: string) {
  const id = generateId();
  const proposal: any = { id, project_id: projectId, status: 'accepted', freelancer_id: 'fl-1' };
  proposalStore.set(id, proposal);
}

function resetProposalMock(hasAccepted = false) {
  mockProposalRepo.hasAcceptedProposal.mockImplementation(async () => hasAccepted);
}

describe('Project Service - Extended Coverage', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();
    jest.clearAllMocks();

    mockProposalRepo.hasAcceptedProposal.mockImplementation(async (projectId: string) => {
      for (const p of proposalStore.values()) {
        const proposal = p as any;
        if (proposal.project_id === projectId && proposal.status === 'accepted') return true;
      }
      return false;
    });

    mockSkillRepo.findSkillById.mockImplementation(async (id: string) => skillStore.get(id) ?? null);

    const skill = createTestSkill({ id: SKILL_ID, name: 'JavaScript', category_id: 'cat-1', is_active: true });
    skillStore.set(skill.id, skill);
  });

  describe('createProject - validation errors', () => {
    it('should return VALIDATION_ERROR for too many attachments', async () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
        url: `https://abc.appwrite.co/storage/v1/object/file${i}.pdf`,
        filename: `file${i}.pdf`,
        size: 1024,
        mimeType: 'application/pdf',
      }));
      const result = await createProject(EMP, {
        title: 'My Project',
        description: 'Description of this project here.',
        requiredSkills: [{ skillId: SKILL_ID }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
        attachments,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return INVALID_SKILL when skill ID does not exist', async () => {
      const result = await createProject(EMP, {
        title: 'My Project',
        description: 'Description of this project here.',
        requiredSkills: [{ skillId: 'nonexistent-skill' }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_SKILL');
        expect((result.error as any).details).toContain('nonexistent-skill');
      }
    });

    it('should return INVALID_SKILL when skill is inactive', async () => {
      const inactiveSkill = createTestSkill({ id: 'inactive-skill', is_active: false });
      skillStore.set(inactiveSkill.id, inactiveSkill);
      const result = await createProject(EMP, {
        title: 'My Project',
        description: 'Description of this project here.',
        requiredSkills: [{ skillId: 'inactive-skill' }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_SKILL');
    });

    it('should return VALIDATION_ERROR when rush fee is 0 with isRush', async () => {
      const result = await createProject(EMP, {
        title: 'My Project',
        description: 'Description of this project here.',
        requiredSkills: [{ skillId: SKILL_ID }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
        isRush: true,
        rushFeePercentage: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return VALIDATION_ERROR when rush fee exceeds 100', async () => {
      const result = await createProject(EMP, {
        title: 'My Project',
        description: 'Description of this project here.',
        requiredSkills: [{ skillId: SKILL_ID }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
        isRush: true,
        rushFeePercentage: 101,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should succeed with isRush but no rushFeePercentage provided', async () => {
      const result = await createProject(EMP, {
        title: 'Rush Project',
        description: 'A rush project description here.',
        requiredSkills: [{ skillId: SKILL_ID }],
        budget: 5000,
        deadline: new Date(Date.now() + 86400_000 * 30).toISOString(),
        isRush: true,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.is_rush).toBe(true);
    });
  });

  describe('updateProject - validation and error paths', () => {
    it('should return NOT_FOUND when project does not exist', async () => {
      const result = await updateProject('nonexistent', EMP, { title: 'New Title' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INVALID_SKILL when updated skill does not exist', async () => {
      const p = makeProject();
      const result = await updateProject(p.id, EMP, {
        requiredSkills: [{ skillId: 'ghost-skill' }],
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_SKILL');
    });

    it('should return MILESTONE_SUM_MISMATCH when budget change breaks milestone total', async () => {
      const milestones = [createTestMilestone({ amount: 500 }), createTestMilestone({ amount: 500 })];
      const p = makeProject({ budget: 1000, milestones });
      const result = await updateProject(p.id, EMP, { budget: 2000 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('MILESTONE_SUM_MISMATCH');
    });

    it('should return INVALID_STATUS_TRANSITION from completed to open', async () => {
      const p = makeProject({ status: 'completed' });
      const result = await updateProject(p.id, EMP, { status: 'open' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should return INVALID_STATUS_TRANSITION from cancelled to open', async () => {
      const p = makeProject({ status: 'cancelled' });
      const result = await updateProject(p.id, EMP, { status: 'open' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should return VALIDATION_ERROR when rush fee is 0 with isRush on update', async () => {
      const p = makeProject();
      const result = await updateProject(p.id, EMP, { isRush: true, rushFeePercentage: 0 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return VALIDATION_ERROR when rush fee > 100 on update', async () => {
      const p = makeProject();
      const result = await updateProject(p.id, EMP, { isRush: true, rushFeePercentage: 200 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return VALIDATION_ERROR when freelancer limit < 1 on update', async () => {
      const p = makeProject();
      const result = await updateProject(p.id, EMP, { freelancerLimit: 0 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return VALIDATION_ERROR when freelancer limit is non-integer on update', async () => {
      const p = makeProject();
      const result = await updateProject(p.id, EMP, { freelancerLimit: 1.5 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return UPDATE_FAILED when repository returns null', async () => {
      const p = makeProject();
      (mockProjectRepo.updateProject as any).mockResolvedValueOnce(null);
      const result = await updateProject(p.id, EMP, { title: 'New Title' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should allow valid status transitions (open to in_progress)', async () => {
      const p = makeProject({ status: 'open' });
      const result = await updateProject(p.id, EMP, { status: 'in_progress' });
      expect(result.success).toBe(true);
    });

    it('should allow valid status transitions (in_progress to completed)', async () => {
      const p = makeProject({ status: 'in_progress' });
      const result = await updateProject(p.id, EMP, { status: 'completed' });
      expect(result.success).toBe(true);
    });

    it('should allow cancellation from open', async () => {
      const p = makeProject({ status: 'open' });
      const result = await updateProject(p.id, EMP, { status: 'cancelled' });
      expect(result.success).toBe(true);
    });
  });

  describe('addMilestones - error paths', () => {
    it('should return PROJECT_LOCKED when project has accepted proposal', async () => {
      const p = makeProject({ budget: 1000 });
      addAcceptedProposal(p.id);
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await addMilestones(p.id, EMP, [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROJECT_LOCKED');
    });

    it('should return MILESTONE_SUM_MISMATCH when milestones do not sum to budget', async () => {
      const p = makeProject({ budget: 1000, milestones: [] });
      const milestones = [
        { title: 'Phase 1', description: 'Work description', amount: 400, dueDate: new Date(Date.now() + 86400_000).toISOString() },
        { title: 'Phase 2', description: 'More work', amount: 400, dueDate: new Date(Date.now() + 86400_000 * 2).toISOString() },
      ];
      const result = await addMilestones(p.id, EMP, milestones);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('MILESTONE_SUM_MISMATCH');
    });

    it('should return UPDATE_FAILED when repository fails to update', async () => {
      const p = makeProject({ budget: 1000, milestones: [] });
      (mockProjectRepo.updateProject as any).mockResolvedValueOnce(null);
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await addMilestones(p.id, EMP, [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should add milestones when sum matches existing milestones + budget', async () => {
      const existing = createTestMilestone({ amount: 500 });
      const p = makeProject({ budget: 1000, milestones: [existing] });
      const newMilestone = {
        title: 'Phase 2',
        description: 'Second phase work',
        amount: 500,
        dueDate: new Date(Date.now() + 86400_000 * 2).toISOString(),
      };
      const result = await addMilestones(p.id, EMP, [newMilestone]);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.milestones.length).toBe(2);
    });
  });

  describe('setMilestones - error paths', () => {
    it('should return NOT_FOUND when project does not exist', async () => {
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await setMilestones('nonexistent', EMP, [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when employer does not own the project', async () => {
      const p = makeProject();
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await setMilestones(p.id, 'wrong-emp', [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return PROJECT_LOCKED when project has accepted proposal', async () => {
      const p = makeProject({ budget: 1000 });
      addAcceptedProposal(p.id);
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await setMilestones(p.id, EMP, [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PROJECT_LOCKED');
    });

    it('should return UPDATE_FAILED when repository fails to update', async () => {
      const p = makeProject({ budget: 1000, milestones: [] });
      (mockProjectRepo.updateProject as any).mockResolvedValueOnce(null);
      const milestone = {
        title: 'Phase 1',
        description: 'Work description',
        amount: 1000,
        dueDate: new Date(Date.now() + 86400_000).toISOString(),
      };
      const result = await setMilestones(p.id, EMP, [milestone]);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});
