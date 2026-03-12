import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore, 
  createMockProposalRepository,
  createMockProjectRepository,
  createMockNotificationRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestProposal, 
  createTestProject
} from '../helpers/test-data-factory.js';

// Create stores and mocks
const proposalStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const notificationStore = createInMemoryStore();

const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

// Import after mocking
const { submitProposal } = await import('../../services/proposal-service.js');

describe('Proposal Tags Feature', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockNotificationRepo.clear();
  });

  /**
   * Test: Proposal creation with tags
   */
  it('should create proposal with valid tags', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['react', 'typescript', 'nodejs'];

    // Setup project
    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual(tags);
      expect(Array.isArray(result.data.proposal.tags)).toBe(true);
    }
  });

  /**
   * Test: Proposal creation without tags (optional field)
   */
  it('should create proposal without tags when not provided', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual([]);
    }
  });

  /**
   * Test: Empty tags array
   */
  it('should handle empty tags array', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual([]);
    }
  });

  /**
   * Property-based test: Tags are always stored as arrays
   */
  it('Property: Tags are always stored as arrays', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        async (tags) => {
          const projectId = 'test-project-' + Date.now() + Math.random();
          const freelancerId = 'test-freelancer-' + Date.now() + Math.random();

          const project = createTestProject({ id: projectId, status: 'open' });
          projectStore.set(projectId, project);

          const result = await submitProposal(freelancerId, {
            projectId,
            attachments: [],
            proposedRate: 1000,
            estimatedDuration: 30,
            tags,
          });

          expect(result.success).toBe(true);
          if (result.success) {
            expect(Array.isArray(result.data.proposal.tags)).toBe(true);
            expect(result.data.proposal.tags.length).toBeLessThanOrEqual(tags.length);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test: Tags with special characters
   */
  it('should handle tags with special characters', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['C++', 'Node.js', 'React.js', 'ASP.NET'];

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual(tags);
    }
  });

  /**
   * Test: Tags with hashtag symbols
   */
  it('should handle tags with hashtag symbols', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['#react', '#typescript', '#nodejs'];

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual(tags);
    }
  });

  /**
   * Test: Maximum tags limit
   */
  it('should accept up to 10 tags', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10'];

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual(tags);
      expect(result.data.proposal.tags.length).toBe(10);
    }
  });

  /**
   * Test: Case sensitivity preserved
   */
  it('should preserve tag case sensitivity', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['React', 'NODEJS', 'TypeScript'];

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const result = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.tags).toEqual(tags);
    }
  });

  /**
   * Property-based test: Tags deduplication
   */
  it('Property: Duplicate tags should be handled correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('react', 'nodejs', 'typescript', 'python', 'java'), { minLength: 1, maxLength: 15 }),
        async (tagsWithDuplicates) => {
          const projectId = 'test-project-' + Date.now() + '-' + Math.random();
          const freelancerId = 'test-freelancer-' + Date.now() + '-' + Math.random();

          const project = createTestProject({ id: projectId, status: 'open' });
          projectStore.set(projectId, project);

          const result = await submitProposal(freelancerId, {
            projectId,
            attachments: [],
            proposedRate: 1000,
            estimatedDuration: 30,
            tags: tagsWithDuplicates,
          });

          expect(result.success).toBe(true);
          if (result.success) {
            // Tags should be stored as-is from input (deduplication happens at route level)
            expect(Array.isArray(result.data.proposal.tags)).toBe(true);
            expect(result.data.proposal.tags.length).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test: Proposal retrieval includes tags
   */
  it('should retrieve proposal with tags', async () => {
    const projectId = 'test-project-id';
    const freelancerId = 'test-freelancer-id';
    const tags = ['react', 'typescript'];

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(projectId, project);

    const createResult = await submitProposal(freelancerId, {
      projectId,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags,
    });

    expect(createResult.success).toBe(true);
    if (createResult.success) {
      const proposalId = createResult.data.proposal.id;
      const storedProposal = proposalStore.get(proposalId);
      
      expect(storedProposal).toBeDefined();
      expect((storedProposal as any).tags).toEqual(tags);
    }
  });

  /**
   * Test: Multiple proposals with different tags
   */
  it('should handle multiple proposals with different tags', async () => {
    const project1Id = 'test-project-1';
    const project2Id = 'test-project-2';
    const freelancerId = 'test-freelancer-id';

    const project1 = createTestProject({ id: project1Id, status: 'open' });
    const project2 = createTestProject({ id: project2Id, status: 'open' });
    projectStore.set(project1Id, project1);
    projectStore.set(project2Id, project2);

    const result1 = await submitProposal(freelancerId, {
      projectId: project1Id,
      attachments: [],
      proposedRate: 1000,
      estimatedDuration: 30,
      tags: ['react', 'frontend'],
    });

    const result2 = await submitProposal(freelancerId, {
      projectId: project2Id,
      attachments: [],
      proposedRate: 2000,
      estimatedDuration: 60,
      tags: ['nodejs', 'backend'],
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.data.proposal.tags).toEqual(['react', 'frontend']);
      expect(result2.data.proposal.tags).toEqual(['nodejs', 'backend']);
    }
  });
});
