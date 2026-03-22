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
You are a skill matching assistant. Given a freelancer's skills and a project's required skills, identify which skills match.

Freelancer Skills: {freelancerSkills}
Project Requirements: {projectRequirements}

CORE RULES:
- matchedSkills: list ONLY skills present in BOTH lists. Use the exact name from the Project Requirements list.
- matchScore: (matched / total required) * 100, rounded to nearest integer.
- Skill comparison is ALWAYS case-insensitive: "python" == "Python" == "PYTHON".
- Recognize common aliases as the same skill:
  JS / js == JavaScript
  TS / ts == TypeScript
  Postgres / pg == PostgreSQL
  Node / NodeJS / Node.js == Node.js
  React / ReactJS / React.js == React
  Vue / VueJS / Vue.js == Vue.js
  Mongo / MongoDB == MongoDB
- NEVER invent matched skills that are not in the freelancer list — phantom matches are forbidden.

EDGE CASE RULES:
- EMPTY FREELANCER: if the freelancer skills list is empty, matchScore MUST be 0 and matchedSkills MUST be [].
- OVER-QUALIFIED: if freelancer has more skills than required, score is still based only on required skills covered — no penalty, no bonus beyond 100.
- CASE MISMATCH: always normalize before comparing. "REACT" and "react" are the same skill.
- SIMILAR-BUT-DIFFERENT: Vue.js and React are NOT the same. Flask and Django are NOT the same. Do not match across different technologies.

Return ONLY valid JSON, no markdown, no extra text:
{
  "matchScore": number,
  "matchedSkills": string[],
  "reasoning": string
}
`;

export const SKILL_EXTRACTION_PROMPT = `
Extract technical skills from the following text and map them to the provided skill taxonomy.
Return a JSON array of extracted skills with confidence scores.

Text: {text}
Available Skills: {taxonomy}

RULES:
- Extract ONLY technical skills: programming languages, frameworks, libraries, tools, databases, cloud platforms.
- Exclude soft skills (communication, teamwork, leadership) and job titles.
- Normalize skill names: "react.js" -> "React", "JS" -> "JavaScript", "TS" -> "TypeScript", "PG" -> "PostgreSQL".
- Deduplicate: if a skill appears multiple times, list it only ONCE.
- Comparison is case-insensitive: "PYTHON", "python", "Python" all map to the same skill.

EDGE CASE RULES:
- NON-TECH TEXT: if the text describes a non-technical role (chef, nurse, driver, teacher) with no programming languages or technical tools, return an empty array [].
- IMPLICIT MOBILE: if the text mentions building apps for "iOS and Android" using "cross-platform" technology but names no specific framework, include Flutter and React Native.
- VERSION NUMBERS: strip version suffixes — "Python 3.11" -> "Python", "React 18" -> "React".

Response format (return ONLY valid JSON array, no markdown):
[
  { "skillId": "string", "skillName": "string", "confidence": number }
]
`;

export const SKILL_GAP_PROMPT = `
Analyze the freelancer's current skills and suggest skills they should acquire based on what directly complements or extends those specific skills, grounded in real market demand.
Return a JSON object with recommendations.

Current Skills: {currentSkills}
Target Role: {targetRole}

INTERPRETATION RULES:
- Accept Current Skills as either an array of strings or a comma-separated string.
- Normalize all skills before analysis: lowercase, trim spaces, deduplicate, and map common aliases (js -> javascript, ts -> typescript, node -> node.js).
- Do not recommend any skill already present after normalization and alias resolution.

RECOMMENDATION RULES:
- recommendedSkills: skills the freelancer does NOT already have but should learn next.
- Prioritize skills that directly complement, extend, or are commonly paired with their existing skills in real-world projects (e.g. React -> Next.js, Python -> FastAPI, Docker -> Kubernetes).
- Use the Target Role as a filter: only recommend skills relevant to that role. Do not recommend skills outside the role's scope.
- NEVER include skills already in Current Skills (including synonyms and aliases).
- Standard case: return 3 to 6 recommended skills.
- demandLevel: "high" = widely required in job postings, "medium" = commonly useful, "low" = niche/optional.

EDGE CASE RULES:
- ZERO SKILLS: if current skills is empty, return 3-5 foundational skills for the target role. recommendedSkills must NOT be empty.
- ALREADY QUALIFIED: if the freelancer has 5+ skills and 4+ directly match the target role, limit recommendedSkills to 2 advanced/complementary skills at most.
- UNRELATED DOMAIN: if current skills are entirely unrelated to the target role, recommend 3-5 core foundational skills for that role instead.
- OUTDATED SKILLS: if current skills include outdated versions (Python 2, Angular 1, jQuery-only), recommend modern equivalents as part of upskilling.
- ABSOLUTE RULE: recommendedSkills must NEVER be an empty array unless the freelancer is fully expert-level in every possible skill for the role (extremely rare).

OUTPUT RULES:
- marketDemand must contain exactly one entry per item in recommendedSkills, with skillName matching exactly.
- reasoning must be 1-3 sentences: explain which existing skills drove each recommendation and why it fits the target role.
- Return ONLY valid JSON, no markdown, no comments, no extra keys.

Response format:
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
      candidates: openAIResponse.choices?.map((choice: { message?: { content?: string; role?: string }; finish_reason?: string }, index: number) => ({
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
  console.log(`[${label}] Raw response length:`, text.length);
  console.log(`[${label}] Raw response:`, text.substring(0, 800));
  console.log(`[${label}] Raw response (end):`, text.substring(Math.max(0, text.length - 200)));

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
        if (jsonStart > 0) {
          console.log(`[${label}] Stripping ${jsonStart} chars of preamble before JSON`);
        }
        cleanText = cleanText.substring(jsonStart, matchingBrace + 1);
      } else if (jsonStart > 0) {
        console.log(`[${label}] Stripping ${jsonStart} chars of preamble before JSON`);
        cleanText = cleanText.substring(jsonStart);
      }
    }

    console.log(`[${label}] Cleaned response:`, cleanText.substring(0, 800));

    // First try direct parse
    try {
      const result = JSON.parse(cleanText) as T;
      console.log(`[${label}] Parse succeeded`);
      return result;
    } catch (parseError) {
      console.log(`[${label}] Direct parse failed, attempting repair:`, (parseError as Error).message);

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
        if (afterLastQuote && !afterLastQuote.match(/^[,\]\}]/)) {
          repaired = repaired.substring(0, lastQuote + 1);
        }
      }

      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

      console.log(`[${label}] Repaired response:`, repaired.substring(0, 500));
      const result = JSON.parse(repaired) as T;
      console.log(`[${label}] Repair succeeded`);
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

  // Exact word-boundary match to avoid e.g. "java" falsely matching "javascript"
  function skillsMatch(a: string, b: string): boolean {
    return a === b || a.split(/[\s/.-]+/).some(tok => tok === b) || b.split(/[\s/.-]+/).some(tok => tok === a);
  }

  // Validate AI matchedSkills against actual data - must exist in both lists
  const validatedMatchedSkills = (result.matchedSkills ?? []).filter(skill => {
    const s = skill.toLowerCase();
    return freelancerSkillNames.some(f => skillsMatch(f, s)) &&
           requiredSkillNames.some(r => skillsMatch(r, s));
  });

  // Compute missingSkills server-side: required skills the freelancer doesn't have
  const computedMissingSkills = request.projectRequirements
    .filter(req => !freelancerSkillNames.some(f => skillsMatch(f, req.skillName.toLowerCase())))
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

  // Escape regex metacharacters to prevent ReDoS (e.g. "C++", "Node.js", "ASP.NET")
  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  for (const skill of availableSkills) {
    const skillNameLower = skill.skillName.toLowerCase();
    if (lowerText.includes(skillNameLower)) {
      // Calculate confidence based on exact match vs partial
      const exactMatch = new RegExp(`\\b${escapeRegex(skillNameLower)}\\b`, 'i').test(text);
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
