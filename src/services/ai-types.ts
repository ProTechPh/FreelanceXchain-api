/**
 * Types for AI/LLM API integration
 */

// Request types
export type AIContent = {
  parts: Array<{ text: string }>;
};

export type AIRequest = {
  contents: AIContent[];
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
};

// Response types
export type AICandidate = {
  content: {
    parts: Array<{ text: string }>;
    role: string;
  };
  finishReason: string;
  index: number;
};

export type AIResponse = {
  candidates: AICandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
};

// Skill matching types
export type SkillMatchRequest = {
  freelancerSkills: SkillInfo[];
  projectRequirements: SkillInfo[];
  reputationScore?: number;
};

export type SkillInfo = {
  skillId: string;
  skillName: string;
  categoryId?: string;
  yearsOfExperience?: number;
};

export type SkillMatchResult = {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
};

// Skill extraction types
export type SkillExtractionRequest = {
  text: string;
  availableSkills: SkillInfo[];
};

export type ExtractedSkill = {
  skillId: string;
  skillName: string;
  confidence: number;
};

// Recommendation types
export type ProjectRecommendation = {
  projectId: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
};

export type FreelancerRecommendation = {
  freelancerId: string;
  matchScore: number;
  reputationScore: number;
  combinedScore: number;
  matchedSkills: string[];
  reasoning: string;
};

// Skill gap analysis types
export type SkillGapAnalysis = {
  currentSkills: string[];
  recommendedSkills: string[];
  marketDemand: Array<{
    skillName: string;
    demandLevel: 'high' | 'medium' | 'low';
  }>;
  reasoning: string;
};

// Error types
export type AIError = {
  code: string;
  message: string;
  retryable: boolean;
};

// Serialization types for round-trip testing
export type SerializableAIRequest = {
  type: 'skill_match' | 'skill_extraction' | 'skill_gap';
  payload: SkillMatchRequest | SkillExtractionRequest | { freelancerSkills: SkillInfo[] };
  timestamp: string;
  requestId: string;
};

export type SerializableAIResponse = {
  type: 'skill_match' | 'skill_extraction' | 'skill_gap';
  payload: SkillMatchResult | ExtractedSkill[] | SkillGapAnalysis;
  timestamp: string;
  requestId: string;
  processingTimeMs: number;
};
