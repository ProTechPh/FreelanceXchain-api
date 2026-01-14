import { Project, FreelancerProfile, mapProjectFromEntity, mapFreelancerProfileFromEntity } from '../utils/entity-mapper.js';
import { projectRepository, ProjectEntity } from '../repositories/project-repository.js';
import { freelancerProfileRepository, FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';

export type ProjectSearchFilters = {
  keyword?: string;
  skillIds?: string[];
  minBudget?: number;
  maxBudget?: number;
};

export type FreelancerSearchFilters = {
  keyword?: string;
  skillIds?: string[];
};

export type SearchPaginationInput = {
  pageSize?: number;
  offset?: number;
};

export type SearchResultMetadata = {
  pageSize: number;
  hasMore: boolean;
  offset?: number;
};

export type SearchResult<T> = {
  items: T[];
  metadata: SearchResultMetadata;
};

export type SearchServiceError = {
  code: string;
  message: string;
};

export type SearchServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: SearchServiceError };

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function normalizePageSize(pageSize?: number): number {
  if (!pageSize || pageSize < 1) return DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return pageSize;
}

function buildQueryOptions(pageSize: number, offset?: number): QueryOptions {
  return { limit: pageSize, offset: offset ?? 0 };
}


function buildSearchResult<T>(
  items: T[],
  pageSize: number,
  hasMore: boolean,
  offset?: number
): SearchResult<T> {
  const metadata: SearchResultMetadata = {
    pageSize,
    hasMore,
  };
  if (offset !== undefined) {
    metadata.offset = offset;
  }
  return { items, metadata };
}

/**
 * Search projects with keyword, skill, and budget filters
 * Requirements: 10.1, 10.2, 10.4, 10.5
 */
export async function searchProjects(
  filters: ProjectSearchFilters,
  pagination?: SearchPaginationInput
): Promise<SearchServiceResult<SearchResult<Project>>> {
  const pageSize = normalizePageSize(pagination?.pageSize);
  const queryOptions = buildQueryOptions(pageSize, pagination?.offset);

  let entityResult: PaginatedResult<ProjectEntity>;

  // Determine which search method to use based on filters
  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;
  const hasBudgetRange = filters.minBudget !== undefined || filters.maxBudget !== undefined;

  // If multiple filters are provided, we need to apply them in memory
  // For single filters, we can use the optimized repository methods
  if (hasKeyword && !hasSkills && !hasBudgetRange) {
    entityResult = await projectRepository.searchProjects(filters.keyword!, queryOptions);
  } else if (hasSkills && !hasKeyword && !hasBudgetRange) {
    entityResult = await projectRepository.getProjectsBySkills(filters.skillIds!, queryOptions);
  } else if (hasBudgetRange && !hasKeyword && !hasSkills) {
    const minBudget = filters.minBudget ?? 0;
    const maxBudget = filters.maxBudget ?? Number.MAX_SAFE_INTEGER;
    entityResult = await projectRepository.getProjectsByBudgetRange(minBudget, maxBudget, queryOptions);
  } else if (!hasKeyword && !hasSkills && !hasBudgetRange) {
    // No filters - return all open projects
    entityResult = await projectRepository.getAllOpenProjects(queryOptions);
  } else {
    // Multiple filters - get all open projects and filter in memory
    entityResult = await projectRepository.getAllOpenProjects(queryOptions);
    
    let filteredItems = entityResult.items;

    // Apply keyword filter
    if (hasKeyword) {
      const keyword = filters.keyword!.toLowerCase();
      filteredItems = filteredItems.filter(
        project =>
          project.title.toLowerCase().includes(keyword) ||
          project.description.toLowerCase().includes(keyword)
      );
    }

    // Apply skill filter
    if (hasSkills) {
      const skillIdSet = new Set(filters.skillIds);
      filteredItems = filteredItems.filter(project =>
        project.required_skills.some(skill => skillIdSet.has(skill.skill_id))
      );
    }

    // Apply budget range filter
    if (hasBudgetRange) {
      const minBudget = filters.minBudget ?? 0;
      const maxBudget = filters.maxBudget ?? Number.MAX_SAFE_INTEGER;
      filteredItems = filteredItems.filter(
        project => project.budget >= minBudget && project.budget <= maxBudget
      );
    }

    entityResult = { items: filteredItems, hasMore: entityResult.hasMore };
  }

  // Map entities to models
  const projects = entityResult.items.map(mapProjectFromEntity);

  return {
    success: true,
    data: buildSearchResult(projects, pageSize, entityResult.hasMore, pagination?.offset),
  };
}


/**
 * Search freelancers with skill filters
 * Requirements: 10.3, 10.4
 */
export async function searchFreelancers(
  filters: FreelancerSearchFilters,
  pagination?: SearchPaginationInput
): Promise<SearchServiceResult<SearchResult<FreelancerProfile>>> {
  const pageSize = normalizePageSize(pagination?.pageSize);
  const queryOptions = buildQueryOptions(pageSize, pagination?.offset);

  let entityResult: PaginatedResult<FreelancerProfileEntity>;

  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;

  if (hasSkills && !hasKeyword) {
    entityResult = await freelancerProfileRepository.searchBySkills(filters.skillIds!, queryOptions);
  } else if (hasKeyword && !hasSkills) {
    entityResult = await freelancerProfileRepository.searchByKeyword(filters.keyword!, queryOptions);
  } else if (!hasKeyword && !hasSkills) {
    // No filters - return all profiles
    entityResult = await freelancerProfileRepository.getAllProfilesPaginated(queryOptions);
  } else {
    // Multiple filters - get all profiles and filter in memory
    entityResult = await freelancerProfileRepository.getAllProfilesPaginated(queryOptions);
    
    let filteredItems = entityResult.items;

    // Apply keyword filter
    if (hasKeyword) {
      const keyword = filters.keyword!.toLowerCase();
      filteredItems = filteredItems.filter(profile =>
        profile.bio.toLowerCase().includes(keyword)
      );
    }

    // Apply skill filter (now using skill names instead of IDs)
    if (hasSkills) {
      const skillNameSet = new Set(filters.skillIds?.map(s => s.toLowerCase()));
      filteredItems = filteredItems.filter(profile =>
        profile.skills.some(skill => skillNameSet.has(skill.name.toLowerCase()))
      );
    }

    entityResult = { items: filteredItems, hasMore: entityResult.hasMore };
  }

  // Map entities to models
  const profiles = entityResult.items.map(mapFreelancerProfileFromEntity);

  return {
    success: true,
    data: buildSearchResult(profiles, pageSize, entityResult.hasMore, pagination?.offset),
  };
}
