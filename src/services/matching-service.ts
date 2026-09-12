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
  generateAIProposal,
  fallbackGenerateProposal,
} from './ai-client.js';
import { logger } from '../config/logger.js';
import {
  SkillMatchResult,
  ExtractedSkill,
  ProjectRecommendation,
  FreelancerRecommendation,
  SkillGapAnalysis,
  SkillInfo,
  AIProposalResult,
  AIProposalGenerationRequest,
} from './ai-types.js';
import { createHash } from 'node:crypto';
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { portfolioRepository } from '../repositories/portfolio-repository.js';
import { databases, DATABASE_ID } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { safeJsonParse } from '../utils/index.js';
import { getActiveSkills } from './skill-service.js';
import { getReputation } from './reputation-service.js';
import { getProUserIdSet } from './subscription-service.js';
import { redis } from '../config/redis.js';
import { LRUCache } from '../utils/cache.js';

import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

const DEFAULT_RECOMMENDATION_LIMIT = 10;
const REPUTATION_WEIGHT = 0.3;
const SKILL_MATCH_WEIGHT = 0.7;
const MATCHING_CACHE_TTL_SECONDS = 300; // 5 minutes
/**
 * Priority matching: the Pro perk, expressed on the same 0-100 scale as the
 * match scores. Deliberately small — a Pro freelancer outranks an equally good
 * Free one and edges past a marginally better one, but cannot displace a
 * materially better match. Selling ranking, not outcomes.
 *
 * NOTE: results are cached for MATCHING_CACHE_TTL_SECONDS without the plan in
 * the cache key, so a freshly-upgraded user can wait up to that long for the
 * boost to appear. Accepted over key-scanning invalidation.
 */
const PRO_RANKING_BOOST = 5;
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

  // Priority matching: a Pro employer's project sorts higher. The boost is
  // applied to the SORT KEY only — matchScore is shown to the freelancer, so
  // inflating it would misreport how well they actually fit the project.
  const proEmployerIds = await getProUserIdSet(
    preMatched.map(({ projectEntity }) => projectEntity.employer_id)
  );

  const rankOf = (entry: typeof preMatched[number]): number =>
    entry.keywordResult.matchScore +
    (proEmployerIds.has(entry.projectEntity.employer_id) ? PRO_RANKING_BOOST : 0);

  preMatched.sort((a, b) => rankOf(b) - rankOf(a));

  // 2. Take top items up to limit
  const topCandidates = preMatched.slice(0, limit);

  // 3. AI enhancement (if available) only for top candidates (capped at top 3 for optimal performance)
  const recommendations: ProjectRecommendation[] = await Promise.all(
    topCandidates.map(async ({ projectEntity, projectRequirements, keywordResult }, index) => {
      let matchResult: SkillMatchResult = keywordResult;

      if (index < 3 && isAIAvailable()) {
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
        priority: proEmployerIds.has(projectEntity.employer_id),
      };
    })
  );

  await setCached(cacheKey, recommendations, localProjectRecCache, MATCHING_CACHE_TTL_SECONDS);
  return successResult(recommendations);
}

async function scoreFreelancerCandidate(
  freelancerEntity: (typeof freelancerProfileRepository extends { getAvailableProfiles: () => Promise<(infer T)[]> } ? T : any),
  projectRequirements: SkillInfo[],
  isProFreelancer = false
) {
  const freelancerSkills = freelancerEntity.skills.map(freelancerSkillToInfo);
  const keywordResult = keywordMatchSkills(freelancerSkills, projectRequirements);

  let actualReputationScore = 0; // 0-100 percentage
  let averageRating = 0; // 0.0-5.0
  let totalRatings = 0;
  let rankingReputationScore = 70; // baseline neutral reputation for matching rank if unrated

  try {
    const repResult = await getReputation(freelancerEntity.user_id);
    if (repResult.success && repResult.data.totalRatings > 0) {
      totalRatings = repResult.data.totalRatings;
      averageRating = repResult.data.averageRating || repResult.data.score || 0;
      // Scale from 1-5 star rating to 0-100 percentage:
      actualReputationScore = Math.min(100, Math.max(0, Math.round((averageRating / 5) * 100)));
      rankingReputationScore = actualReputationScore;
    }
  } catch {
    // default
  }

  const combinedScore = Math.min(100, Math.round(
    keywordResult.matchScore * SKILL_MATCH_WEIGHT +
    rankingReputationScore * REPUTATION_WEIGHT
  ) + (isProFreelancer ? PRO_RANKING_BOOST : 0));

  return {
    freelancerEntity,
    freelancerSkills,
    keywordResult,
    reputationScore: actualReputationScore,
    averageRating,
    totalRatings,
    rankingReputationScore,
    combinedScore,
    isProFreelancer,
  };
}

/**
 * Turn one scored candidate into a recommendation, optionally refining the
 * skill match with the AI model. Extracted from getFreelancerRecommendations so
 * that function stays within the repo's length limit.
 */
async function buildFreelancerRecommendation(
  candidate: Awaited<ReturnType<typeof scoreFreelancerCandidate>>,
  projectRequirements: SkillInfo[],
  index: number
): Promise<FreelancerRecommendation> {
  const {
    freelancerEntity,
    freelancerSkills,
    keywordResult,
    reputationScore,
    averageRating,
    totalRatings,
    rankingReputationScore,
    isProFreelancer,
  } = candidate;

  let matchResult = keywordResult;

  if (index < 3 && isAIAvailable()) {
    try {
      const aiResult = await analyzeSkillMatch({
        freelancerSkills,
        projectRequirements,
        reputationScore: rankingReputationScore,
      });
      if (!isAIError(aiResult)) {
        matchResult = aiResult;
      }
    } catch {
      // fallback to keyword
    }
  }

  // The Pro boost is re-applied here on purpose: this recomputes the score from
  // scratch after AI enhancement and would otherwise silently drop it.
  const finalCombinedScore = Math.min(100, Math.round(
    matchResult.matchScore * SKILL_MATCH_WEIGHT +
    rankingReputationScore * REPUTATION_WEIGHT
  ) + (isProFreelancer ? PRO_RANKING_BOOST : 0));

  return {
    freelancerId: freelancerEntity.user_id,
    matchScore: matchResult.matchScore,
    reputationScore,
    averageRating,
    totalRatings,
    combinedScore: finalCombinedScore,
    matchedSkills: matchResult.matchedSkills,
    reasoning: matchResult.reasoning,
    isPro: isProFreelancer,
  };
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
  // Fast in-memory candidate pre-filtering to prevent N+1 queries when hundreds of profiles exist
  const poolSize = Math.max(limit * 3, 20);
  let evaluatedEntities = freelancerEntities;

  if (freelancerEntities.length > poolSize) {
    const quickScored = freelancerEntities.map((freelancerEntity) => {
      const freelancerSkills = freelancerEntity.skills.map(freelancerSkillToInfo);
      const keywordResult = keywordMatchSkills(freelancerSkills, projectRequirements);
      const maxPossibleScore = Math.round(
        keywordResult.matchScore * SKILL_MATCH_WEIGHT +
        100 * REPUTATION_WEIGHT
      );
      return { freelancerEntity, maxPossibleScore };
    });

    quickScored.sort((a, b) => b.maxPossibleScore - a.maxPossibleScore);
    evaluatedEntities = quickScored.slice(0, poolSize).map((s) => s.freelancerEntity);
  }

  // Priority matching: resolved over the already-narrowed pool, so this is a
  // bounded batch read rather than a scan of every profile.
  const proFreelancerIds = await getProUserIdSet(
    evaluatedEntities.map((freelancerEntity) => freelancerEntity.user_id)
  );

  const candidates = await Promise.all(
    evaluatedEntities.map((freelancerEntity) =>
      scoreFreelancerCandidate(
        freelancerEntity,
        projectRequirements,
        proFreelancerIds.has(freelancerEntity.user_id)
      )
    )
  );

  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  const topCandidates = candidates.slice(0, limit);

  // 2. Enhance top candidates only (capped at top 3 for optimal performance)
  const recommendations: FreelancerRecommendation[] = await Promise.all(
    topCandidates.map((candidate, index) =>
      buildFreelancerRecommendation(candidate, projectRequirements, index)
    )
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

/**
 * Generate a personalized AI proposal for a freelancer applying to a project
 */
export async function generateProposalForProject(
  freelancerId: string,
  projectId: string,
  customNotes?: string
): Promise<ServiceResult<AIProposalResult>> {
  try {
    const [freelancerProfile, userDoc, portfolioEntities, reputationResult, projectEntity] = await Promise.all([
      freelancerProfileRepository.getProfileByUserId(freelancerId),
      databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, freelancerId).catch(() => null),
      portfolioRepository.findByFreelancer(freelancerId).catch(() => []),
      getReputation(freelancerId).catch(() => null),
      projectRepository.findProjectById(projectId),
    ]);

    if (!projectEntity) {
      return errorResult('PROJECT_NOT_FOUND', 'Project not found');
    }

    const freelancerName = (userDoc?.['name'] as string) || freelancerProfile?.name || 'Freelancer';
    const freelancerTitle = freelancerProfile?.bio ? freelancerProfile.bio.slice(0, 60) : 'Full-Stack Web3 Developer';
    const freelancerBio = freelancerProfile?.bio || '';
    const freelancerSkills = (freelancerProfile?.skills || []).map((s: { name: string }) => s.name);

    // Calculate score / reputation accurately
    const totalRatings = reputationResult && reputationResult.success ? reputationResult.data.totalRatings : 0;
    const repScoreRaw = reputationResult && reputationResult.success ? reputationResult.data.score : 0;
    const reputationScore = totalRatings > 0 && repScoreRaw > 0
      ? Math.min(100, Math.round((repScoreRaw / 5) * 100))
      : 0;
    const completedProjectsCount = totalRatings;

    // Map project skills & milestones
    const projectSkills = (projectEntity.required_skills || [])
      .map((s: { skill_name?: string }) => s.skill_name || '')
      .filter(Boolean);

    const projectMilestones = (projectEntity.milestones || []).map((m: { title: string; description?: string; amount?: number }) => ({
      title: m.title,
      description: m.description || '',
      amount: m.amount || 0,
    }));

    const mappedPortfolio = portfolioEntities.map((item: { title: string; description: string; skills?: string; project_url?: string }) => ({
      title: item.title,
      description: item.description,
      skills: item.skills ? (safeJsonParse<string[]>(item.skills) || []) : [],
      projectUrl: item.project_url,
    }));

    const requestData: AIProposalGenerationRequest = {
      freelancerName,
      freelancerTitle,
      freelancerBio,
      freelancerSkills,
      reputationScore,
      completedProjectsCount,
      portfolioItems: mappedPortfolio,
      projectTitle: projectEntity.title,
      projectDescription: projectEntity.description,
      projectSkills,
      projectBudget: projectEntity.budget,
      projectMilestones,
      projectDeadline: projectEntity.deadline,
      ...(customNotes ? { customNotes } : {}),
    };

    const aiResult = await generateAIProposal(requestData);

    if (isAIError(aiResult)) {
      return successResult(fallbackGenerateProposal(requestData));
    }

    return successResult(aiResult);
  } catch (error) {
    logger.error('Failed to generate proposal for project', { error, freelancerId, projectId });
    return errorResult('INTERNAL_ERROR', 'Failed to generate proposal');
  }
}

export function isMatchingError<T>(
  result: ServiceResult<T>
): result is { success: false; error: ServiceError } {
  return !result.success;
}
