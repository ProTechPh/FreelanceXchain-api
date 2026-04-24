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
You are a skill matching assistant. Given a freelancer's skills and a project's required skills, identify which of the freelancer's skills match the project requirements.

Freelancer Skills: {freelancerSkills}
Project Requirements: {projectRequirements}

Rules:
- matchedSkills: list ONLY skills that exist in BOTH the freelancer's skills AND the project requirements. Use the exact names from the project requirements list.
- matchScore: 0-100. Score = (number of matched required skills / total required skills) * 100.
- Do NOT include skills that are not in the provided lists.

Return ONLY valid JSON, no markdown, no extra text:
{
  "matchScore": number,
  "matchedSkills": string[],
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
 * Find the index of the closing brace that matches the opening brace at startIndex.
 * Correctly handles braces inside JSON string values.
 */
function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 */
export function parseJsonResponse<T>(text: string, label = 'AI'): T | null {
  try {
    let cleanText = text.trim();

    // Remove markdown code blocks if present
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    // Check for double-encoded JSON string
    if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
      try {
        cleanText = JSON.parse(cleanText);
      } catch { /* not double-encoded, continue */ }
    }

    // Find the first JSON object with quoted keys (skip plain-text preamble).
    // Use \{\s*" to handle both compact {"key" and pretty-printed {\n  "key" formats.
    const jsonStart = cleanText.search(/\{\s*"/);
    if (jsonStart >= 0) {
      // Use brace-matching to find the exact closing } for this JSON object,
      // avoiding lastIndexOf which picks up braces in any duplicated trailing text.
      const matchingBrace = findMatchingBrace(cleanText, jsonStart);
      if (matchingBrace !== -1) {
        cleanText = cleanText.substring(jsonStart, matchingBrace + 1);
      } else if (jsonStart > 0) {
        cleanText = cleanText.substring(jsonStart);
      }
    }

    // First try direct parse
    try {
      const result = JSON.parse(cleanText) as T;
      return result;
    } catch {

      // Repair: close any open strings, brackets, braces
      let repaired = cleanText;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;

      // Trim trailing incomplete token (e.g. partial string value)
      const lastQuote = repaired.lastIndexOf('"');
      if (lastQuote > 0) {
        const afterLastQuote = repaired.substring(lastQuote + 1).trim();
        if (afterLastQuote && !afterLastQuote.match(/^[,\]}]/)) {
          repaired = repaired.substring(0, lastQuote + 1);
        }
      }

      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

      const result = JSON.parse(repaired) as T;
      return result;
    }
  } catch (err) {
    console.error(`[${label}] Failed to parse response:`, (err as Error).message);
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
    freelancerSkills: JSON.stringify(request.freelancerSkills.map(s => s.skillName)),
    projectRequirements: JSON.stringify(request.projectRequirements.map(s => s.skillName)),
  });

  const response = await generateContent(prompt);
  
  if (typeof response !== 'string') {
    return response;
  }

  const result = parseJsonResponse<SkillMatchResult>(response, 'SkillMatch');
  if (!result) {
    return {
      code: 'AI_PARSE_ERROR',
      message: 'Failed to parse skill match response',
      retryable: false,
    };
  }

  // Validate and normalize the result
  const freelancerSkillNames = request.freelancerSkills.filter(s => s.skillName).map(s => s.skillName.toLowerCase());
  const requiredSkillNames = request.projectRequirements.filter(s => s.skillName).map(s => s.skillName.toLowerCase());

  // Validate AI matchedSkills against actual data - must exist in both lists
  const validatedMatchedSkills = (result.matchedSkills ?? []).filter(skill =>
    freelancerSkillNames.some(f => f.includes(skill.toLowerCase()) || skill.toLowerCase().includes(f)) &&
    requiredSkillNames.some(r => r.includes(skill.toLowerCase()) || skill.toLowerCase().includes(r))
  );

  // Compute missingSkills server-side: required skills the freelancer doesn't have
  const computedMissingSkills = request.projectRequirements
    .filter(req => !freelancerSkillNames.some(f =>
      f.includes(req.skillName.toLowerCase()) || req.skillName.toLowerCase().includes(f)
    ))
    .map(req => req.skillName);

  // Recalculate score from validated data
  const calculatedScore = requiredSkillNames.length > 0
    ? Math.round((validatedMatchedSkills.length / requiredSkillNames.length) * 100)
    : 0;

  // Use AI score only if close to calculated score, otherwise use calculated
  const aiScore = Math.max(0, Math.min(100, result.matchScore ?? 0));
  const finalScore = Math.abs(aiScore - calculatedScore) > 40 ? calculatedScore : aiScore;

  return {
    matchScore: finalScore,
    matchedSkills: validatedMatchedSkills,
    missingSkills: computedMissingSkills,
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

  const result = parseJsonResponse<ExtractedSkill[]>(response, 'SkillExtract');
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
