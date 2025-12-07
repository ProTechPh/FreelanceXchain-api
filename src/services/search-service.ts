import { Project } from '../models/project.js';
import { FreelancerProfile } from '../models/freelancer-profile.js';
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
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
  continuationToken?: string;
};

export type SearchResultMetadata = {
  pageSize: number;
  hasMore: boolean;
  continuationToken?: string;
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

function buildQueryOptions(pageSize: number, continuationToken?: string): QueryOptions {
  const options: QueryOptions = { maxItemCount: pageSize };
  if (continuationToken) {
    options.continuationToken = continuationToken;
  }
  return options;
}


function buildSearchResult<T>(
  items: T[],
  pageSize: number,
  hasMore: boolean,
  continuationToken?: string
): SearchResult<T> {
  const metadata: SearchResultMetadata = {
    pageSize,
    hasMore,
  };
  if (continuationToken) {
    metadata.continuationToken = continuationToken;
  }
  return { items, metadata };
}

function buildPaginatedResult<T>(
  items: T[],
  hasMore: boolean,
  continuationToken?: string
): PaginatedResult<T> {
  const result: PaginatedResult<T> = { items, hasMore };
  if (continuationToken) {
    result.continuationToken = continuationToken;
  }
  return result;
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
  const queryOptions = buildQueryOptions(pageSize, pagination?.continuationToken);

  let result: PaginatedResult<Project>;

  // Determine which search method to use based on filters
  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;
  const hasBudgetRange = filters.minBudget !== undefined || filters.maxBudget !== undefined;

  // If multiple filters are provided, we need to apply them in memory
  // For single filters, we can use the optimized repository methods
  if (hasKeyword && !hasSkills && !hasBudgetRange) {
    result = await projectRepository.searchProjects(filters.keyword!, queryOptions);
  } else if (hasSkills && !hasKeyword && !hasBudgetRange) {
    result = await projectRepository.getProjectsBySkills(filters.skillIds!, queryOptions);
  } else if (hasBudgetRange && !hasKeyword && !hasSkills) {
    const minBudget = filters.minBudget ?? 0;
    const maxBudget = filters.maxBudget ?? Number.MAX_SAFE_INTEGER;
    result = await projectRepository.getProjectsByBudgetRange(minBudget, maxBudget, queryOptions);
  } else if (!hasKeyword && !hasSkills && !hasBudgetRange) {
    // No filters - return all open projects
    result = await projectRepository.getAllOpenProjects(queryOptions);
  } else {
    // Multiple filters - get all open projects and filter in memory
    result = await projectRepository.getAllOpenProjects(queryOptions);
    
    let filteredItems = result.items;

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
        project.requiredSkills.some(skill => skillIdSet.has(skill.skillId))
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

    result = buildPaginatedResult(filteredItems, result.hasMore, result.continuationToken);
  }

  return {
    success: true,
    data: buildSearchResult(result.items, pageSize, result.hasMore, result.continuationToken),
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
  const queryOptions = buildQueryOptions(pageSize, pagination?.continuationToken);

  let result: PaginatedResult<FreelancerProfile>;

  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;

  if (hasSkills && !hasKeyword) {
    result = await freelancerProfileRepository.searchBySkills(filters.skillIds!, queryOptions);
  } else if (hasKeyword && !hasSkills) {
    result = await freelancerProfileRepository.searchByKeyword(filters.keyword!, queryOptions);
  } else if (!hasKeyword && !hasSkills) {
    // No filters - return all profiles
    result = await freelancerProfileRepository.getAllProfilesPaginated(queryOptions);
  } else {
    // Multiple filters - get all profiles and filter in memory
    result = await freelancerProfileRepository.getAllProfilesPaginated(queryOptions);
    
    let filteredItems = result.items;

    // Apply keyword filter
    if (hasKeyword) {
      const keyword = filters.keyword!.toLowerCase();
      filteredItems = filteredItems.filter(profile =>
        profile.bio.toLowerCase().includes(keyword)
      );
    }

    // Apply skill filter
    if (hasSkills) {
      const skillIdSet = new Set(filters.skillIds);
      filteredItems = filteredItems.filter(profile =>
        profile.skills.some(skill => skillIdSet.has(skill.skillId))
      );
    }

    result = buildPaginatedResult(filteredItems, result.hasMore, result.continuationToken);
  }

  return {
    success: true,
    data: buildSearchResult(result.items, pageSize, result.hasMore, result.continuationToken),
  };
}
