/**
 * AI/LLM API Client
 * Handles communication with LLM API for AI-powered skill matching
 */

import { createHash } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import { LRUCache } from '../utils/cache.js';
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
  AIProposalGenerationRequest,
  AIProposalResult,
} from './ai-types.js';
import { generateId } from '../utils/id.js';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 300000; // 300 seconds (5 minutes) for LLM responses (can be slow)

export const localSkillMatchCache = new LRUCache<SkillMatchResult>(500, 3600_000); // 1 hour
export const localSkillExtractCache = new LRUCache<ExtractedSkill[]>(500, 3600_000); // 1 hour

async function getAICached<T>(key: string, localCache: LRUCache<T>): Promise<T | null> {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  try {
    if (redis && redis.status === 'ready') {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
  } catch (err) {
    logger.warn(`Redis AI get failed for ${key}`, { error: err instanceof Error ? err.message : String(err) });
  }
  return localCache.get(key) ?? null;
}

async function setAICached<T>(key: string, value: T, localCache: LRUCache<T>, ttlSeconds = 3600): Promise<void> {
  localCache.set(key, value, ttlSeconds * 1000);
  try {
    if (redis && redis.status === 'ready') {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
  } catch (err) {
    logger.warn(`Redis AI set failed for ${key}`, { error: err instanceof Error ? err.message : String(err) });
  }
}

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

export const PROPOSAL_GENERATION_PROMPT = `
You are a premier Web3 & software freelance proposal strategist and senior engineering copywriter.
Your goal is to craft a winning, highly professional, compelling, and persuasive proposal for the freelancer applying to this project.

Freelancer Profile:
- Name: {freelancerName}
- Title: {freelancerTitle}
- Bio: {freelancerBio}
- Verified Skills: {freelancerSkills}
- Blockchain Reputation Status: {reputationSummary}
- Relevant Portfolio Projects:
{portfolioItems}

Project Details:
- Project Title: {projectTitle}
- Project Description: {projectDescription}
- Required Skills: {projectSkills}
- Budget: {projectBudget} USDC
- Project Milestones:
{projectMilestones}
- Deadline: {projectDeadline}
- Freelancer Custom Notes / Instructions: {customNotes}

Winning Proposal Strategy Guidelines:
1. Tone & Positioning:
   - Confident, articulate, solution-oriented, and client-centric.
   - Position the freelancer as a top-tier engineer who deeply understands the technical stack, product requirements, and Web3 best practices.
   - Regardless of past platform rating history or project count, NEVER apologize or focus on low numbers. Emphasize verified technical competence, portfolio proof, clean architecture, and 100% commitment to milestone delivery.
2. Structure of the Cover Letter (in clean, readable GitHub-flavored Markdown):
   - **Executive Summary / Greeting**: Acknowledge the client's project vision, technical stack, and core objectives with energy and precision.
   - **Technical Fit & Proven Experience**: Connect the required skills ({projectSkills}) directly to the freelancer's portfolio work ({portfolioItems}) or domain experience. Mention specific technical components (e.g. state management, wallet connection, responsive UX, smart contract security).
   - **Strategic 3-Phase Execution Plan**: Provide an actionable, transparent delivery roadmap (Phase 1: Architecture & UX, Phase 2: Core Feature Implementation & Integrations, Phase 3: Testing, Gas/Performance Optimization & Launch).
   - **Client Assurance & Escrow De-risking**: Reassure the client that all funds remain securely protected in smart contract escrow and are only released upon their explicit review and approval of each completed milestone.
   - **Clear Call to Action**: Professional sign-off welcoming a conversation to align on technical details.
3. Pricing & Timeline:
   - Recommend a realistic proposed rate (numeric USD) aligned with the project budget ({projectBudget} USDC).
   - Recommend a realistic estimated delivery duration (numeric in days).
   - Provide structured proposed milestone deliverables.
4. Highlights (3-4 crisp selling badges):
   - Provide strong positive selling points (e.g., "100% Escrow-Protected Milestone Delivery", "Direct Portfolio Match for DEX/Web3", "Clean Code & Fast Turnaround", "Verified Tech Stack Expertise").
   - If reputation is high (>=85%), you may cite the on-chain score. If 0 or lower, highlight identity verification, escrow protection, and technical mastery.

Return ONLY valid JSON (no markdown wrappers around the JSON, no extra text):
{
  "coverLetter": "string (in Markdown)",
  "proposedRate": number,
  "estimatedDuration": number,
  "proposedMilestones": [
    {
      "title": "string",
      "description": "string",
      "amount": number,
      "durationDays": number
    }
  ],
  "highlights": ["string", "string", "string"]
}
`;


/**
 * Minimal OpenAI Chat Completions response shape (the subset we consume).
 */
type OpenAICompletionResponse = {
  choices?: {
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/**
 * Check if AI/LLM API is available
 */
export function isAIAvailable(): boolean {
  return Boolean(config.llm.apiKey);
}

const AI_RECOMMENDATIONS_ENDPOINT = '/FreelanceXchain/AI/Recommendations';

function isGeminiApi(): boolean {
  const url = config.llm.apiUrl.toLowerCase();
  return url.includes('googleapis.com') || url.includes('generativelanguage');
}

function isOpenAiCompatibleProvider(): boolean {
  const url = config.llm.apiUrl.toLowerCase();
  return (
    url.includes('groq.com') ||
    url.includes('openai.com') ||
    url.includes('openrouter.ai') ||
    url.includes('deepseek.com') ||
    url.includes('together.xyz') ||
    url.endsWith('/v1') ||
    url.includes('/openai')
  );
}

/**
 * Build the AI API URL.
 */
function buildApiUrl(): string {
  const baseUrl = config.llm.apiUrl.replace(/\/+$/, '');
  if (isGeminiApi()) {
    return `${baseUrl}/models/${config.llm.model}:generateContent?key=${config.llm.apiKey}`;
  }
  if (baseUrl.toLowerCase().endsWith('/chat/completions') || baseUrl.toLowerCase().endsWith(AI_RECOMMENDATIONS_ENDPOINT.toLowerCase())) {
    return baseUrl;
  }
  if (isOpenAiCompatibleProvider()) {
    return `${baseUrl}/chat/completions`;
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
 * Convert the internal AIRequest to the OpenAI-compatible payload.
 */
function buildOpenAIRequest(request: AIRequest): Record<string, unknown> {
  /* istanbul ignore next -- generateContent always supplies generationConfig; defaults are fallback only */
  const temperature = request.generationConfig?.temperature != null ? request.generationConfig.temperature : 0.7;
  /* istanbul ignore next */
  const maxTokens = request.generationConfig?.maxOutputTokens != null ? request.generationConfig.maxOutputTokens : 2048;

  return {
    model: config.llm.model,
    messages: request.contents.map(content => ({
      role: 'user',
      content: content.parts.map(part => part.text).join('\n')
    })),
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };
}

function buildGeminiRequest(request: AIRequest): Record<string, unknown> {
  const temperature = request.generationConfig?.temperature != null ? request.generationConfig.temperature : 0.7;
  const maxTokens = request.generationConfig?.maxOutputTokens != null ? request.generationConfig.maxOutputTokens : 2048;

  return {
    contents: request.contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
}

/**
 * Convert the OpenAI-compatible completion response to the internal AIResponse format.
 */
function parseOpenAIResponse(openAIResponse: OpenAICompletionResponse): AIResponse {
  return {
    candidates: openAIResponse.choices?.map((choice, index) => ({
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
}

/**
 * Make HTTP request to AI API with retry logic (supports both Gemini and OpenAI-compatible formats)
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
    const isGemini = isGeminiApi();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (!isGemini) {
      headers['Authorization'] = `Bearer ${config.llm.apiKey}`;
    }

    const bodyPayload = isGemini ? buildGeminiRequest(request) : buildOpenAIRequest(request);

    const response = await fetch(buildApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
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

    const jsonResponse: any = await response.json();
    if (isGemini) {
      const text = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        candidates: [{
          content: {
            parts: [{ text }],
            role: 'assistant',
          },
          finishReason: jsonResponse?.candidates?.[0]?.finishReason || 'stop',
          index: 0,
        }],
      };
    }

    return parseOpenAIResponse(jsonResponse as OpenAICompletionResponse);
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
  /* istanbul ignore next */
  if (!candidate || !candidate.content?.parts || candidate.content.parts.length === 0) {
    return null;
  }

  const firstPart = candidate.content.parts[0];
  /* istanbul ignore next -- response conversion always sets text to a string; null is unreachable */
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

    // Only apply object-extraction heuristic for non-array responses.
    // Array responses (starting with '[') are parsed directly.
    if (!cleanText.startsWith('[')) {
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
    }

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
    logger.error(`[${label}] Failed to parse response`, err as Error);
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
  const fSkillsSorted = request.freelancerSkills.map(s => s.skillName.toLowerCase()).sort();
  const reqSkillsSorted = request.projectRequirements.map(s => s.skillName.toLowerCase()).sort();
  const hash = createHash('sha256').update(JSON.stringify({ f: fSkillsSorted, r: reqSkillsSorted })).digest('hex').slice(0, 16);
  const cacheKey = `ai:skill-match:${hash}`;

  const cached = await getAICached<SkillMatchResult>(cacheKey, localSkillMatchCache);
  if (cached) {
    return cached;
  }

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

  const freelancerSkillNames = request.freelancerSkills.reduce<string[]>((acc, s) => {
    if (s.skillName) acc.push(s.skillName.toLowerCase());
    return acc;
  }, []);
  const requiredSkillNames = request.projectRequirements.reduce<string[]>((acc, s) => {
    if (s.skillName) acc.push(s.skillName.toLowerCase());
    return acc;
  }, []);

  // Validate AI matchedSkills against actual data - must exist in both lists
  const validatedMatchedSkills = (result.matchedSkills ?? []).filter(skill =>
    freelancerSkillNames.some(f => f.includes(skill.toLowerCase()) || skill.toLowerCase().includes(f)) &&
    requiredSkillNames.some(r => r.includes(skill.toLowerCase()) || skill.toLowerCase().includes(r))
  );

  // Compute missingSkills server-side: required skills the freelancer doesn't have
  const computedMissingSkills = request.projectRequirements.reduce<string[]>((acc, req) => {
    if (!freelancerSkillNames.some(f =>
      f.includes(req.skillName.toLowerCase()) || req.skillName.toLowerCase().includes(f)
    )) acc.push(req.skillName);
    return acc;
  }, []);

  const calculatedScore = requiredSkillNames.length > 0
    ? Math.round((validatedMatchedSkills.length / requiredSkillNames.length) * 100)
    : 0;

  // Use AI score only if close to calculated score, otherwise use calculated
  const aiScore = Math.max(0, Math.min(100, result.matchScore ?? 0));
  const finalScore = Math.abs(aiScore - calculatedScore) > 40 ? calculatedScore : aiScore;

  const finalMatchResult: SkillMatchResult = {
    matchScore: finalScore,
    matchedSkills: validatedMatchedSkills,
    missingSkills: computedMissingSkills,
    reasoning: result.reasoning ?? '',
  };

  await setAICached(cacheKey, finalMatchResult, localSkillMatchCache, 3600);
  return finalMatchResult;
}

/**
 * Extract skills from text
 */
export async function extractSkills(
  request: SkillExtractionRequest
): Promise<ExtractedSkill[] | AIError> {
  const hash = createHash('sha256').update(request.text.trim().toLowerCase()).digest('hex').slice(0, 16);
  const cacheKey = `ai:extract-skills:${hash}`;

  const cached = await getAICached<ExtractedSkill[]>(cacheKey, localSkillExtractCache);
  if (cached) {
    return cached;
  }

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

  const extractedList = result.reduce<ExtractedSkill[]>((acc, skill) => {
    if (skill.skillId && skill.skillName) {
      acc.push({
        skillId: skill.skillId,
        skillName: skill.skillName,
        confidence: Math.max(0, Math.min(1, skill.confidence ?? 0)),
      });
    }
    return acc;
  }, []);

  await setAICached(cacheKey, extractedList, localSkillExtractCache, 3600);
  return extractedList;
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

/**
 * Fallback AI Proposal Generator using portfolio, skills, and reputation
 */
export function fallbackGenerateProposal(
  request: AIProposalGenerationRequest
): AIProposalResult {
  const matchingSkills = request.freelancerSkills.filter(s =>
    request.projectSkills.some(ps => ps.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(ps.toLowerCase()))
  );
  const skillsMention = matchingSkills.length > 0
    ? matchingSkills.join(', ')
    : (request.freelancerSkills.slice(0, 4).join(', ') || 'Web3 Engineering');

  const portfolioHighlight = request.portfolioItems.length > 0
    ? `In my previous work, I successfully built **${request.portfolioItems[0]?.title}** (${request.portfolioItems[0]?.description}), which directly demonstrates the technical requirements needed for **${request.projectTitle}**.`
    : `With my practical experience in **${skillsMention}**, I am well-prepared to deliver a secure, robust solution.`;

  const hasRatings = request.completedProjectsCount > 0 && request.reputationScore > 0;
  const reputationIntro = hasRatings
    ? `and a blockchain-verified reputation score of **${Math.round(request.reputationScore)}%** across **${request.completedProjectsCount} completed contracts**`
    : `and verified technical credentials on FreelanceXchain`;

  const assuranceBullet = hasRatings
    ? `Having completed **${request.completedProjectsCount} projects** with on-time delivery on FreelanceXchain, I follow disciplined testing and smart contract verification standards.`
    : `As a verified talent on FreelanceXchain, I follow disciplined testing and smart contract verification standards with full escrow milestone protection.`;

  const coverLetter = `### Dear Employer,

I am excited to submit my proposal for **${request.projectTitle}**. With my background as a ${request.freelancerTitle || 'Web3 Developer'} ${reputationIntro}, I have the exact technical foundation and reliability required for this project.

#### Why I'm the Right Fit:
- **Core Skills & Domain Expertise**: Extensive practical experience in **${skillsMention}**.
- **Relevant Track Record**: ${portfolioHighlight}
- **Escrow & Quality Assurance**: ${assuranceBullet}

#### Execution Plan:
1. **Requirements Alignment & Setup**: Review project architecture, smart contract interfaces, and UI requirements.
2. **Core Implementation**: Build and integrate responsive features, state management, and blockchain connectors.
3. **Testing, QA & Deployment**: Comprehensive integration testing, gas optimization, and staging deployment.

${request.customNotes ? `*Freelancer Note: ${request.customNotes}*\n\n` : ''}I look forward to discussing how we can bring **${request.projectTitle}** to a successful launch!

Best regards,  
**${request.freelancerName}**`;

  const proposedMilestones = (request.projectMilestones && request.projectMilestones.length > 0)
    ? request.projectMilestones.map((m) => ({
        title: m.title,
        description: m.description || 'Milestone delivery and review.',
        amount: m.amount || Math.round(request.projectBudget / request.projectMilestones!.length),
        durationDays: 7,
      }))
    : [
        {
          title: 'Phase 1: Architecture & UI Setup',
          description: 'Initial wireframes, component library setup, and wallet provider integration.',
          amount: Math.round((request.projectBudget || 1000) * 0.4),
          durationDays: 5,
        },
        {
          title: 'Phase 2: Core Functionality & Contracts',
          description: 'Implementation of primary business logic and blockchain interactions.',
          amount: Math.round((request.projectBudget || 1000) * 0.4),
          durationDays: 7,
        },
        {
          title: 'Phase 3: QA, Polish & Deployment',
          description: 'Comprehensive end-to-end testing, optimization, and production deployment.',
          amount: Math.round((request.projectBudget || 1000) * 0.2),
          durationDays: 4,
        },
      ];

  const highlights = [
    hasRatings
      ? `${Math.round(request.reputationScore)}% Verified On-Chain Reputation`
      : 'Identity-Verified Talent (KYC Verified)',
    hasRatings
      ? `${request.completedProjectsCount} Completed Projects on Platform`
      : 'Escrow-Protected Milestone Delivery',
    `Expertise in ${matchingSkills.slice(0, 3).join(', ') || 'Web3 Engineering'}`,
  ];

  return {
    coverLetter,
    proposedRate: request.projectBudget || 1000,
    estimatedDuration: proposedMilestones.reduce((acc, m) => acc + m.durationDays, 0) || 14,
    proposedMilestones,
    highlights,
  };
}

/**
 * Generate a personalized AI proposal based on freelancer portfolio, skills, and reputation
 */
export async function generateAIProposal(
  request: AIProposalGenerationRequest
): Promise<AIProposalResult | AIError> {
  if (!isAIAvailable()) {
    return fallbackGenerateProposal(request);
  }

  const portfolioSummary = request.portfolioItems.length > 0
    ? request.portfolioItems.map((p, idx) => `${idx + 1}. ${p.title}: ${p.description} (Skills: ${(p.skills || []).join(', ')}${p.projectUrl ? `, URL: ${p.projectUrl}` : ''})`).join('\n')
    : 'No explicit portfolio items provided; rely on verified skills and escrow commitment.';

  const milestonesSummary = (request.projectMilestones && request.projectMilestones.length > 0)
    ? request.projectMilestones.map((m, idx) => `${idx + 1}. ${m.title} ($${m.amount ?? 0}) - ${m.description ?? ''}`).join('\n')
    : 'Standard milestone-based delivery.';

  const hasRatings = request.completedProjectsCount > 0 && request.reputationScore > 0;
  const reputationSummary = hasRatings
    ? `${Math.round(request.reputationScore)}% score (${request.completedProjectsCount} completed projects, ${request.disputeCount ?? 0} disputes)`
    : 'New talent on platform (0 platform contracts completed yet, identity-verified talent). Focus on technical skills, portfolio work, and escrow assurance.';

  const prompt = buildPrompt(PROPOSAL_GENERATION_PROMPT, {
    freelancerName: request.freelancerName || 'Freelancer',
    freelancerTitle: request.freelancerTitle || 'Full-Stack Web3 Developer',
    freelancerBio: request.freelancerBio || '',
    freelancerSkills: JSON.stringify(request.freelancerSkills),
    reputationSummary,
    portfolioItems: portfolioSummary,
    projectTitle: request.projectTitle,
    projectDescription: request.projectDescription,
    projectSkills: JSON.stringify(request.projectSkills),
    projectBudget: String(request.projectBudget),
    projectMilestones: milestonesSummary,
    projectDeadline: request.projectDeadline || 'Not specified',
    customNotes: request.customNotes || 'None',
  });

  const response = await generateContent(prompt);

  if (typeof response !== 'string') {
    return fallbackGenerateProposal(request);
  }

  const result = parseJsonResponse<AIProposalResult>(response, 'ProposalGenerate');
  if (!result || !result.coverLetter) {
    return fallbackGenerateProposal(request);
  }

  return {
    coverLetter: result.coverLetter,
    proposedRate: typeof result.proposedRate === 'number' && result.proposedRate > 0 ? result.proposedRate : (request.projectBudget || 1000),
    estimatedDuration: typeof result.estimatedDuration === 'number' && result.estimatedDuration > 0 ? result.estimatedDuration : 14,
    proposedMilestones: Array.isArray(result.proposedMilestones) && result.proposedMilestones.length > 0
      ? result.proposedMilestones
      : (request.projectMilestones || []).map((m) => ({
          title: m.title,
          description: m.description || '',
          amount: m.amount || 0,
          durationDays: 7,
        })),
    highlights: Array.isArray(result.highlights) && result.highlights.length > 0
      ? result.highlights
      : [
          hasRatings
            ? `${Math.round(request.reputationScore)}% On-Chain Reputation Score`
            : 'Identity-Verified Talent (KYC Verified)',
          hasRatings
            ? `${request.completedProjectsCount} Completed Projects`
            : 'Escrow-Protected Milestone Delivery',
          `Expert in ${request.freelancerSkills.slice(0, 3).join(', ')}`,
        ],
  };
}



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
