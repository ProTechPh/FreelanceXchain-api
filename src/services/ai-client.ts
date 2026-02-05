/**
 * AI/LLM API Client
 * Handles communication with LLM API for AI-powered skill matching
 */

import { config } from '../config/env';
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
} from './ai-types';
import { generateId } from '../utils/id';

// Constants
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

// Prompt templates
export const SKILL_MATCH_PROMPT = `
Analyze the compatibility between a freelancer's skills and project requirements.
Return a JSON object with matchScore (0-100) and reasoning.

Freelancer Skills: {freelancerSkills}
Project Requirements: {projectRequirements}
Freelancer Reputation Score: {reputationScore}

Response format (return ONLY valid JSON, no markdown):
{
  "matchScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "reasoning": string
}
`;

export const SKILL_EXTRACTION_PROMPT = `
Extract skills from the following text and map them to the provided skill taxonomy.
Return a JSON array of extracted skills with confidence scores.

Text: {text}
Available Skills: {taxonomy}

Response format (return ONLY valid JSON array, no markdown):
[
  { "skillId": "string", "skillName": "string", "confidence": number }
]
`;

export const SKILL_GAP_PROMPT = `
Analyze the freelancer's current skills and suggest skills they should acquire based on market demand.
Return a JSON object with recommendations.

Current Skills: {currentSkills}

Response format (return ONLY valid JSON, no markdown):
{
  "currentSkills": string[],
  "recommendedSkills": string[],
  "marketDemand": [
    { "skillName": "string", "demandLevel": "high" | "medium" | "low" }
  ],
  "reasoning": string
}
`;


/**
 * Check if AI/LLM API is available
 */
export function isAIAvailable(): boolean {
  return Boolean(config.llm.apiKey);
}

/**
 * Build the AI API URL for a specific model
 */
function buildApiUrl(model: string = DEFAULT_MODEL): string {
  return `${config.llm.apiUrl}/models/${model}:generateContent?key=${config.llm.apiKey}`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request to AI API with retry logic
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
    const response = await fetch(buildApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
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

    const data = await response.json() as AIResponse;
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
    prompt = prompt.replace(`{${key}}`, value);
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
