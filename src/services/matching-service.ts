/**
 * AI Matching Service
 * Provides AI-powered skill matching between freelancers and projects
 */

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

// Types
export type MatchingServiceError = {
  code: string;
  message: string;
};

export type MatchingServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: MatchingServiceError };

// Constants
const DEFAULT_RECOMMENDATION_LIMIT = 10;
const REPUTATION_WEIGHT = 0.3;
const SKILL_MATCH_WEIGHT = 0.7;

// Helper type for freelancer skill entity (new simplified structure)
type FreelancerSkillEntity = { name: string; years_of_experience: number };

// Helper type for project skill entity (keeps original structure for backward compatibility)
type ProjectSkillEntity = { skill_id: string; skill_name: string; category_id: string; years_of_experience?: number };

/**
 * Convert freelancer skill entity to SkillInfo for matching
 */
function freelancerSkillToInfo(entity: FreelancerSkillEntity): SkillInfo {
  return {
    skillId: '', // No longer using skill IDs for freelancers
    skillName: entity.name,
    categoryId: '', // No longer using category IDs for freelancers
    yearsOfExperience: entity.years_of_experience,
  };
}

/**
 * Convert project skill entity to SkillInfo for matching
 */
function projectSkillToInfo(entity: ProjectSkillEntity): SkillInfo {
  return {
    skillId: entity.skill_id,
    skillName: entity.skill_name,
    categoryId: entity.category_id,
    yearsOfExperience: entity.years_of_experience ?? 0,
  };
}

/**
 * Get project recommendations for a freelancer
 * Projects are ranked by AI-computed match score in descending order
 */
export async function getProjectRecommendations(
  freelancerId: string,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT
): Promise<MatchingServiceResult<ProjectRecommendation[]>> {
  // Get freelancer profile
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(freelancerId);
  if (!profileEntity) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  // Get open projects
  const projectsResult = await projectRepository.getAllOpenProjects({ limit: 100 });
  const projectEntities = projectsResult.items;

  if (projectEntities.length === 0) {
    return { success: true, data: [] };
  }

  // Convert freelancer skills to SkillInfo
  const freelancerSkills = profileEntity.skills.map(freelancerSkillToInfo);

  // Calculate match scores for each project
  const recommendations: ProjectRecommendation[] = [];

  for (const projectEntity of projectEntities) {
    const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);
    
    let matchResult: SkillMatchResult;
    
    if (isAIAvailable()) {
      const aiResult = await analyzeSkillMatch({
        freelancerSkills,
        projectRequirements,
        reputationScore: 0, // Project recommendations don't weight reputation
      });
      
      if (isAIError(aiResult)) {
        // Fall back to keyword matching
        matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
      } else {
        matchResult = aiResult;
      }
    } else {
      // Use keyword matching fallback
      matchResult = keywordMatchSkills(freelancerSkills, projectRequirements);
    }

    recommendations.push({
      projectId: projectEntity.id,
      matchScore: matchResult.matchScore,
      matchedSkills: matchResult.matchedSkills,
      missingSkills: matchResult.missingSkills,
      reasoning: matchResult.reasoning,
    });
  }

  // Sort by match score descending
  recommendations.sort((a, b) => b.matchScore - a.matchScore);

  // Return top N recommendations
  return { success: true, data: recommendations.slice(0, limit) };
}

/**
 * Get freelancer recommendations for a project
 * Freelancers are ranked by combined skill relevance and reputation score
 */
export async function getFreelancerRecommendations(
  projectId: string,
  limit: number = DEFAULT_RECOMMENDATION_LIMIT
): Promise<MatchingServiceResult<FreelancerRecommendation[]>> {
  // Get project
  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    };
  }

  // Get available freelancers
  const freelancerEntities = await freelancerProfileRepository.getAvailableProfiles();

  if (freelancerEntities.length === 0) {
    return { success: true, data: [] };
  }

  // Convert project requirements to SkillInfo
  const projectRequirements = projectEntity.required_skills.map(projectSkillToInfo);

  // Calculate match scores for each freelancer
  const recommendations: FreelancerRecommendation[] = [];

  for (const freelancerEntity of freelancerEntities) {
    const freelancerSkills = freelancerEntity.skills.map(freelancerSkillToInfo);
    
    // Get actual reputation score from reputation service
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

    // Calculate combined score with reputation weighting
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

  // Sort by combined score descending
  recommendations.sort((a, b) => b.combinedScore - a.combinedScore);

  // Return top N recommendations
  return { success: true, data: recommendations.slice(0, limit) };
}

/**
 * Extract skills from text and map to taxonomy
 */
export async function extractSkillsFromText(
  text: string
): Promise<MatchingServiceResult<ExtractedSkill[]>> {
  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Text cannot be empty' },
    };
  }

  // Get available skills from taxonomy
  const activeSkills = await getActiveSkills();
  const availableSkills: SkillInfo[] = activeSkills.map(skill => ({
    skillId: skill.id,
    skillName: skill.name,
    categoryId: skill.categoryId,
  }));

  if (availableSkills.length === 0) {
    return { success: true, data: [] };
  }

  let extractedSkills: ExtractedSkill[];

  if (isAIAvailable()) {
    const aiResult = await extractSkills({
      text,
      availableSkills,
    });

    if (isAIError(aiResult)) {
      // Fall back to keyword extraction
      extractedSkills = keywordExtractSkills(text, availableSkills);
    } else {
      extractedSkills = aiResult;
    }
  } else {
    // Use keyword extraction fallback
    extractedSkills = keywordExtractSkills(text, availableSkills);
  }

  // Map extracted skills to taxonomy (validate skill IDs exist)
  const validSkillIds = new Set(availableSkills.map(s => s.skillId));
  const mappedSkills = extractedSkills.filter(skill => validSkillIds.has(skill.skillId));

  return { success: true, data: mappedSkills };
}

/**
 * Analyze skill gaps for a freelancer
 */
export async function analyzeSkillGaps(
  freelancerId: string
): Promise<MatchingServiceResult<SkillGapAnalysis>> {
  // Get freelancer profile
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(freelancerId);
  if (!profileEntity) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const currentSkills = profileEntity.skills.map(s => s.name);

  if (!isAIAvailable()) {
    // Return basic analysis without AI
    return {
      success: true,
      data: {
        currentSkills,
        recommendedSkills: [],
        marketDemand: [],
        reasoning: 'AI analysis unavailable. Please configure LLM API for detailed skill gap analysis.',
      },
    };
  }

  // Build prompt for skill gap analysis
  const prompt = SKILL_GAP_PROMPT.replace('{currentSkills}', JSON.stringify(currentSkills));

  const response = await generateContent(prompt);

  console.log('[SkillGap] generateContent returned type:', typeof response);
  console.log('[SkillGap] generateContent returned value:', JSON.stringify(response).substring(0, 300));

  if (typeof response !== 'string') {
    // AI error, return basic analysis
    console.error('[SkillGap] AI returned non-string:', response);
    return {
      success: true,
      data: {
        currentSkills,
        recommendedSkills: [],
        marketDemand: [],
        reasoning: 'AI analysis failed. Please try again later.',
      },
    };
  }

  // Parse response using shared robust parser
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
    
    console.log('[SkillGap] Successfully parsed:', {
      currentSkills: analysis.currentSkills?.length ?? 0,
      recommendedSkills: analysis.recommendedSkills?.length ?? 0,
      marketDemand: sanitizedMarketDemand.length
    });
    
    return {
      success: true,
      data: {
        currentSkills: analysis.currentSkills ?? currentSkills,
        recommendedSkills: analysis.recommendedSkills ?? [],
        marketDemand: sanitizedMarketDemand,
        reasoning: analysis.reasoning ?? 'Analysis completed.',
      },
    };
  } catch (error) {
    console.error('[SkillGap] Failed to parse AI response:', error);
    console.error('[SkillGap] Response was:', response.substring(0, 1000));
    
    return {
      success: true,
      data: {
        currentSkills,
        recommendedSkills: [],
        marketDemand: [],
        reasoning: 'Failed to parse AI response. The AI may need to be reconfigured.',
      },
    };
  }
}

/**
 * Calculate match score between a freelancer and a project (for testing)
 */
export function calculateMatchScore(
  freelancerSkills: SkillInfo[],
  projectRequirements: SkillInfo[]
): SkillMatchResult {
  return keywordMatchSkills(freelancerSkills, projectRequirements);
}

/**
 * Sort recommendations by match score (for testing)
 */
export function sortRecommendationsByScore<T extends { matchScore: number }>(
  recommendations: T[]
): T[] {
  return [...recommendations].sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Sort freelancer recommendations by combined score (for testing)
 */
export function sortFreelancerRecommendationsByCombinedScore(
  recommendations: FreelancerRecommendation[]
): FreelancerRecommendation[] {
  return [...recommendations].sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Check if matching service result is an error
 */
export function isMatchingError<T>(
  result: MatchingServiceResult<T>
): result is { success: false; error: MatchingServiceError } {
  return !result.success;
}
