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
  SKILL_GAP_PROMPT,
} from './ai-client';
import {
  SkillMatchResult,
  ExtractedSkill,
  ProjectRecommendation,
  FreelancerRecommendation,
  SkillGapAnalysis,
  SkillInfo,
} from './ai-types';
import { projectRepository } from '../repositories/project-repository';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository';
import { getActiveSkills } from './skill-service';

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
        reputationScore: 0, // TODO: Get from reputation service
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
    
    // TODO: Get actual reputation score from blockchain
    const reputationScore = 50; // Default reputation score
    
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

  if (typeof response !== 'string') {
    // AI error, return basic analysis
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

  // Parse response
  try {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.slice(7);
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.slice(3);
    }
    if (cleanResponse.endsWith('```')) {
      cleanResponse = cleanResponse.slice(0, -3);
    }
    cleanResponse = cleanResponse.trim();

    const analysis = JSON.parse(cleanResponse) as SkillGapAnalysis;
    return {
      success: true,
      data: {
        currentSkills: analysis.currentSkills ?? currentSkills,
        recommendedSkills: analysis.recommendedSkills ?? [],
        marketDemand: analysis.marketDemand ?? [],
        reasoning: analysis.reasoning ?? '',
      },
    };
  } catch {
    return {
      success: true,
      data: {
        currentSkills,
        recommendedSkills: [],
        marketDemand: [],
        reasoning: 'Failed to parse AI response.',
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
