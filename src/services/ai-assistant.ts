/**
 * AI Assistant Service
 * Provides AI-powered content generation and analysis features
 */

import { generateContent, isAIAvailable, isAIError } from './ai-client.js';
import { projectRepository } from '../repositories/project-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { mapProjectFromEntity } from '../utils/entity-mapper.js';

// Types
export type AIAssistantError = {
  code: string;
  message: string;
};

export type AIAssistantResult<T> =
  | { success: true; data: T }
  | { success: false; error: AIAssistantError };

// Proposal Writer Types
export type ProposalWriterInput = {
  projectId: string;
  freelancerId: string;
  highlights?: string[];
  tone?: 'professional' | 'friendly' | 'confident';
};

export type GeneratedProposal = {
  coverLetter: string;
  suggestedRate: number;
  estimatedDuration: number;
  keyPoints: string[];
};

// Project Description Types
export type ProjectDescriptionInput = {
  title: string;
  category: string;
  skills: string[];
  budget: number;
  deadline?: string;
  additionalInfo?: string;
};

export type GeneratedProjectDescription = {
  description: string;
  suggestedMilestones: { title: string; description: string; percentage: number }[];
  tips: string[];
};

// Dispute Analysis Types
export type DisputeAnalysisInput = {
  disputeId: string;
};

export type DisputeAnalysisResult = {
  summary: string;
  freelancerPoints: string[];
  employerPoints: string[];
  suggestedResolution: 'freelancer_favor' | 'employer_favor' | 'split';
  confidence: number;
  reasoning: string;
  fairnessScore: number;
};


// Prompt Templates
const PROPOSAL_WRITER_PROMPT = `
You are an expert freelance proposal writer. Generate a compelling cover letter for a freelancer applying to a project.

Project Details:
- Title: {projectTitle}
- Description: {projectDescription}
- Required Skills: {requiredSkills}
- Budget: ${'{budget}'}
- Deadline: {deadline}

Freelancer Profile:
- Skills: {freelancerSkills}
- Experience: {experience}
- Highlights to mention: {highlights}

Tone: {tone}

Generate a proposal with:
1. A personalized cover letter (3-4 paragraphs)
2. Suggested hourly/fixed rate based on project complexity
3. Estimated duration in days
4. 3-5 key points that make this freelancer stand out

Response format (return ONLY valid JSON, no markdown):
{
  "coverLetter": "string",
  "suggestedRate": number,
  "estimatedDuration": number,
  "keyPoints": ["string"]
}
`;

const PROJECT_DESCRIPTION_PROMPT = `
You are an expert at writing project descriptions that attract top freelance talent.

Project Info:
- Title: {title}
- Category: {category}
- Required Skills: {skills}
- Budget: ${'{budget}'}
- Deadline: {deadline}
- Additional Info: {additionalInfo}

Generate:
1. A clear, detailed project description (2-3 paragraphs)
2. 3-5 suggested milestones with descriptions and budget percentages
3. 3 tips for the employer to get better proposals

Response format (return ONLY valid JSON, no markdown):
{
  "description": "string",
  "suggestedMilestones": [
    { "title": "string", "description": "string", "percentage": number }
  ],
  "tips": ["string"]
}
`;

const DISPUTE_ANALYSIS_PROMPT = `
You are a fair and impartial dispute resolution analyst. Analyze this freelance marketplace dispute and suggest a resolution.

Dispute Details:
- Reason: {reason}
- Milestone: {milestoneTitle} (Amount: ${'{milestoneAmount}'})
- Contract Total: ${'{contractTotal}'}

Evidence from Freelancer:
{freelancerEvidence}

Evidence from Employer:
{employerEvidence}

Project Context:
- Title: {projectTitle}
- Description: {projectDescription}

Analyze the dispute objectively and provide:
1. A brief summary of the dispute
2. Key points supporting the freelancer
3. Key points supporting the employer
4. Suggested resolution (freelancer_favor, employer_favor, or split)
5. Confidence level (0-100)
6. Detailed reasoning
7. Fairness score (0-100) indicating how clear-cut the case is

Response format (return ONLY valid JSON, no markdown):
{
  "summary": "string",
  "freelancerPoints": ["string"],
  "employerPoints": ["string"],
  "suggestedResolution": "freelancer_favor" | "employer_favor" | "split",
  "confidence": number,
  "reasoning": "string",
  "fairnessScore": number
}
`;

/**
 * Parse JSON from AI response
 */
function parseJsonResponse<T>(text: string): T | null {
  try {
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.slice(7);
    else if (cleanText.startsWith('```')) cleanText = cleanText.slice(3);
    if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3);
    return JSON.parse(cleanText.trim()) as T;
  } catch {
    return null;
  }
}

/**
 * Generate a proposal cover letter for a freelancer
 */
export async function generateProposal(
  input: ProposalWriterInput
): Promise<AIAssistantResult<GeneratedProposal>> {
  if (!isAIAvailable()) {
    return {
      success: false,
      error: { code: 'AI_UNAVAILABLE', message: 'AI service is not configured' },
    };
  }

  // Get project details
  const projectEntity = await projectRepository.findProjectById(input.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Get freelancer profile
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(input.freelancerId);
  if (!profileEntity) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const prompt = PROPOSAL_WRITER_PROMPT
    .replace('{projectTitle}', project.title)
    .replace('{projectDescription}', project.description ?? 'No description provided')
    .replace('{requiredSkills}', project.requiredSkills.map(s => s.skillName).join(', '))
    .replace('{budget}', String(project.budget))
    .replace('{deadline}', project.deadline ?? 'Flexible')
    .replace('{freelancerSkills}', profileEntity.skills.map(s => s.skill_name).join(', '))
    .replace('{experience}', JSON.stringify(profileEntity.experience.slice(0, 3)))
    .replace('{highlights}', input.highlights?.join(', ') ?? 'None specified')
    .replace('{tone}', input.tone ?? 'professional');

  const response = await generateContent(prompt);

  if (isAIError(response)) {
    return {
      success: false,
      error: { code: response.code, message: response.message },
    };
  }

  const result = parseJsonResponse<GeneratedProposal>(response);
  if (!result) {
    return {
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse AI response' },
    };
  }

  return { success: true, data: result };
}

/**
 * Generate a project description for an employer
 */
export async function generateProjectDescription(
  input: ProjectDescriptionInput
): Promise<AIAssistantResult<GeneratedProjectDescription>> {
  if (!isAIAvailable()) {
    return {
      success: false,
      error: { code: 'AI_UNAVAILABLE', message: 'AI service is not configured' },
    };
  }

  const prompt = PROJECT_DESCRIPTION_PROMPT
    .replace('{title}', input.title)
    .replace('{category}', input.category)
    .replace('{skills}', input.skills.join(', '))
    .replace('{budget}', String(input.budget))
    .replace('{deadline}', input.deadline ?? 'Flexible')
    .replace('{additionalInfo}', input.additionalInfo ?? 'None');

  const response = await generateContent(prompt);

  if (isAIError(response)) {
    return {
      success: false,
      error: { code: response.code, message: response.message },
    };
  }

  const result = parseJsonResponse<GeneratedProjectDescription>(response);
  if (!result) {
    return {
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse AI response' },
    };
  }

  return { success: true, data: result };
}

/**
 * Analyze a dispute and suggest resolution
 */
export async function analyzeDispute(
  input: DisputeAnalysisInput
): Promise<AIAssistantResult<DisputeAnalysisResult>> {
  if (!isAIAvailable()) {
    return {
      success: false,
      error: { code: 'AI_UNAVAILABLE', message: 'AI service is not configured' },
    };
  }

  // Get dispute details
  const disputeEntity = await disputeRepository.findDisputeById(input.disputeId);
  if (!disputeEntity) {
    return {
      success: false,
      error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' },
    };
  }

  // Get contract details
  const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
    };
  }

  // Get project details
  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Find milestone
  const milestone = project.milestones.find(m => m.id === disputeEntity.milestone_id);

  // Separate evidence by submitter
  const freelancerEvidence = disputeEntity.evidence
    .filter(e => e.submitter_id === contractEntity.freelancer_id)
    .map(e => `[${e.type}] ${e.content}`)
    .join('\n') || 'No evidence submitted';

  const employerEvidence = disputeEntity.evidence
    .filter(e => e.submitter_id === contractEntity.employer_id)
    .map(e => `[${e.type}] ${e.content}`)
    .join('\n') || 'No evidence submitted';

  const prompt = DISPUTE_ANALYSIS_PROMPT
    .replace('{reason}', disputeEntity.reason)
    .replace('{milestoneTitle}', milestone?.title ?? 'Unknown')
    .replace('{milestoneAmount}', String(milestone?.amount ?? 0))
    .replace('{contractTotal}', String(contractEntity.total_amount))
    .replace('{freelancerEvidence}', freelancerEvidence)
    .replace('{employerEvidence}', employerEvidence)
    .replace('{projectTitle}', project.title)
    .replace('{projectDescription}', project.description ?? 'No description');

  const response = await generateContent(prompt);

  if (isAIError(response)) {
    return {
      success: false,
      error: { code: response.code, message: response.message },
    };
  }

  const result = parseJsonResponse<DisputeAnalysisResult>(response);
  if (!result) {
    return {
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse AI response' },
    };
  }

  // Validate and normalize
  return {
    success: true,
    data: {
      summary: result.summary ?? '',
      freelancerPoints: result.freelancerPoints ?? [],
      employerPoints: result.employerPoints ?? [],
      suggestedResolution: result.suggestedResolution ?? 'split',
      confidence: Math.max(0, Math.min(100, result.confidence ?? 50)),
      reasoning: result.reasoning ?? '',
      fairnessScore: Math.max(0, Math.min(100, result.fairnessScore ?? 50)),
    },
  };
}

/**
 * Check if AI assistant is available
 */
export function isAssistantAvailable(): boolean {
  return isAIAvailable();
}
