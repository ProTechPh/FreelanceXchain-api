/**
 * AI/LLM API Client
 * Handles communication with LLM API for AI-powered skill matching
 */

import { config } from '../config/env.js';
import {
  AIRequest,
  AIResponse,
  AIError,
  SkillMatchRequest,
  SkillMatchResult,
  SkillExtractionRequest,
  ExtractedSkill,
  SkillInfo,
  SerializableAIRequest,
  SerializableAIResponse,
} from './ai-types.js';
import { generateId } from '../utils/id.js';

// Constants
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 300000; // 300 seconds (5 minutes) for LLM responses (can be slow)

// Prompt templates
export const SKILL_MATCH_PROMPT = `
ROLE: You are a precise skill matching AI for a freelance platform. Your expertise is analyzing skill compatibility between freelancers and projects.

TASK: Analyze how well the freelancer's skills match the project requirements.
1. Compare skills case-insensitively (e.g., "React" = "react" = "ReactJS")
2. Calculate matchScore = (matched skills / required skills) × 100
3. List matched_skills (freelancer has AND project needs)
4. List missing_skills (project needs BUT freelancer lacks)
5. Factor in reputation score for overall assessment

CONSTRAINTS:
- matchScore must be 0-100 integer
- Only include skills that actually appear in the inputs
- Do NOT invent skills or assume related skills match
- Return ONLY valid JSON, no markdown or explanation outside JSON

TONE: Objective, analytical, fact-based

INPUT:
Freelancer Skills: {freelancerSkills}
Project Requirements: {projectRequirements}
Freelancer Reputation Score: {reputationScore}

OUTPUT FORMAT (JSON only):
{"matchScore":85,"matchedSkills":["Python","FastAPI"],"missingSkills":["Docker"],"reasoning":"Strong backend match with 85% overlap. Missing containerization skills."}
`;

export const SKILL_EXTRACTION_PROMPT = `
ROLE: You are a technical skill extraction AI. Your job is to identify and normalize technical skills from text.

TASK: Extract ALL technical skills mentioned in the text.
1. Identify programming languages, frameworks, libraries, tools, databases, cloud platforms
2. Normalize skill names (e.g., "react.js" → "React", "postgres" → "PostgreSQL", "k8s" → "Kubernetes")
3. Map to provided taxonomy when available, otherwise use standard industry names
4. Assign confidence score (0.0-1.0) based on how explicitly the skill is mentioned

CONSTRAINTS:
- Extract ONLY technical/hard skills (NO soft skills like "teamwork", "communication")
- Do NOT extract job titles ("Senior Developer") or generic terms ("coding")
- confidence: 0.9+ for explicit mentions, 0.7-0.9 for implied, 0.5-0.7 for uncertain
- Return ONLY valid JSON array, no markdown

TONE: Precise, technical, conservative (when uncertain, lower confidence)

INPUT:
Text: {text}
Available Skills Taxonomy: {taxonomy}

OUTPUT FORMAT (JSON array only):
[{"skillId":"react-001","skillName":"React","confidence":0.95},{"skillId":"node-002","skillName":"Node.js","confidence":0.85}]
`;

export const SKILL_GAP_PROMPT = `
ROLE: You are a career development AI specializing in tech skill market analysis. You help freelancers identify skills to learn for career growth.

TASK: Analyze the freelancer's skills and recommend additions based on market demand.
1. Acknowledge their current skills
2. Identify complementary skills that increase marketability
3. Prioritize by current market demand (high/medium/low)
4. Focus on skills that pair well with their existing stack

CONSTRAINTS:
- recommendedSkills should be 3-5 actionable suggestions
- demandLevel must be "high", "medium", or "low"
- Base recommendations on realistic 2024-2026 tech market trends
- Do NOT recommend skills they already have
- Return ONLY valid JSON, no markdown

TONE: Encouraging, practical, market-aware

INPUT:
Current Skills: {currentSkills}

OUTPUT FORMAT (JSON only):
{"currentSkills":["Python","FastAPI"],"recommendedSkills":["Docker","AWS","React"],"marketDemand":[{"skillName":"Docker","demandLevel":"high"},{"skillName":"AWS","demandLevel":"high"},{"skillName":"React","demandLevel":"medium"}],"reasoning":"Strong backend foundation. Adding containerization and cloud skills will significantly increase full-stack opportunities
`;


/**
 * Check if AI/LLM API is available
 */
export function isAIAvailable(): boolean {
  return Boolean(config.llm.apiKey);
}

const AI_RECOMMENDATIONS_ENDPOINT = '/FreelanceXchain/AI/Recommendations';

/**
 * Build the AI API URL for the recommendations endpoint.
 * If LLM_API_URL already includes the endpoint, use it as-is.
 */
function buildApiUrl(): string {
  const baseUrl = config.llm.apiUrl.replace(/\/+$/, '');
  if (baseUrl.toLowerCase().endsWith(AI_RECOMMENDATIONS_ENDPOINT.toLowerCase())) {
    return baseUrl;
  }
  return `${baseUrl}${AI_RECOMMENDATIONS_ENDPOINT}`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request to AI API with retry logic (OpenAI-compatible format)
 */
async function makeAIRequest(
  request: AIRequest,
  retryCount: number = 0
): Promise<AIResponse | AIError> {
  if (!isAIAvailable()) {
    return {
      code: 'AI_UNAVAILABLE',
      message: 'AI API key is not configured',
      retryable: false,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Convert to OpenAI-compatible format
    const openAIRequest = {
      model: config.llm.model,
      messages: request.contents.map(content => ({
        role: 'user',
        content: content.parts.map(part => part.text).join('\n')
      })),
      stream: false,
      temperature: request.generationConfig?.temperature ?? 0.7,
      max_tokens: request.generationConfig?.maxOutputTokens ?? 2048,
    };

    const response = await fetch(buildApiUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIRequest),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const isRetryable = response.status >= 500 || response.status === 429;
      
      if (isRetryable && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        await sleep(delay);
        return makeAIRequest(request, retryCount + 1);
      }

      return {
        code: `AI_HTTP_${response.status}`,
        message: `AI API error: ${errorText}`,
        retryable: isRetryable,
      };
    }

    // Parse OpenAI-compatible response and convert to internal format
    const openAIResponse = await response.json();
    
    // Convert OpenAI format to internal AIResponse format
    const data: AIResponse = {
      candidates: openAIResponse.choices?.map((choice: any, index: number) => ({
        content: {
          parts: [{ text: choice.message?.content || '' }],
          role: choice.message?.role || 'assistant',
        },
        finishReason: choice.finish_reason || 'stop',
        index: index,
      })) || [],
      ...(openAIResponse.usage && {
        usageMetadata: {
          promptTokenCount: openAIResponse.usage.prompt_tokens || 0,
          candidatesTokenCount: openAIResponse.usage.completion_tokens || 0,
          totalTokenCount: openAIResponse.usage.total_tokens || 0,
        }
      }),
    };

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    const isAbortError = error instanceof Error && error.name === 'AbortError';
    const isNetworkError = error instanceof TypeError;
    const isRetryable = isAbortError || isNetworkError;

    if (isRetryable && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      await sleep(delay);
      return makeAIRequest(request, retryCount + 1);
    }

    return {
      code: 'AI_NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network error',
      retryable: isRetryable,
    };
  }
}

/**
 * Extract text content from AI response
 */
function extractResponseText(response: AIResponse): string | null {
  if (!response.candidates || response.candidates.length === 0) {
    return null;
  }
  
  const candidate = response.candidates[0];
  if (!candidate || !candidate.content?.parts || candidate.content.parts.length === 0) {
    return null;
  }

  const firstPart = candidate.content.parts[0];
  return firstPart?.text ?? null;
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 */
function parseJsonResponse<T>(text: string): T | null {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();
    
    return JSON.parse(cleanText) as T;
  } catch {
    return null;
  }
}

/**
 * Build prompt from template with variable substitution
 */
function buildPrompt(template: string, variables: Record<string, string>): string {
  let prompt = template;
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replaceAll(`{${key}}`, value);
  }
  return prompt;
}


/**
 * Generate content using AI API
 */
export async function generateContent(prompt: string): Promise<string | AIError> {
  const request: AIRequest = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  const response = await makeAIRequest(request);
  
  if ('code' in response) {
    return response;
  }

  const text = extractResponseText(response);
  if (!text) {
    return {
      code: 'AI_EMPTY_RESPONSE',
      message: 'AI returned an empty response',
      retryable: false,
    };
  }

  return text;
}

/**
 * Analyze skill match between freelancer and project
 */
export async function analyzeSkillMatch(
  request: SkillMatchRequest
): Promise<SkillMatchResult | AIError> {
  const prompt = buildPrompt(SKILL_MATCH_PROMPT, {
    freelancerSkills: JSON.stringify(request.freelancerSkills),
    projectRequirements: JSON.stringify(request.projectRequirements),
    reputationScore: String(request.reputationScore ?? 0),
  });

  const response = await generateContent(prompt);
  
  if (typeof response !== 'string') {
    return response;
  }

  const result = parseJsonResponse<SkillMatchResult>(response);
  if (!result) {
    return {
      code: 'AI_PARSE_ERROR',
      message: 'Failed to parse skill match response',
      retryable: false,
    };
  }

  // Validate and normalize the result
  return {
    matchScore: Math.max(0, Math.min(100, result.matchScore)),
    matchedSkills: result.matchedSkills ?? [],
    missingSkills: result.missingSkills ?? [],
    reasoning: result.reasoning ?? '',
  };
}

/**
 * Extract skills from text
 */
export async function extractSkills(
  request: SkillExtractionRequest
): Promise<ExtractedSkill[] | AIError> {
  const prompt = buildPrompt(SKILL_EXTRACTION_PROMPT, {
    text: request.text,
    taxonomy: JSON.stringify(request.availableSkills),
  });

  const response = await generateContent(prompt);
  
  if (typeof response !== 'string') {
    return response;
  }

  const result = parseJsonResponse<ExtractedSkill[]>(response);
  if (!result || !Array.isArray(result)) {
    return {
      code: 'AI_PARSE_ERROR',
      message: 'Failed to parse skill extraction response',
      retryable: false,
    };
  }

  // Validate and normalize results
  return result
    .filter(skill => skill.skillId && skill.skillName)
    .map(skill => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      confidence: Math.max(0, Math.min(1, skill.confidence ?? 0)),
    }));
}

/**
 * Keyword-based skill matching fallback when AI is unavailable
 */
export function keywordMatchSkills(
  freelancerSkills: SkillInfo[],
  projectRequirements: SkillInfo[]
): SkillMatchResult {
  const freelancerSkillIds = new Set(freelancerSkills.map(s => s.skillId));
  const freelancerSkillNames = new Set(
    freelancerSkills.map(s => s.skillName.toLowerCase())
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const req of projectRequirements) {
    if (
      freelancerSkillIds.has(req.skillId) ||
      freelancerSkillNames.has(req.skillName.toLowerCase())
    ) {
      matchedSkills.push(req.skillName);
    } else {
      missingSkills.push(req.skillName);
    }
  }

  const totalRequired = projectRequirements.length;
  const matchScore = totalRequired > 0 
    ? Math.round((matchedSkills.length / totalRequired) * 100)
    : 0;

  return {
    matchScore,
    matchedSkills,
    missingSkills,
    reasoning: `Keyword-based matching: ${matchedSkills.length}/${totalRequired} skills matched`,
  };
}

/**
 * Keyword-based skill extraction fallback
 */
export function keywordExtractSkills(
  text: string,
  availableSkills: SkillInfo[]
): ExtractedSkill[] {
  const lowerText = text.toLowerCase();
  const extracted: ExtractedSkill[] = [];

  for (const skill of availableSkills) {
    const skillNameLower = skill.skillName.toLowerCase();
    if (lowerText.includes(skillNameLower)) {
      // Calculate confidence based on exact match vs partial
      const exactMatch = new RegExp(`\\b${skillNameLower}\\b`, 'i').test(text);
      extracted.push({
        skillId: skill.skillId,
        skillName: skill.skillName,
        confidence: exactMatch ? 0.9 : 0.6,
      });
    }
  }

  return extracted;
}


// Serialization functions for round-trip testing

/**
 * Serialize AI request to JSON string
 */
export function serializeAIRequest(
  type: SerializableAIRequest['type'],
  payload: SerializableAIRequest['payload']
): string {
  const request: SerializableAIRequest = {
    type,
    payload,
    timestamp: new Date().toISOString(),
    requestId: generateId(),
  };
  return JSON.stringify(request);
}

/**
 * Deserialize AI request from JSON string
 */
export function deserializeAIRequest(json: string): SerializableAIRequest | null {
  try {
    const parsed = JSON.parse(json) as SerializableAIRequest;
    if (!parsed.type || !parsed.payload || !parsed.timestamp || !parsed.requestId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Serialize AI response to JSON string
 */
export function serializeAIResponse(
  type: SerializableAIResponse['type'],
  payload: SerializableAIResponse['payload'],
  processingTimeMs: number
): string {
  const response: SerializableAIResponse = {
    type,
    payload,
    timestamp: new Date().toISOString(),
    requestId: generateId(),
    processingTimeMs,
  };
  return JSON.stringify(response);
}

/**
 * Deserialize AI response from JSON string
 */
export function deserializeAIResponse(json: string): SerializableAIResponse | null {
  try {
    const parsed = JSON.parse(json) as SerializableAIResponse;
    if (!parsed.type || !parsed.payload || !parsed.timestamp || !parsed.requestId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if result is an AI error
 */
export function isAIError(result: unknown): result is AIError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    'message' in result &&
    'retryable' in result
  );
}
