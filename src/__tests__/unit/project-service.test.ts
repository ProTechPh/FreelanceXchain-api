import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore,
  createMockProjectRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestProject,
  createTestSkill
} from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';
import { ProposalEntity } from '../../repositories/proposal-repository.js';

// Create stores and mocks
const projectStore = createInMemoryStore();
const proposalStore = createInMemoryStore();
const skillStore = createInMemoryStore();

const mockProjectRepo = createMockProjectRepository(projectStore);

// Add getProjectsByEmployer method
mockProjectRepo.getProjectsByEmployer = jest.fn<any>(async (employerId: string) => {
  const items = Array.from(projectStore.values()).filter((p: any) => p.employer_id === employerId);
  return { items, hasMore: false };
});

// Create proposal repository mock
const mockProposalRepo = {
  hasAcceptedProposal: jest.fn<any>(async (projectId: string) => {
    for (const proposal of proposalStore.values()) {
      const p = proposal as ProposalEntity;
      if (p.project_id === projectId && p.status === 'accepted') {
        return true;
      }
    }
    return false;
  }),
  getProposalCountByProject: jest.fn<any>(async (projectId: string) => {
    let count = 0;
    for (const proposal of proposalStore.values()) {
      const p = proposal as ProposalEntity;
      if (p.project_id === projectId) count++;
    }
    return count;
  }),
};

// Create skill repository mock
const mockSkillRepo = {
  findSkillById: jest.fn<any>(async (id: string) => {
    return skillStore.get(id) ?? null;
  }),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepo,
}));

// Import after mocking
const { createProject, getProjectById, updateProject, setMilestones } = await import('../../services/project-service.js');

// Helper to add accepted proposal
function addAcceptedProposal(projectId: string, freelancerId: string): ProposalEntity {
  const proposal: ProposalEntity = {
    id: generateId(),
    project_id: projectId,
    freelancer_id: freelancerId,
    cover_letter: 'Test cover letter',
    proposed_rate: 50,
    estimated_duration: 30,
    status: 'accepted',
    attachments: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  proposalStore.set(proposal.id, proposal);
  return proposal;
}

// Custom arbitraries for property-based testing
const validTitleArbitrary = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{5,50}$/);
const validDescriptionArbitrary = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{20,200}$/);
const validBudgetArbitrary = () => fc.integer({ min: 100, max: 100000 });
const validDeadlineArbitrary = () =>
  fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
    .map(d => d.toISOString());

// Generate milestones that sum to a specific budget
const validMilestonesArbitrary = (totalBudget: number, count: number) => {
  if (count <= 0) return fc.constant([]);
  return fc.array(
    fc.record({
      title: fc.stringMatching(/^Milestone [0-9]+$/),
      description: fc.stringMatching(/^[A-Za-z ]{10,50}$/),
      dueDate: validDeadlineArbitrary(),
    }),
    { minLength: count, maxLength: count }
  ).map(milestones => {
    const baseAmount = Math.floor(totalBudget / count);
    const remainder = totalBudget - (baseAmount * count);
    return milestones.map((m, i) => ({
      ...m,
      amount: i === count - 1 ? baseAmount + remainder : baseAmount,
    }));
  });
};

// Generate milestones that DON'T sum to budget
const invalidMilestonesArbitrary = (totalBudget: number) =>
  fc.array(
    fc.record({
      title: fc.stringMatching(/^Milestone [0-9]+$/),
      description: fc.stringMatching(/^[A-Za-z ]{10,50}$/),
      amount: fc.integer({ min: 1, max: Math.floor(totalBudget / 2) }),
      dueDate: validDeadlineArbitrary(),
    }),
    { minLength: 2, maxLength: 5 }
  ).filter(milestones => {
    const sum = milestones.reduce((acc, m) => acc + m.amount, 0);
    return sum !== totalBudget;
  });

describe('Project Service - Property-Based Tests', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();

    // Set up test skills
    const skill1 = createTestSkill({ id: 'skill-1', name: 'JavaScript', category_id: 'cat-1' });
    const skill2 = createTestSkill({ id: 'skill-2', name: 'TypeScript', category_id: 'cat-1' });
    const skill3 = createTestSkill({ id: 'skill-3', name: 'React', category_id: 'cat-2' });
    
    skillStore.set(skill1.id, skill1);
    skillStore.set(skill2.id, skill2);
    skillStore.set(skill3.id, skill3);
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 7: Project creation and retrieval**
   * **Validates: Requirements 3.1, 3.5**
   * 
   * For any valid project data submitted by an employer, creating and then
   * retrieving the project shall return equivalent data with correct status
   * and zero proposal count initially.
   */
  it('Property 7: Project creation and retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        fc.constantFrom(['skill-1'], ['skill-2'], ['skill-1', 'skill-2'], ['skill-1', 'skill-3']),
        async (employerId, title, description, budget, deadline, skillIds) => {
          projectStore.clear();
          proposalStore.clear();

          const createInput = {
            title,
            description,
            requiredSkills: skillIds.map(id => ({ skillId: id })),
            budget,
            deadline,
          };

          const createResult = await createProject(employerId, createInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const createdProject = createResult.data;
          expect(createdProject.title).toBe(title);
          expect(createdProject.description).toBe(description);
          expect(createdProject.budget).toBe(budget);
          expect(createdProject.deadline).toBe(deadline);
          expect(createdProject.employer_id).toBe(employerId);
          expect(createdProject.status).toBe('open');
          expect(createdProject.milestones).toEqual([]);
          expect(createdProject.required_skills.length).toBe(skillIds.length);

          const getResult = await getProjectById(createdProject.id);
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;

          const retrievedProject = getResult.data;
          expect(retrievedProject.id).toBe(createdProject.id);
          expect(retrievedProject.title).toBe(title);
          expect(retrievedProject.description).toBe(description);
          expect(retrievedProject.budget).toBe(budget);
          expect(retrievedProject.status).toBe('open');
          expect(retrievedProject.milestones).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 8: Project lock on accepted proposal**
   * **Validates: Requirements 3.4**
   * 
   * For any project that has at least one accepted proposal, update attempts
   * shall be rejected with a project locked error.
   */
  it('Property 8: Project lock on accepted proposal', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        fc.uuid(),
        validTitleArbitrary(),
        async (employerId, title, description, budget, deadline, freelancerId, newTitle) => {
          projectStore.clear();
          proposalStore.clear();

          const createInput = {
            title,
            description,
            requiredSkills: [{ skillId: 'skill-1' }],
            budget,
            deadline,
          };

          const createResult = await createProject(employerId, createInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const project = createResult.data;
          addAcceptedProposal(project.id, freelancerId);

          const updateResult = await updateProject(project.id, employerId, {
            title: newTitle,
          });

          expect(updateResult.success).toBe(false);
          if (!updateResult.success) {
            expect(updateResult.error.code).toBe('PROJECT_LOCKED');
          }

          const getResult = await getProjectById(project.id);
          expect(getResult.success).toBe(true);
          if (getResult.success) {
            expect(getResult.data.title).toBe(title);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 9: Milestone budget invariant**
   * **Validates: Requirements 3.6**
   * 
   * For any project with milestones, the sum of all milestone amounts shall
   * equal the total project budget.
   */
  it('Property 9: Milestone budget invariant - valid milestones accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        fc.integer({ min: 1, max: 5 }),
        async (employerId, title, description, budget, deadline, milestoneCount) => {
          projectStore.clear();
          proposalStore.clear();

          const createInput = {
            title,
            description,
            requiredSkills: [{ skillId: 'skill-1' }],
            budget,
            deadline,
          };

          const createResult = await createProject(employerId, createInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const project = createResult.data;

          const milestonesGen = validMilestonesArbitrary(budget, milestoneCount);
          const milestones = fc.sample(milestonesGen, 1)[0];
          if (!milestones || milestones.length === 0) return;

          const addResult = await setMilestones(project.id, employerId, milestones);

          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          const totalMilestoneAmount = addResult.data.milestones.reduce(
            (sum, m) => sum + m.amount,
            0
          );
          expect(totalMilestoneAmount).toBe(budget);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: Milestone budget invariant - invalid milestones rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        async (employerId, title, description, budget, deadline) => {
          projectStore.clear();
          proposalStore.clear();

          const createInput = {
            title,
            description,
            requiredSkills: [{ skillId: 'skill-1' }],
            budget,
            deadline,
          };

          const createResult = await createProject(employerId, createInput);
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const project = createResult.data;

          const invalidMilestonesGen = invalidMilestonesArbitrary(budget);
          const samples = fc.sample(invalidMilestonesGen, 1);
          if (!samples || samples.length === 0) return;
          const milestones = samples[0];
          if (!milestones || milestones.length === 0) return;

          const addResult = await setMilestones(project.id, employerId, milestones);

          expect(addResult.success).toBe(false);
          if (!addResult.success) {
            expect(addResult.error.code).toBe('MILESTONE_SUM_MISMATCH');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Project Service - Unit Tests', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();

    const skill1 = createTestSkill({ id: 'skill-1', name: 'JavaScript', category_id: 'cat-1' });
    const skill2 = createTestSkill({ id: 'skill-2', name: 'TypeScript', category_id: 'cat-1' });
    
    skillStore.set(skill1.id, skill1);
    skillStore.set(skill2.id, skill2);
  });

  it('should create project with valid data', async () => {
    const employerId = generateId();
    const createInput = {
      title: 'Build a Website',
      description: 'Need a professional website for my business with modern design.',
      requiredSkills: [{ skillId: 'skill-1' }],
      budget: 5000,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await createProject(employerId, createInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(createInput.title);
      expect(result.data.employer_id).toBe(employerId);
      expect(result.data.status).toBe('open');
    }
  });

  it('should retrieve project by ID', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const result = await getProjectById(project.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(project.id);
      expect(result.data.title).toBe(project.title);
    }
  });

  it('should return null for non-existent project', async () => {
    const result = await getProjectById('non-existent-id');

    expect(result.success).toBe(false);
  });

  it('should update project when no accepted proposals', async () => {
    const employerId = generateId();
    const project = createTestProject({ employer_id: employerId, status: 'open' });
    projectStore.set(project.id, project);

    const result = await updateProject(project.id, employerId, {
      title: 'Updated Title',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Updated Title');
    }
  });

  it('should reject update when project has accepted proposal', async () => {
    const employerId = generateId();
    const freelancerId = generateId();
    const project = createTestProject({ employer_id: employerId, status: 'open' });
    projectStore.set(project.id, project);

    addAcceptedProposal(project.id, freelancerId);

    const result = await updateProject(project.id, employerId, {
      title: 'Updated Title',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PROJECT_LOCKED');
    }
  });

  it('should set milestones that sum to budget', async () => {
    const employerId = generateId();
    const project = createTestProject({ employer_id: employerId, budget: 3000 });
    projectStore.set(project.id, project);

    const milestones = [
      {
        title: 'Milestone 1',
        description: 'First milestone',
        amount: 1000,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'Milestone 2',
        description: 'Second milestone',
        amount: 2000,
        dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const result = await setMilestones(project.id, employerId, milestones);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.milestones.length).toBe(2);
      const total = result.data.milestones.reduce((sum, m) => sum + m.amount, 0);
      expect(total).toBe(3000);
    }
  });

  it('should reject milestones that do not sum to budget', async () => {
    const employerId = generateId();
    const project = createTestProject({ employer_id: employerId, budget: 3000 });
    projectStore.set(project.id, project);

    const milestones = [
      {
        title: 'Milestone 1',
        description: 'First milestone',
        amount: 1000,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'Milestone 2',
        description: 'Second milestone',
        amount: 1500,
        dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const result = await setMilestones(project.id, employerId, milestones);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MILESTONE_SUM_MISMATCH');
    }
  });

  it('should reject unauthorized update attempt', async () => {
    const employerId = generateId();
    const wrongUserId = generateId();
    const project = createTestProject({ employer_id: employerId });
    projectStore.set(project.id, project);

    const result = await updateProject(project.id, wrongUserId, {
      title: 'Hacked Title',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });
});
