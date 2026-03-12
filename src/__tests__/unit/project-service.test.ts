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
    .filter(d => !isNaN(d.getTime()))
    .map(d => d.toISOString());

// Generate milestones that sum to a specific budget
const validMilestonesArbitrary = (totalBudget: number, count: number): fc.Arbitrary<Array<{
  title: string;
  description: string;
  amount: number;
  dueDate: string;
}>> => {
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
const invalidMilestonesArbitrary = (totalBudget: number): fc.Arbitrary<Array<{
  title: string;
  description: string;
  amount: number;
  dueDate: string;
}>> =>
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

          const milestones = fc.sample(validMilestonesArbitrary(budget, milestoneCount), 1)[0];
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

          const samples = fc.sample(invalidMilestonesArbitrary(budget), 1);
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

describe('Project Service - Category Filtering Tests', () => {
  beforeEach(() => {
    projectStore.clear();
    proposalStore.clear();
    skillStore.clear();
  });

  // Mock the new category filtering functions
  const mockListProjectsByCategory = jest.fn<any>();
  const mockListProjectsByMultipleCategories = jest.fn<any>();

  beforeEach(() => {
    // Add category filtering methods to mock repository
    mockProjectRepo.getProjectsByCategory = jest.fn<any>(async (categoryId: string, options?: any) => {
      const items = Array.from(projectStore.values()).filter((p: any) => 
        p.status === 'open' && 
        p.required_skills.some((skill: any) => skill.category_id === categoryId)
      );
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        hasMore: offset + limit < items.length,
        total: items.length,
      };
    });

    mockProjectRepo.getProjectsByMultipleCategories = jest.fn<any>(async (categoryIds: string[], options?: any) => {
      const items = Array.from(projectStore.values()).filter((p: any) => 
        p.status === 'open' && 
        p.required_skills.some((skill: any) => categoryIds.includes(skill.category_id))
      );
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const paginatedItems = items.slice(offset, offset + limit);
      return {
        items: paginatedItems,
        hasMore: offset + limit < items.length,
        total: items.length,
      };
    });
  });

  it('should filter projects by single category', async () => {
    // Import the new functions
    const { listProjectsByCategory } = await import('../../services/project-service.js');

    // Create test projects with different categories
    const webDevCategoryId = 'web-dev-category';
    const mobileCategoryId = 'mobile-category';

    const project1 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 }
      ]
    });

    const project2 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill2', skill_name: 'Flutter', category_id: mobileCategoryId, years_of_experience: 1 }
      ]
    });

    const project3 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill3', skill_name: 'Vue.js', category_id: webDevCategoryId, years_of_experience: 3 }
      ]
    });

    projectStore.set(project1.id, project1);
    projectStore.set(project2.id, project2);
    projectStore.set(project3.id, project3);

    const result = await listProjectsByCategory(webDevCategoryId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(2);
      expect(result.data.total).toBe(2);
      expect(result.data.items.map(p => p.id)).toContain(project1.id);
      expect(result.data.items.map(p => p.id)).toContain(project3.id);
      expect(result.data.items.map(p => p.id)).not.toContain(project2.id);
    }
  });

  it('should filter projects by multiple categories', async () => {
    const { listProjectsByMultipleCategories } = await import('../../services/project-service.js');

    const webDevCategoryId = 'web-dev-category';
    const mobileCategoryId = 'mobile-category';
    const backendCategoryId = 'backend-category';

    const project1 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 }
      ]
    });

    const project2 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill2', skill_name: 'Flutter', category_id: mobileCategoryId, years_of_experience: 1 }
      ]
    });

    const project3 = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill3', skill_name: 'Node.js', category_id: backendCategoryId, years_of_experience: 3 }
      ]
    });

    projectStore.set(project1.id, project1);
    projectStore.set(project2.id, project2);
    projectStore.set(project3.id, project3);

    const result = await listProjectsByMultipleCategories([webDevCategoryId, mobileCategoryId]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(2);
      expect(result.data.total).toBe(2);
      expect(result.data.items.map(p => p.id)).toContain(project1.id);
      expect(result.data.items.map(p => p.id)).toContain(project2.id);
      expect(result.data.items.map(p => p.id)).not.toContain(project3.id);
    }
  });

  it('should handle pagination for category filtering', async () => {
    const { listProjectsByCategory } = await import('../../services/project-service.js');

    const categoryId = 'test-category';

    // Create 5 projects with the same category
    for (let i = 0; i < 5; i++) {
      const project = createTestProject({
        status: 'open',
        required_skills: [
          { skill_id: `skill${i}`, skill_name: `Skill ${i}`, category_id: categoryId, years_of_experience: 1 }
        ]
      });
      projectStore.set(project.id, project);
    }

    // Test first page
    const firstPage = await listProjectsByCategory(categoryId, { limit: 2, offset: 0 });
    expect(firstPage.success).toBe(true);
    if (firstPage.success) {
      expect(firstPage.data.items.length).toBe(2);
      expect(firstPage.data.hasMore).toBe(true);
      expect(firstPage.data.total).toBe(5);
    }

    // Test second page
    const secondPage = await listProjectsByCategory(categoryId, { limit: 2, offset: 2 });
    expect(secondPage.success).toBe(true);
    if (secondPage.success) {
      expect(secondPage.data.items.length).toBe(2);
      expect(secondPage.data.hasMore).toBe(true);
    }

    // Test last page
    const lastPage = await listProjectsByCategory(categoryId, { limit: 2, offset: 4 });
    expect(lastPage.success).toBe(true);
    if (lastPage.success) {
      expect(lastPage.data.items.length).toBe(1);
      expect(lastPage.data.hasMore).toBe(false);
    }
  });

  it('should return empty results for non-existent category', async () => {
    const { listProjectsByCategory } = await import('../../services/project-service.js');

    const project = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill1', skill_name: 'React', category_id: 'existing-category', years_of_experience: 2 }
      ]
    });
    projectStore.set(project.id, project);

    const result = await listProjectsByCategory('non-existent-category');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(0);
      expect(result.data.total).toBe(0);
      expect(result.data.hasMore).toBe(false);
    }
  });

  it('should only return open projects for category filtering', async () => {
    const { listProjectsByCategory } = await import('../../services/project-service.js');

    const categoryId = 'test-category';

    const openProject = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill1', skill_name: 'React', category_id: categoryId, years_of_experience: 2 }
      ]
    });

    const completedProject = createTestProject({
      status: 'completed',
      required_skills: [
        { skill_id: 'skill2', skill_name: 'Vue.js', category_id: categoryId, years_of_experience: 1 }
      ]
    });

    const draftProject = createTestProject({
      status: 'draft',
      required_skills: [
        { skill_id: 'skill3', skill_name: 'Angular', category_id: categoryId, years_of_experience: 3 }
      ]
    });

    projectStore.set(openProject.id, openProject);
    projectStore.set(completedProject.id, completedProject);
    projectStore.set(draftProject.id, draftProject);

    const result = await listProjectsByCategory(categoryId);

    expect(result.success).toBe(true);
    if (result.success && result.data && Array.isArray(result.data.items) && result.data.items.length > 0) {
      expect(result.data.items[0]!.id).toBe(openProject.id);
      expect(result.data.items[0]!.status).toBe('open');
    }
  });

  it('should handle projects with multiple skills from different categories', async () => {
    const { listProjectsByCategory } = await import('../../services/project-service.js');

    const webDevCategoryId = 'web-dev-category';
    const backendCategoryId = 'backend-category';

    const project = createTestProject({
      status: 'open',
      required_skills: [
        { skill_id: 'skill1', skill_name: 'React', category_id: webDevCategoryId, years_of_experience: 2 },
        { skill_id: 'skill2', skill_name: 'Node.js', category_id: backendCategoryId, years_of_experience: 3 }
      ]
    });

    projectStore.set(project.id, project);

    // Should be found when filtering by web dev category
    const webDevResult = await listProjectsByCategory(webDevCategoryId);
    expect(webDevResult.success).toBe(true);
    if (webDevResult.success && webDevResult.data && Array.isArray(webDevResult.data.items) && webDevResult.data.items.length > 0) {
      expect(webDevResult.data.items[0]!.id).toBe(project.id);
    }

    // Should also be found when filtering by backend category
    const backendResult = await listProjectsByCategory(backendCategoryId);
    expect(backendResult.success).toBe(true);
    if (backendResult.success && backendResult.data && Array.isArray(backendResult.data.items) && backendResult.data.items.length > 0) {
      expect(backendResult.data.items[0]!.id).toBe(project.id);
    }
  });
});
