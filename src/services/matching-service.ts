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
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { getActiveSkills } from './skill-service.js';
import { getReputation } from './reputation-service.js';

import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';


const DEFAULT_RECOMMENDATION_LIMIT = 10;
const REPUTATION_WEIGHT = 0.3;
const SKILL_MATCH_WEIGHT = 0.7;

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

  const recommendations: ProjectRecommendation[] = await Promise.all(
    projectEntities.map(async (projectEntity) => {
      const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);

      let matchResult: SkillMatchResult;

      if (isAIAvailable()) {
        const aiResult = await analyzeSkillMatch({
          freelancerSkills,
          projectRequirements,
          reputationScore: 0,
        });

        if (isAIError(aiResult)) {
          matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
        } else {
          matchResult = aiResult;
        }
      } else {
        matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
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

  recommendations.sort((a, b) => b.matchScore - a.matchScore);

  return successResult(recommendations.slice(0, limit));
}

export async function getFreelancerRecommendations(
  projectId: string,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT
): Promise<ServiceResult<FreelancerRecommendation[]>> {
  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return errorResult('PROJECT_NOT_FOUND', 'Project not found');
  }

  const freelancerEntities = await freelancerProfileRepository.getAvailableProfiles();

  if (freelancerEntities.length === 0) {
    return successResult([]);
  }

  const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);

  const recommendations: FreelancerRecommendation[] = [];

  for (const freelancerEntity of freelancerEntities) {
    const freelancerSkills = freelancerEntity.skills.map(freelancerSkillToInfo);
    
    let reputationScore = 50; // Default if lookup fails
    try {
      const repResult = await getReputation(freelancerEntity.user_id);
      if (repResult.success && repResult.data.score > 0) {
        reputationScore = repResult.data.score;
      }
    } catch {
      // Use default score on failure
    }
    
    let matchResult: SkillMatchResult;
    
    if (isAIAvailable()) {
      const aiResult = await analyzeSkillMatch({
        freelancerSkills,
        projectRequirements,
        reputationScore,
      });
      
      if (isAIError(aiResult)) {
        matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
      } else {
        matchResult = aiResult;
      }
    } else {
      matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
    }

    const combinedScore = Math.round(
      matchResult.matchScore * SKILL_MATCH_WEIGHT + 
      reputationScore * REPUTATION_WEIGHT
    );

    recommendations.push({
      freelancerId: freelancerEntity.user_id,
      matchScore: matchResult.matchScore,
      reputationScore,
      combinedScore,
      matchedSkills: matchResult.matchedSkills,
      reasoning: matchResult.reasoning,
    });
  }

  recommendations.sort((a, b) => b.combinedScore - a.combinedScore);

  return successResult(recommendations.slice(0, limit));
}

export async function extractSkillsFromText(
  text: string
): Promise<ServiceResult<ExtractedSkill[]>> {
  if (!text || text.trim().length === 0) {
    return errorResult('INVALID_INPUT', 'Text cannot be empty');
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

  return successResult(mappedSkills);
}

export async function analyzeSkillGaps(
  freelancerId: string
): Promise<ServiceResult<SkillGapAnalysis>> {
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(freelancerId);
  if (!profileEntity) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const currentSkills = profileEntity.skills.map(s => s.name);

  if (!isAIAvailable()) {
    // Return basic analysis without AI
    return successResult({
      currentSkills,
      recommendedSkills: [],
      marketDemand: [],
      reasoning: 'AI analysis unavailable. Please configure LLM API for detailed skill gap analysis.',
    });
    }

  const prompt = SKILL_GAP_PROMPT.replace('{currentSkills}', JSON.stringify(currentSkills));

  const response = await generateContent(prompt);

  logger.debug('[SkillGap] generateContent returned', { type: typeof response });

  if (typeof response !== 'string') {
    // AI error, return basic analysis
    logger.error('[SkillGap] AI returned non-string', { type: typeof response });
    return successResult({
      currentSkills,
      recommendedSkills: [],
      marketDemand: [],
      reasoning: 'AI analysis failed. Please try again later.',
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
        // Skip completely invalid items
        if (!item || typeof item.skillName !== 'string' || !item.skillName.trim()) {
          return null;
        }
        
        // Fix missing or invalid demandLevel
        const validLevels = ['high', 'medium', 'low'];
        const demandLevel = validLevels.includes(item.demandLevel) 
          ? item.demandLevel 
          : 'medium'; // Default to medium if missing/invalid
        
        return {
          skillName: item.skillName.trim(),
          demandLevel: demandLevel as 'high' | 'medium' | 'low'
        };
      })
      .filter(item => item !== null) as Array<{ skillName: string; demandLevel: 'high' | 'medium' | 'low' }>;
    
    logger.debug('[SkillGap] Successfully parsed', {
      currentSkills: analysis.currentSkills?.length ?? 0,
      recommendedSkills: analysis.recommendedSkills?.length ?? 0,
      marketDemand: sanitizedMarketDemand.length
    });
    
    return successResult({
      currentSkills: analysis.currentSkills ?? currentSkills,
      recommendedSkills: analysis.recommendedSkills ?? [],
      marketDemand: sanitizedMarketDemand,
      reasoning: analysis.reasoning ?? 'Analysis completed.',
    });
      } catch (error) {
      logger.error('[SkillGap] Failed to parse AI response', { error });
      /* istanbul ignore next -- response is guaranteed string by line 313 early return */
      logger.debug('[SkillGap] Response preview', { preview: typeof response === 'string' ? response.substring(0, 500) : String(response).substring(0, 500) });
    
      return successResult({
        currentSkills,
        recommendedSkills: [],
        marketDemand: [],
        reasoning: 'Failed to parse AI response. The AI may need to be reconfigured.',
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
