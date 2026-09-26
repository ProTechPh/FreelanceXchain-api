import { Project, FreelancerProfile, mapProjectFromEntity, mapFreelancerProfileFromEntity } from '../utils/entity-mapper.js';
import { projectRepository, ProjectEntity } from '../repositories/project-repository.js';
import { freelancerProfileRepository, FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult } from '../types/service-result.js';
import { logger } from '../config/logger.js';
import { projectCache, freelancerSearchCache } from '../utils/cache.js';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

export function clearFreelancerSearchCache(): void {
  if (typeof freelancerSearchCache?.clear === 'function') {
    freelancerSearchCache.clear();
  }
}

/**
 * Wraps an async operation with timing logs to identify slow queries.
 * Logs operations taking >100ms as warnings, others as debug.
 */
async function timedOperation<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (duration > 100) {
      logger.warn(`Slow search query [${operationName}]: ${duration.toFixed(2)}ms`);
    } else {
      logger.debug(`Search query [${operationName}]: ${duration.toFixed(2)}ms`);
    }
  }
}


// TODO: Multi-filter search currently chains individual repository calls and merges client-side.
// For better scalability, consider using a Appwrite RPC function or database view that applies
// all filters (keyword, skills, budget range) in a single query.
const SEARCH_FALLBACK_LIMIT = 1000;

export type ProjectSearchFilters = {
  keyword?: string;
  skillIds?: string[];
  minBudget?: number;
  maxBudget?: number;
};

export type FreelancerSearchFilters = {
  keyword?: string;
  /** Skill document IDs, skill names, or a mix — both are accepted (see resolveSkillFilterToNames). */
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

type SearchResult<T> = {
  items: T[];
  metadata: SearchResultMetadata;
};


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

async function searchProjectsMultiFilter(
  filters: ProjectSearchFilters,
  flags: { hasKeyword: boolean; hasSkills: boolean; hasBudgetRange: boolean },
  pageSize: number,
  offset: number
): Promise<PaginatedResult<ProjectEntity>> {
  const { hasKeyword, hasSkills, hasBudgetRange } = flags;
  const firstFilterOptions = { limit: SEARCH_FALLBACK_LIMIT, offset: 0 };
  let entityResult: PaginatedResult<ProjectEntity>;

  if (hasKeyword) {
    entityResult = await timedOperation('searchProjects.keywordFirstFilter', () =>
      projectRepository.searchProjects(filters.keyword!, firstFilterOptions)
    );
  } else {
    entityResult = await timedOperation('searchProjects.skillsFirstFilter', () =>
      projectRepository.getProjectsBySkills(filters.skillIds!, firstFilterOptions)
    );
  }

  if (entityResult.items.length >= SEARCH_FALLBACK_LIMIT) {
    logger.warn('Search fallback limit reached, results may be incomplete', { limit: SEARCH_FALLBACK_LIMIT });
  }

  let filteredItems = entityResult.items;

  if (hasSkills) {
    const skillIdSet = new Set(filters.skillIds);
    filteredItems = filteredItems.filter(project =>
      project.required_skills.some(skill => skillIdSet.has(skill.skill_id))
    );
  }

  if (hasBudgetRange) {
    const minBudget = filters.minBudget ?? 0;
    const maxBudget = filters.maxBudget ?? Number.MAX_SAFE_INTEGER;
    filteredItems = filteredItems.filter(
      project => project.budget >= minBudget && project.budget <= maxBudget
    );
  }

  const paginatedItems = filteredItems.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < filteredItems.length;

  return { items: paginatedItems, hasMore, total: filteredItems.length };
}

/**
 * Search projects with keyword, skill, and budget filters
 */
export async function searchProjects(
  filters: ProjectSearchFilters,
  pagination?: SearchPaginationInput
): Promise<ServiceResult<SearchResult<Project>>> {
  const pageSize = normalizePageSize(pagination?.pageSize);
  const cacheKey = !isTestEnv()
    ? `search:projects:${JSON.stringify(filters)}:${pageSize}:${pagination?.offset ?? 0}`
    : null;

  if (cacheKey && projectCache) {
    const cached = projectCache.get(cacheKey) as SearchResult<Project> | undefined;
    if (cached) {
      return successResult(cached);
    }
  }

  const queryOptions = buildQueryOptions(pageSize, pagination?.offset);

  let entityResult: PaginatedResult<ProjectEntity>;

  // Determine which search method to use based on filters
  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;
  const hasBudgetRange = filters.minBudget !== undefined || filters.maxBudget !== undefined;

  // If multiple filters are provided, we need to apply them in memory
  // For single filters, we can use the optimized repository methods
  if (hasKeyword && !hasSkills && !hasBudgetRange) {
    // Keyword-only: the repository matches title OR description via a single
    // Query.or, so pagination happens server-side — no fetch-all fallback.
    entityResult = await timedOperation('searchProjects.keyword', () =>
      projectRepository.searchProjects(filters.keyword!, queryOptions)
    );
  } else if (hasSkills && !hasKeyword && !hasBudgetRange) {
    entityResult = await timedOperation('searchProjects.skills', () =>
      projectRepository.getProjectsBySkills(filters.skillIds!, queryOptions)
    );
  } else if (hasBudgetRange && !hasKeyword && !hasSkills) {
    const minBudget = filters.minBudget ?? 0;
    const maxBudget = filters.maxBudget ?? Number.MAX_SAFE_INTEGER;
    entityResult = await timedOperation('searchProjects.budget', () =>
      projectRepository.getProjectsByBudgetRange(minBudget, maxBudget, queryOptions)
    );
  } else if (!hasKeyword && !hasSkills && !hasBudgetRange) {
    // No filters - return all open projects
    entityResult = await timedOperation('searchProjects.allOpen', () =>
      projectRepository.getAllOpenProjects(queryOptions)
    );
  } else {
    entityResult = await searchProjectsMultiFilter(
      filters,
      {
        hasKeyword: Boolean(hasKeyword),
        hasSkills: Boolean(hasSkills),
        hasBudgetRange: Boolean(hasBudgetRange),
      },
      pageSize,
      pagination?.offset ?? 0
    );
  }

  // Map entities to models
  const projects = entityResult.items.map(mapProjectFromEntity);

  const result = buildSearchResult(projects, pageSize, entityResult.hasMore, pagination?.offset);
  if (cacheKey && projectCache) {
    projectCache.set(cacheKey, result);
  }
  return successResult(result);
}


/**
 * Normalize a freelancer-search skill filter into lowercase skill names.
 *
 * Freelancer profiles store skills by name (not ID), so incoming values may be
 * either skill document IDs or literal names. Values that resolve to a skill in
 * the taxonomy are converted to that skill's canonical name; anything that
 * isn't a known ID passes through as a literal name. Both the raw values and
 * the resolved names are kept, so a value that happens to be both a skill ID
 * and a name still matches. The lookup uses the strict repository variant so a
 * taxonomy read failure is distinguishable from "no matches" — it is logged as
 * a warning and matching degrades to name-only rather than failing the search.
 */
export async function resolveSkillFilterToNames(values: string[]): Promise<string[]> {
  const normalized = new Set(values.map(value => value.toLowerCase()));
  try {
    const resolved = await skillRepository.findSkillsByIdsStrict(values);
    for (const skill of resolved) {
      normalized.add(skill.name.toLowerCase());
    }
  } catch (error) {
    // Taxonomy lookup failed — skill IDs in the filter can't be resolved to
    // names. Fall back to name-only matching so the search still runs, but
    // surface the degradation instead of silently returning no matches.
    logger.warn('Skill ID resolution failed — degrading to name-only matching', {
      error: error instanceof Error ? error.message : String(error),
      skillFilterValues: values,
    });
  }
  return [...normalized];
}

/**
 * Search freelancers with keyword and skill filters
 */
export async function searchFreelancers(
  filters: FreelancerSearchFilters,
  pagination?: SearchPaginationInput
): Promise<ServiceResult<SearchResult<FreelancerProfile>>> {
  const pageSize = normalizePageSize(pagination?.pageSize);
  const cacheKey = !isTestEnv()
    ? `search:freelancers:${JSON.stringify(filters)}:${pageSize}:${pagination?.offset ?? 0}`
    : null;

  if (cacheKey && freelancerSearchCache) {
    const cached = freelancerSearchCache.get(cacheKey) as SearchResult<FreelancerProfile> | undefined;
    if (cached) {
      return successResult(cached);
    }
  }

  const queryOptions = buildQueryOptions(pageSize, pagination?.offset);

  const hasKeyword = filters.keyword && filters.keyword.trim().length > 0;
  const hasSkills = filters.skillIds && filters.skillIds.length > 0;

  // Resolve the skill filter (IDs and/or names) to lowercase names once; the
  // repository and the in-memory refine both match profiles by skill name.
  const skillNameValues = hasSkills
    ? await resolveSkillFilterToNames(filters.skillIds!)
    : undefined;

  let entityResult: PaginatedResult<FreelancerProfileEntity>;

  if (hasSkills && !hasKeyword) {
    entityResult = await timedOperation('searchFreelancers.skills', () =>
      freelancerProfileRepository.searchBySkills(skillNameValues!, queryOptions)
    );
  } else if (hasKeyword && !hasSkills) {
    entityResult = await timedOperation('searchFreelancers.keyword', () =>
      freelancerProfileRepository.searchByKeyword(filters.keyword!, queryOptions)
    );
  } else if (!hasKeyword && !hasSkills) {
    // No filters - return all profiles
    entityResult = await timedOperation('searchFreelancers.allProfiles', () =>
      freelancerProfileRepository.getAllProfilesPaginated(queryOptions)
    );
  } else {
    // Multiple filters - fetch broad set, filter in memory, then paginate
    const allProfiles = await timedOperation('searchFreelancers.allProfilesFallback', () =>
      freelancerProfileRepository.getAllProfilesPaginated({ limit: SEARCH_FALLBACK_LIMIT, offset: 0 })
    );

    if (allProfiles.items.length >= SEARCH_FALLBACK_LIMIT) {
      logger.warn('Freelancer search fallback limit reached, results may be incomplete', { limit: SEARCH_FALLBACK_LIMIT });
    }

    let filteredItems = allProfiles.items;

    // Apply keyword filter
    if (hasKeyword) {
      const keyword = filters.keyword!.toLowerCase();
      filteredItems = filteredItems.filter(profile =>
        profile.bio.toLowerCase().includes(keyword)
      );
    }

    // Apply skill filter using case-insensitive skill name matching
    if (hasSkills) {
      const skillNameSet = new Set(skillNameValues);
      filteredItems = filteredItems.filter(profile =>
        profile.skills.some(skill => skillNameSet.has(skill.name.toLowerCase()))
      );
    }

    const offset = pagination?.offset ?? 0;
    const paginatedItems = filteredItems.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < filteredItems.length;

    entityResult = { items: paginatedItems, hasMore, total: filteredItems.length };
  }

  // Map entities to models
  const profiles = entityResult.items.map(mapFreelancerProfileFromEntity);

  const result = buildSearchResult(profiles, pageSize, entityResult.hasMore, pagination?.offset);
  if (cacheKey && freelancerSearchCache) {
    freelancerSearchCache.set(cacheKey, result);
  }
  return successResult(result);
}
