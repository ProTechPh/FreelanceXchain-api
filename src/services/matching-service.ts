import {
  analyzeSkillMatch,
  extractSkills,
  keywordMatchSkills,
  keywordExtractSkills,
  isAIAvailable,
  isAIError,
  generateContent,
  parseJsonResponse,
  SKILL_GAP_PROMPT,
} from './ai-client.js';
import { logger } from '../config/logger.js';
import {
  SkillMatchResult,
  ExtractedSkill,
  ProjectRecommendation,
  FreelancerRecommendation,
  SkillGapAnalysis,
  SkillInfo,
} from './ai-types.js';
import { createHash } from 'node:crypto';
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { getActiveSkills } from './skill-service.js';
import { getReputation } from './reputation-service.js';
import { redis } from '../config/redis.js';
import { LRUCache } from '../utils/cache.js';

import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

const DEFAULT_RECOMMENDATION_LIMIT = 10;
const REPUTATION_WEIGHT = 0.3;
const SKILL_MATCH_WEIGHT = 0.7;
const MATCHING_CACHE_TTL_SECONDS = 300; // 5 minutes
const SKILL_GAPS_CACHE_TTL_SECONDS = 600; // 10 minutes
const EXTRACT_SKILLS_CACHE_TTL_SECONDS = 3600; // 1 hour

export const localProjectRecCache = new LRUCache<ProjectRecommendation[]>(200, 5 * 60_000);
export const localFreelancerRecCache = new LRUCache<FreelancerRecommendation[]>(200, 5 * 60_000);
export const localExtractSkillsCache = new LRUCache<ExtractedSkill[]>(200, 60 * 60_000);
export const localSkillGapsCache = new LRUCache<SkillGapAnalysis>(200, 10 * 60_000);

async function getCached<T>(key: string, localCache: LRUCache<T>): Promise<T | null> {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  try {
    if (redis && redis.status === 'ready') {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
  } catch (err) {
    logger.warn(`Redis get failed for ${key}`, { error: err instanceof Error ? err.message : String(err) });
  }
  return localCache.get(key) ?? null;
}

async function setCached<T>(key: string, value: T, localCache: LRUCache<T>, ttlSeconds = MATCHING_CACHE_TTL_SECONDS): Promise<void> {
  localCache.set(key, value, ttlSeconds * 1000);
  try {
    if (redis && redis.status === 'ready') {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
  } catch (err) {
    logger.warn(`Redis set failed for ${key}`, { error: err instanceof Error ? err.message : String(err) });
  }
}

// Helper type for freelancer skill entity (new simplified structure)
type FreelancerSkillEntity = { name: string; years_of_experience: number };

// Helper type for project skill entity (keeps original structure for backward compatibility)
type ProjectSkillEntity = { skill_id: string; skill_name: string; category_id: string; years_of_experience?: number };

function freelancerSkillToInfo(entity: FreelancerSkillEntity): SkillInfo {
  return {
    skillId: '', // No longer using skill IDs for freelancers
    skillName: entity.name ?? '',
    categoryId: '', // No longer using category IDs for freelancers
    yearsOfExperience: entity.years_of_experience,
  };
}

function projectSkillToInfo(entity: ProjectSkillEntity): SkillInfo {
  return {
    skillId: entity.skill_id,
    skillName: entity.skill_name ?? '',
    categoryId: entity.category_id,
    yearsOfExperience: entity.years_of_experience ?? 0,
  };
}

export async function getProjectRecommendations(
  freelancerId: string,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT
): Promise<ServiceResult<ProjectRecommendation[]>> {
  const cacheKey = `matching:projects:${freelancerId}:${limit}`;
  const cached = await getCached<ProjectRecommendation[]>(cacheKey, localProjectRecCache);
  if (cached) {
    logger.debug('Returning cached project recommendations', { freelancerId, limit });
    return successResult(cached);
  }

  const profileEntity = await freelancerProfileRepository.getProfileByUserId(freelancerId);
  if (!profileEntity) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const projectsResult = await projectRepository.getAllOpenProjects({ limit: 100 });
  const projectEntities = projectsResult.items;

  if (projectEntities.length === 0) {
    return successResult([]);
  }

  const freelancerSkills = profileEntity.skills.map(freelancerSkillToInfo);

  // 1. Fast preliminary match using deterministic keyword matching
  const preMatched = projectEntities.map((projectEntity) => {
    const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);
    const keywordResult = keywordMatchSkills(freelancerSkills, projectRequirements);
    return {
      projectEntity,
      projectRequirements,
      keywordResult,
    };
  });

  preMatched.sort((a, b) => b.keywordResult.matchScore - a.keywordResult.matchScore);

  // 2. Take top items up to limit
  const topCandidates = preMatched.slice(0, limit);

  // 3. AI enhancement (if available) only for top candidates
  const recommendations: ProjectRecommendation[] = await Promise.all(
    topCandidates.map(async ({ projectEntity, projectRequirements, keywordResult }) => {
      let matchResult: SkillMatchResult = keywordResult;

      if (isAIAvailable()) {
        try {
          const aiResult = await analyzeSkillMatch({
            freelancerSkills,
            projectRequirements,
            reputationScore: 0,
          });

          if (!isAIError(aiResult)) {
            matchResult = aiResult;
          }
        } catch {
          // fallback to keywordResult
        }
      }

      return {
        projectId: projectEntity.id,
        matchScore: matchResult.matchScore,
        matchedSkills: matchResult.matchedSkills,
        missingSkills: matchResult.missingSkills,
        reasoning: matchResult.reasoning,
      };
    })
  );

  await setCached(cacheKey, recommendations, localProjectRecCache, MATCHING_CACHE_TTL_SECONDS);
  return successResult(recommendations);
}

export async function getFreelancerRecommendations(
  projectId: string,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT
): Promise<ServiceResult<FreelancerRecommendation[]>> {
  const cacheKey = `matching:freelancers:${projectId}:${limit}`;
  const cached = await getCached<FreelancerRecommendation[]>(cacheKey, localFreelancerRecCache);
  if (cached) {
    logger.debug('Returning cached freelancer recommendations', { projectId, limit });
    return successResult(cached);
  }

  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return errorResult('PROJECT_NOT_FOUND', 'Project not found');
  }

  const freelancerEntities = await freelancerProfileRepository.getAvailableProfiles();

  if (freelancerEntities.length === 0) {
    return successResult([]);
  }

  const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);

  // 1. Fast preliminary scoring
  const candidates = await Promise.all(
    freelancerEntities.map(async (freelancerEntity) => {
      const freelancerSkills = freelancerEntity.skills.map(freelancerSkillToInfo);
      const keywordResult = keywordMatchSkills(freelancerSkills, projectRequirements);

      let reputationScore = 50;
      try {
        const repResult = await getReputation(freelancerEntity.user_id);
        if (repResult.success && repResult.data.score > 0) {
          reputationScore = repResult.data.score;
        }
      } catch {
        // default
      }

      const combinedScore = Math.round(
        keywordResult.matchScore * SKILL_MATCH_WEIGHT +
        reputationScore * REPUTATION_WEIGHT
      );

      return {
        freelancerEntity,
        freelancerSkills,
        keywordResult,
        reputationScore,
        combinedScore,
      };
    })
  );

  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  const topCandidates = candidates.slice(0, limit);

  // 2. Enhance top candidates only
  const recommendations: FreelancerRecommendation[] = await Promise.all(
    topCandidates.map(async ({ freelancerEntity, freelancerSkills, keywordResult, reputationScore }) => {
      let matchResult = keywordResult;

      if (isAIAvailable()) {
        try {
          const aiResult = await analyzeSkillMatch({
            freelancerSkills,
            projectRequirements,
            reputationScore,
          });
          if (!isAIError(aiResult)) {
            matchResult = aiResult;
          }
        } catch {
          // fallback to keyword
        }
      }

      const finalCombinedScore = Math.round(
        matchResult.matchScore * SKILL_MATCH_WEIGHT +
        reputationScore * REPUTATION_WEIGHT
      );

      return {
        freelancerId: freelancerEntity.user_id,
        matchScore: matchResult.matchScore,
        reputationScore,
        combinedScore: finalCombinedScore,
        matchedSkills: matchResult.matchedSkills,
        reasoning: matchResult.reasoning,
      };
    })
  );

  recommendations.sort((a, b) => b.combinedScore - a.combinedScore);
  await setCached(cacheKey, recommendations, localFreelancerRecCache, MATCHING_CACHE_TTL_SECONDS);
  return successResult(recommendations);
}

export async function extractSkillsFromText(
  text: string
): Promise<ServiceResult<ExtractedSkill[]>> {
  if (!text || text.trim().length === 0) {
    return errorResult('INVALID_INPUT', 'Text cannot be empty');
  }

  const hash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
  const cacheKey = `matching:extract-skills:${hash}`;
  const cached = await getCached<ExtractedSkill[]>(cacheKey, localExtractSkillsCache);
  if (cached) {
    logger.debug('Returning cached extracted skills', { hash });
    return successResult(cached);
  }

  const activeSkills = await getActiveSkills();
  const availableSkills: SkillInfo[] = activeSkills.map(skill => ({
    skillId: skill.id,
    skillName: skill.name,
    categoryId: skill.categoryId,
  }));

  if (availableSkills.length === 0) {
    return successResult([]);
  }

  let extractedSkills: ExtractedSkill[];

  if (isAIAvailable()) {
    const aiResult = await extractSkills({
      text,
      availableSkills,
    });

    if (isAIError(aiResult)) {
      // Fall back to keyword extraction
      /* istanbul ignore next */
      extractedSkills = keywordExtractSkills(text, availableSkills);
    } else {
      extractedSkills = aiResult;
    }
  } else {
    extractedSkills = keywordExtractSkills(text, availableSkills);
  }

  const validSkillIds = new Set(availableSkills.map(s => s.skillId));
  const mappedSkills = extractedSkills.filter(skill => validSkillIds.has(skill.skillId));

  await setCached(cacheKey, mappedSkills, localExtractSkillsCache, EXTRACT_SKILLS_CACHE_TTL_SECONDS);
  return successResult(mappedSkills);
}

export async function analyzeSkillGaps(
  freelancerId: string
): Promise<ServiceResult<SkillGapAnalysis>> {
  const cacheKey = `matching:skill-gaps:${freelancerId}`;
  const cached = await getCached<SkillGapAnalysis>(cacheKey, localSkillGapsCache);
  if (cached) {
    logger.debug('Returning cached skill gaps', { freelancerId });
    return successResult(cached);
  }

  const profileEntity = await freelancerProfileRepository.getProfileByUserId(freelancerId);
  if (!profileEntity) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const currentSkills = profileEntity.skills.map(s => s.name);

  if (!isAIAvailable()) {
    return successResult({
      currentSkills,
      recommendedSkills: [],
      marketDemand: [],
      reasoning: 'AI analysis unavailable; no skill gap insights generated.',
    });
  }

  const prompt = SKILL_GAP_PROMPT.replace('{currentSkills}', JSON.stringify(currentSkills));

  const response = await generateContent(prompt);

  if (typeof response !== 'string') {
    logger.warn('[SkillGap] AI unavailable or rate-limited, using fallback', { response });
    return successResult({
      currentSkills,
      recommendedSkills: [],
      marketDemand: [],
      reasoning: 'AI analysis failed or returned non-text response.',
    });
  }

  try {
    const parsedAnalysis = parseJsonResponse<SkillGapAnalysis>(response, 'SkillGap');
    if (!parsedAnalysis) {
      throw new Error('parseJsonResponse returned null');
    }

    const analysis = parsedAnalysis;
    
    // Be lenient - accept marketDemand items and fix missing fields
    const sanitizedMarketDemand = (analysis.marketDemand ?? [])
      .map(item => {
        if (!item || typeof item.skillName !== 'string' || !item.skillName.trim()) {
          return null;
        }
        
        const validLevels = ['high', 'medium', 'low'];
        const demandLevel = validLevels.includes(item.demandLevel) 
          ? item.demandLevel 
          : 'medium';
        
        return {
          skillName: item.skillName.trim(),
          demandLevel: demandLevel as 'high' | 'medium' | 'low'
        };
      })
      .filter(item => item !== null) as Array<{ skillName: string; demandLevel: 'high' | 'medium' | 'low' }>;
    
    const result: SkillGapAnalysis = {
      currentSkills: analysis.currentSkills ?? currentSkills,
      recommendedSkills: analysis.recommendedSkills ?? [],
      marketDemand: sanitizedMarketDemand,
      reasoning: analysis.reasoning ?? 'Analysis completed.',
    };

    await setCached(cacheKey, result, localSkillGapsCache, SKILL_GAPS_CACHE_TTL_SECONDS);
    return successResult(result);
  } catch (error) {
    logger.warn('[SkillGap] Failed to parse AI response, using fallback', { error });
    return successResult({
      currentSkills,
      recommendedSkills: [],
      marketDemand: [],
      reasoning: 'Failed to parse AI response.',
    });
  }
}

/**
 * @internal Test-only helper — calculate match score between a freelancer and a project
 */
export function calculateMatchScore(
  freelancerSkills: SkillInfo[],
  projectRequirements: SkillInfo[]
): SkillMatchResult {
  return keywordMatchSkills(freelancerSkills, projectRequirements);
}

/**
 * @internal Test-only helper — sort recommendations by match score
 */
export function sortRecommendationsByScore<T extends { matchScore: number }>(
  recommendations: T[]
): T[] {
  return [...recommendations].sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * @internal Test-only helper — sort freelancer recommendations by combined score
 */
export function sortFreelancerRecommendationsByCombinedScore(
  recommendations: FreelancerRecommendation[]
): FreelancerRecommendation[] {
  return [...recommendations].sort((a, b) => b.combinedScore - a.combinedScore);
}

export function isMatchingError<T>(
  result: ServiceResult<T>
): result is { success: false; error: ServiceError } {
  return !result.success;
}
