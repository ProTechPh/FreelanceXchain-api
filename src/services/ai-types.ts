/**
 * Types for AI/LLM API integration
 */

// Request types
type AIContent = {
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
type AICandidate = {
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
  /** True when a Pro employer's project received the priority-matching boost. */
  priority?: boolean;
};

export type FreelancerRecommendation = {
  freelancerId: string;
  matchScore: number;
  reputationScore: number;
  averageRating?: number;
  totalRatings?: number;
  combinedScore: number;
  matchedSkills: string[];
  reasoning: string;
  /** True when this freelancer received the Pro priority-matching boost. */
  isPro?: boolean;
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

// AI Proposal Generation types
export type ProposalMilestonePlan = {
  title: string;
  description: string;
  amount: number;
  durationDays: number;
};

export type AIProposalGenerationRequest = {
  freelancerName: string;
  freelancerTitle?: string | undefined;
  freelancerBio?: string | undefined;
  freelancerSkills: string[];
  reputationScore: number;
  completedProjectsCount: number;
  disputeCount?: number | undefined;
  portfolioItems: Array<{
    title: string;
    description: string;
    skills?: string[] | undefined;
    projectUrl?: string | undefined;
  }>;
  projectTitle: string;
  projectDescription: string;
  projectSkills: string[];
  projectBudget: number;
  projectMilestones?: Array<{
    title: string;
    description?: string | undefined;
    amount?: number | undefined;
  }> | undefined;
  projectDeadline?: string | undefined;
  customNotes?: string | undefined;
};

export type AIProposalResult = {
  coverLetter: string;
  proposedRate: number;
  estimatedDuration: number;
  proposedMilestones: ProposalMilestonePlan[];
  highlights: string[];
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
