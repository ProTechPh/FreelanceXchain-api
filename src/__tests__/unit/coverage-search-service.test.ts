// @ts-nocheck
/**
 * search-service.ts coverage:
 * - Line 47: normalizePageSize > MAX_PAGE_SIZE
 * - Lines 96-97: budget-only filter path
 * - Line 138: hasMore calculation in combined filter path
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockProjectRepository = {
  searchProjects: jest.fn<any>(),
  getProjectsBySkills: jest.fn<any>(),
  getProjectsByBudgetRange: jest.fn<any>(),
  getAllOpenProjects: jest.fn<any>(),
};

const mockFreelancerProfileRepository = {
  searchProfiles: jest.fn<any>(),
  getAllProfiles: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (e: any) => ({ ...e, id: e.id, title: e.title }),
  mapFreelancerProfileFromEntity: (e: any) => ({ ...e }),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { searchProjects, searchFreelancers } = await import('../../services/search-service.js');

const makeProject = (id: string, overrides: any = {}) => ({
  id,
  title: `Project ${id}`,
  description: `Description for ${id}`,
  budget: 1000,
  required_skills: [],
  status: 'open',
  employer_id: 'emp-1',
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

describe('Search Service - Coverage Gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Line 47: pageSize > MAX_PAGE_SIZE (100) → returns 100
  it('should cap pageSize at MAX_PAGE_SIZE=100 (line 47)', async () => {
    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: [makeProject('p-1')],
      hasMore: false,
      total: 1,
    });

    const result = await searchProjects({}, { pageSize: 999 });

    expect(result.success).toBe(true);
    // The repository should be called with limit=100 (capped)
    expect(mockProjectRepository.getAllOpenProjects).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  // Lines 96-97: budget-only filter (hasBudgetRange && !hasKeyword && !hasSkills)
  it('should use getProjectsByBudgetRange for budget-only filter (lines 96-97)', async () => {
    mockProjectRepository.getProjectsByBudgetRange.mockResolvedValue({
      items: [makeProject('p-1', { budget: 500 }), makeProject('p-2', { budget: 800 })],
      hasMore: false,
      total: 2,
    });

    const result = await searchProjects({ minBudget: 100, maxBudget: 1000 });

    expect(result.success).toBe(true);
    expect(mockProjectRepository.getProjectsByBudgetRange).toHaveBeenCalledWith(
      100, 1000, expect.anything()
    );
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
  });

  it('should use getProjectsByBudgetRange with only minBudget', async () => {
    mockProjectRepository.getProjectsByBudgetRange.mockResolvedValue({
      items: [makeProject('p-1', { budget: 2000 })],
      hasMore: false,
      total: 1,
    });

    const result = await searchProjects({ minBudget: 500 });

    expect(result.success).toBe(true);
    expect(mockProjectRepository.getProjectsByBudgetRange).toHaveBeenCalledWith(
      500, Number.MAX_SAFE_INTEGER, expect.anything()
    );
  });

  it('should use getProjectsByBudgetRange with only maxBudget', async () => {
    mockProjectRepository.getProjectsByBudgetRange.mockResolvedValue({
      items: [],
      hasMore: false,
      total: 0,
    });

    const result = await searchProjects({ maxBudget: 500 });

    expect(result.success).toBe(true);
    expect(mockProjectRepository.getProjectsByBudgetRange).toHaveBeenCalledWith(
      0, 500, expect.anything()
    );
  });

  // Line 138: hasMore in combined filter path with pagination
  it('should calculate hasMore correctly in combined filter path (line 138)', async () => {
    // Create 25 projects - with pageSize=10 and offset=10, hasMore should be true
    const projects = Array.from({ length: 25 }, (_, i) =>
      makeProject(`p-${i}`, { title: `React Project ${i}`, description: `React desc ${i}`, budget: 500 })
    );

    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: projects,
      hasMore: false,
      total: 25,
    });

    // Combined filter: keyword + budget (triggers the multi-filter path)
    const result = await searchProjects(
      { keyword: 'React', minBudget: 100 },
      { pageSize: 10, offset: 10 }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // offset=10, pageSize=10, total matching=25 → hasMore=true
      expect(result.data.metadata.hasMore).toBe(true);
      expect(result.data.items).toHaveLength(10);
    }
  });

  it('should return hasMore=false when at last page in combined filter', async () => {
    const projects = Array.from({ length: 15 }, (_, i) =>
      makeProject(`p-${i}`, { title: `React Project ${i}`, description: `React desc ${i}`, budget: 500 })
    );

    mockProjectRepository.getAllOpenProjects.mockResolvedValue({
      items: projects,
      hasMore: false,
      total: 15,
    });

    // offset=10, pageSize=10, total=15 → hasMore=false (10+10=20 >= 15)
    const result = await searchProjects(
      { keyword: 'React', minBudget: 100 },
      { pageSize: 10, offset: 10 }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.hasMore).toBe(false);
    }
  });
});
