import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { Project } from '../../models/project.js';
import { Proposal } from '../../models/proposal.js';
import { Skill } from '../../models/skill.js';
import { generateId } from '../../utils/id.js';

// In-memory stores for testing
let projectStore: Map<string, Project> = new Map();
let proposalStore: Map<string, Proposal> = new Map();
let skillStore: Map<string, Skill> = new Map();

// Mock the repositories before importing project-service
jest.unstable_mockModule('../../repositories/project-repository.js', () => ({
  projectRepository: {
    createProject: jest.fn(async (project: Project) => {
      const now = new Date().toISOString();
      const created = { ...project, createdAt: now, updatedAt: now };
      projectStore.set(project.id, created);
      return created;
    }),
    getProjectById: jest.fn(async (id: string, employerId: string) => {
      const project = projectStore.get(id);
      if (project && project.employerId === employerId) return project;
      return null;
    }),
    findProjectById: jest.fn(async (id: string) => {
      return projectStore.get(id) ?? null;
    }),
    updateProject: jest.fn(async (id: string, employerId: string, updates: Partial<Project>) => {
      const project = projectStore.get(id);
      if (!project || project.employerId !== employerId) return null;
      const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
      projectStore.set(id, updated);
      return updated;
    }),
    getProjectsByEmployer: jest.fn(async (employerId: string) => {
      const items = Array.from(projectStore.values()).filter(p => p.employerId === employerId);
      return { items, hasMore: false };
    }),
  },
  ProjectRepository: jest.fn(),
}));


jest.unstable_mockModule('../../repositories/proposal-repository.js', () => ({
  proposalRepository: {
    hasAcceptedProposal: jest.fn(async (projectId: string) => {
      for (const proposal of proposalStore.values()) {
        if (proposal.projectId === projectId && proposal.status === 'accepted') {
          return true;
        }
      }
      return false;
    }),
    getProposalCountByProject: jest.fn(async (projectId: string) => {
      let count = 0;
      for (const proposal of proposalStore.values()) {
        if (proposal.projectId === projectId) count++;
      }
      return count;
    }),
  },
  ProposalRepository: jest.fn(),
}));

jest.unstable_mockModule('../../repositories/skill-repository.js', () => ({
  skillRepository: {
    findSkillById: jest.fn(async (id: string) => {
      return skillStore.get(id) ?? null;
    }),
  },
  SkillRepository: jest.fn(),
}));

// Import after mocking
const { createProject, getProjectById, updateProject, setMilestones } = await import('../project-service.js');

// Helper to create test skills
function createTestSkill(id: string, name: string, categoryId: string): Skill {
  return {
    id,
    categoryId,
    name,
    description: `${name} skill`,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Helper to add accepted proposal
function addAcceptedProposal(projectId: string, freelancerId: string): Proposal {
  const proposal: Proposal = {
    id: generateId(),
    projectId,
    freelancerId,
    coverLetter: 'Test cover letter',
    proposedRate: 50,
    estimatedDuration: 30,
    status: 'accepted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  proposalStore.set(proposal.id, proposal);
  return proposal;
}


// Custom arbitraries for property-based testing
const validTitleArbitrary = () =>
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{5,50}$/);

const validDescriptionArbitrary = () =>
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,!?]{20,200}$/);

const validBudgetArbitrary = () =>
  fc.integer({ min: 100, max: 100000 });

const validDeadlineArbitrary = () =>
  fc.date({ min: new Date(), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
    .map(d => d.toISOString());

const validEmployerIdArbitrary = () =>
  fc.uuid();

const validFreelancerIdArbitrary = () =>
  fc.uuid();

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
    // Distribute budget evenly with remainder going to last milestone
    const baseAmount = Math.floor(totalBudget / count);
    const remainder = totalBudget - (baseAmount * count);
    
    return milestones.map((m, i) => ({
      ...m,
      amount: i === count - 1 ? baseAmount + remainder : baseAmount,
    }));
  });
};

// Generate milestones that DON'T sum to budget (for negative testing)
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


describe('Project Service - Property Tests', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();
    
    // Set up some test skills
    const skill1 = createTestSkill('skill-1', 'JavaScript', 'cat-1');
    const skill2 = createTestSkill('skill-2', 'TypeScript', 'cat-1');
    const skill3 = createTestSkill('skill-3', 'React', 'cat-2');
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
        validEmployerIdArbitrary(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        fc.constantFrom(['skill-1'], ['skill-2'], ['skill-1', 'skill-2'], ['skill-1', 'skill-3']),
        async (employerId, title, description, budget, deadline, skillIds) => {
          // Clear stores for each test case
          projectStore.clear();
          proposalStore.clear();

          const createInput = {
            title,
            description,
            requiredSkills: skillIds.map(id => ({ skillId: id })),
            budget,
            deadline,
          };

          // Create project
          const createResult = await createProject(employerId, createInput);
          
          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const createdProject = createResult.data;

          // Verify created project data matches input
          expect(createdProject.title).toBe(title);
          expect(createdProject.description).toBe(description);
          expect(createdProject.budget).toBe(budget);
          expect(createdProject.deadline).toBe(deadline);
          expect(createdProject.employerId).toBe(employerId);
          expect(createdProject.status).toBe('open');
          expect(createdProject.milestones).toEqual([]);
          expect(createdProject.requiredSkills.length).toBe(skillIds.length);

          // Retrieve project
          const getResult = await getProjectById(createdProject.id);
          
          expect(getResult.success).toBe(true);
          if (!getResult.success) return;

          const retrievedProject = getResult.data;

          // Verify retrieved project matches created project
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
        validEmployerIdArbitrary(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        validFreelancerIdArbitrary(),
        validTitleArbitrary(),
        async (employerId, title, description, budget, deadline, freelancerId, newTitle) => {
          // Clear stores for each test case
          projectStore.clear();
          proposalStore.clear();

          // Create a project
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

          // Add an accepted proposal
          addAcceptedProposal(project.id, freelancerId);

          // Attempt to update the project
          const updateResult = await updateProject(project.id, employerId, {
            title: newTitle,
          });

          // Should fail with PROJECT_LOCKED error
          expect(updateResult.success).toBe(false);
          if (!updateResult.success) {
            expect(updateResult.error.code).toBe('PROJECT_LOCKED');
          }

          // Verify project was not modified
          const getResult = await getProjectById(project.id);
          expect(getResult.success).toBe(true);
          if (getResult.success) {
            expect(getResult.data.title).toBe(title); // Original title unchanged
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
        validEmployerIdArbitrary(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        fc.integer({ min: 1, max: 5 }),
        async (employerId, title, description, budget, deadline, milestoneCount) => {
          // Clear stores for each test case
          projectStore.clear();
          proposalStore.clear();

          // Create a project
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

          // Generate milestones that sum to budget
          const milestonesGen = validMilestonesArbitrary(budget, milestoneCount);
          const milestones = fc.sample(milestonesGen, 1)[0];
          if (!milestones || milestones.length === 0) return;

          // Add milestones
          const addResult = await setMilestones(project.id, employerId, milestones);

          // Should succeed
          expect(addResult.success).toBe(true);
          if (!addResult.success) return;

          // Verify milestone sum equals budget
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

  /**
   * **Feature: blockchain-freelance-marketplace, Property 9: Milestone budget invariant**
   * **Validates: Requirements 3.6**
   * 
   * Milestones that don't sum to budget should be rejected.
   */
  it('Property 9: Milestone budget invariant - invalid milestones rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmployerIdArbitrary(),
        validTitleArbitrary(),
        validDescriptionArbitrary(),
        validBudgetArbitrary(),
        validDeadlineArbitrary(),
        async (employerId, title, description, budget, deadline) => {
          // Clear stores for each test case
          projectStore.clear();
          proposalStore.clear();

          // Create a project
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

          // Generate milestones that DON'T sum to budget
          const invalidMilestonesGen = invalidMilestonesArbitrary(budget);
          const samples = fc.sample(invalidMilestonesGen, 1);
          if (!samples || samples.length === 0) return;
          const milestones = samples[0];
          if (!milestones || milestones.length === 0) return;

          // Attempt to add invalid milestones
          const addResult = await setMilestones(project.id, employerId, milestones);

          // Should fail with MILESTONE_SUM_MISMATCH error
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
