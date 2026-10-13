/**
 * AI layer evaluation
 *
 * Runs labeled cases against the configured LLM provider (LLM_API_URL /
 * LLM_MODEL from .env) through the same exported functions the API uses, then
 * prints a scorecard and saves the full run to results/.
 *
 * Usage: pnpm eval:ai [options]
 *   --label <name>          name for the saved result file (default "run")
 *   --only <features>       comma list of extraction,match,gap,proposal
 *   --runs <n>              repeat every case n times to measure consistency (default 1)
 *   --judge                 also grade proposals, skill gaps and match reasoning with a
 *                           second model (EVAL_JUDGE_MODEL, default openai/gpt-oss-120b)
 *   --real                  build cases from the live Appwrite data instead of dataset.json
 *                           (read-only; freelancer names are replaced with placeholders)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// NODE_ENV=test turns off the AI response cache (every case hits the model)
// and keeps Redis from connecting. Set before the service modules load.
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = process.env['EVAL_LOG_LEVEL'] ?? 'error';

const here = dirname(fileURLToPath(import.meta.url));

type Skill = { skillId: string; skillName: string };
type Feature = 'extraction' | 'match' | 'gap' | 'proposal';
const FEATURES: Feature[] = ['extraction', 'match', 'gap', 'proposal'];

type ProposalRequest = {
  freelancerName: string;
  freelancerSkills: string[];
  projectTitle: string;
  projectDescription: string;
  projectSkills: string[];
  projectBudget: number;
  projectMilestones?: Array<{ title: string; description?: string; amount?: number }>;
  portfolioItems: Array<{ title: string; description: string }>;
  [key: string]: unknown;
};

type Suite = {
  name: string;
  taxonomy: Skill[];
  extraction: Array<{ id: string; text: string; expected: string[]; tags?: string[]; padTo?: number }>;
  match: Array<{ id: string; freelancer: string[]; required: string[]; expected: string[]; tags?: string[] }>;
  gap: Array<{ id: string; current: string[]; tags?: string[] }>;
  proposal: Array<{ id: string; request: ProposalRequest; tags?: string[]; forbidden?: string[] }>;
};

type RawCall = {
  feature: Feature;
  caseId: string;
  run: number;
  status: number;
  latencyMs: number;
  content: string;
  finishReason: string | undefined;
  promptTokens: number;
  completionTokens: number;
};

type CaseResult = {
  feature: Feature;
  id: string;
  run: number;
  tags: string[];
  latencyMs: number;
  fallback: boolean;
  checks: Record<string, boolean>;
  leakedNonEnglish: string[];
  leakedUnknownSkills: string[];
  output: unknown;
  signature?: string;
  detail?: Record<string, number>;
  notes?: string[];
  judge?: { scores: Record<string, number>; issues: string[] };
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const only = get('--only');
  return {
    label: get('--label') ?? 'run',
    only: new Set<Feature>(only ? (only.split(',') as Feature[]) : FEATURES),
    runs: Math.max(1, Number(get('--runs') ?? 1)),
    judge: args.includes('--judge'),
    real: args.includes('--real'),
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]!);
}

const pct = (num: number, den: number) => (den === 0 ? 'n/a' : `${((num / den) * 100).toFixed(1)}%`);
const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

/** Parse Groq/OpenAI reset durations such as "19.95s", "1m2.4s", "450ms". */
function parseResetMs(value: string | null): number {
  if (!value) return 0;
  let ms = 0;
  for (const [, num, unit] of value.matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    const n = Number(num);
    ms += unit === 'ms' ? n : unit === 's' ? n * 1000 : unit === 'm' ? n * 60_000 : n * 3_600_000;
  }
  return Math.ceil(ms);
}

/**
 * Tokens-per-minute pacing for one model. Free-tier Groq keys allow 8k TPM per
 * model and a request reserves its max_tokens up front, so the eval waits for
 * the window to refill instead of measuring rate-limit fallbacks as quality.
 */
class TokenWindow {
  remaining = Infinity;
  resetMs = 0;
  constructor(private readonly minTokens: number) {}
  observe(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining-tokens');
    if (remaining !== null) this.remaining = Number(remaining);
    this.resetMs = Math.max(
      parseResetMs(headers.get('x-ratelimit-reset-tokens')),
      Number(headers.get('retry-after') ?? 0) * 1000,
    );
  }
  async waitIfLow() {
    if (this.remaining < this.minTokens && this.resetMs > 0) {
      await sleep(this.resetMs + 500);
      this.remaining = Infinity;
    }
  }
  exhaust() {
    this.remaining = 0;
    this.resetMs = Math.max(this.resetMs, 5000);
  }
}

const MAX_CASE_ATTEMPTS = 4;
const FILLER = 'The company is a small, fully remote team that values clear communication, steady weekly progress and well-documented work. ';

const PROMPT_LEAK_MARKERS = [
  'Rules that always apply',
  'Never invent skills',
  '<user_text>',
  'Winning Proposal Strategy',
  'NEVER apologize',
  'Return JSON',
];

async function loadRealSuite(normalizeSkillKey: (s: string) => string, keywordMatchSkills: (a: Skill[], b: Skill[]) => { matchScore: number; matchedSkills: string[] }): Promise<Suite> {
  const { getActiveSkills } = await import('../../src/services/skill-service.js');
  const { projectRepository } = await import('../../src/repositories/project-repository.js');
  const { freelancerProfileRepository } = await import('../../src/repositories/freelancer-profile-repository.js');

  const taxonomy: Skill[] = (await getActiveSkills()).map(s => ({ skillId: s.id, skillName: s.name }));
  const projects = (await projectRepository.getAllOpenProjects({ limit: 50 })).items;
  const profiles = (await freelancerProfileRepository.getAvailableProfiles())
    .filter(p => (p.skills ?? []).some(s => s?.name?.trim()));
  const taxonomyIds = new Set(taxonomy.map(s => s.skillId));

  const projectSkills = (p: (typeof projects)[number]) =>
    (p.required_skills ?? []).filter(s => s?.skill_name).map(s => ({ skillId: s.skill_id, skillName: s.skill_name! }));
  const profileSkills = (p: (typeof profiles)[number]) =>
    (p.skills ?? []).filter(s => s?.name?.trim()).map(s => s.name.trim());

  const pairs = profiles.flatMap((profile, fi) => projects.map(project => {
    const f = profileSkills(profile).map(name => ({ skillId: '', skillName: name }));
    return { fi, profile, project, score: keywordMatchSkills(f, projectSkills(project)).matchScore, f };
  }));

  return {
    name: 'real',
    taxonomy,
    // Label = the skills the employer actually selected for the project
    extraction: projects.slice(0, 12).map(p => ({
      id: `real-ext-${p.id.slice(-6)}`,
      text: `${p.title}\n\n${p.description}`,
      expected: projectSkills(p).map(s => s.skillId).filter(id => taxonomyIds.has(id)),
      tags: ['real'],
    })).filter(c => c.expected.length > 0),
    // Label = the deterministic rule (same skill by normalized name); only partial
    // matches reach the model, so those are the ones sampled
    match: pairs.filter(p => p.score > 0 && p.score < 100).slice(0, 10).map(p => {
      const required = projectSkills(p.project).map(s => s.skillName);
      const have = new Set(p.f.map(s => normalizeSkillKey(s.skillName)));
      return {
        id: `real-match-f${p.fi + 1}-${p.project.id.slice(-6)}`,
        freelancer: p.f.map(s => s.skillName),
        required,
        expected: required.filter(r => have.has(normalizeSkillKey(r))),
        tags: ['real'],
      };
    }),
    gap: profiles.slice(0, 6).map((p, i) => ({ id: `real-gap-f${i + 1}`, current: profileSkills(p), tags: ['real'] })),
    proposal: [...pairs].sort((a, b) => b.score - a.score).slice(0, 3).map(p => ({
      id: `real-prop-f${p.fi + 1}-${p.project.id.slice(-6)}`,
      tags: ['real'],
      request: {
        freelancerName: `Freelancer ${p.fi + 1}`,
        freelancerSkills: profileSkills(p.profile),
        reputationScore: 0,
        completedProjectsCount: 0,
        portfolioItems: [],
        projectTitle: p.project.title,
        projectDescription: p.project.description,
        projectSkills: projectSkills(p.project).map(s => s.skillName),
        projectBudget: p.project.budget,
        projectMilestones: (p.project.milestones ?? []).map(m => ({ title: m.title, description: m.description ?? '', amount: m.amount ?? 0 })),
        projectDeadline: p.project.deadline,
      },
    })),
  };
}

async function main() {
  const args = parseArgs();

  const ai = await import('../../src/services/ai-client.js');
  const guards = await import('../../src/services/ai-guards.js');
  const { config } = await import('../../src/config/env.js');

  if (!ai.isAIAvailable()) {
    console.error('LLM_API_KEY is not set; nothing to evaluate.');
    process.exit(1);
  }

  const suite: Suite = args.real
    ? await loadRealSuite(guards.normalizeSkillKey, ai.keywordMatchSkills)
    : { name: 'dataset', ...(JSON.parse(readFileSync(resolve(here, 'dataset.json'), 'utf8')) as Omit<Suite, 'name'>) };

  const taxonomy = suite.taxonomy;
  const taxonomyNames = new Set(taxonomy.map(s => s.skillName));
  const toSkillInfo = (names: string[]) =>
    names.map(name => taxonomy.find(t => guards.normalizeSkillKey(t.skillName) === guards.normalizeSkillKey(name))
      ?? { skillId: `free:${name}`, skillName: name });

  // ── Capture every raw provider response ────────────────────────────────
  const rawCalls: RawCall[] = [];
  let current: { feature: Feature; caseId: string; run: number } = { feature: 'extraction', caseId: '', run: 0 };
  const modelWindow = new TokenWindow(Number(process.env['EVAL_MIN_TOKENS'] ?? 5000));
  let rateLimitedResponses = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const started = performance.now();
    const response = await realFetch(input, init);
    const latencyMs = performance.now() - started;
    modelWindow.observe(response.headers);
    if (response.status === 429) rateLimitedResponses++;
    let body: {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } = {};
    try {
      body = await response.clone().json();
    } catch { /* non-JSON error body */ }
    rawCalls.push({
      ...current,
      status: response.status,
      latencyMs,
      content: body.choices?.[0]?.message?.content ?? '',
      finishReason: body.choices?.[0]?.finish_reason,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    });
    return response;
  }) as typeof fetch;

  const run = async <T>(feature: Feature, caseId: string, runIndex: number, fn: () => Promise<T>) => {
    current = { feature, caseId, run: runIndex };
    for (let attempt = 1; ; attempt++) {
      await modelWindow.waitIfLow();
      const firstCall = rawCalls.length;
      const started = performance.now();
      const value = await fn();
      const latencyMs = performance.now() - started;
      const hitRateLimit = rawCalls.slice(firstCall).some(c => c.status === 429);
      if (!hitRateLimit || attempt >= MAX_CASE_ATTEMPTS) {
        return { value, latencyMs };
      }
      // Throw the rate-limited attempt away and rerun the case once the window refills
      rawCalls.splice(firstCall);
      modelWindow.exhaust();
    }
  };

  const results: CaseResult[] = [];
  const progress = (feature: Feature, id: string, r: number) =>
    process.stderr.write(`  ${feature} ${id}${args.runs > 1 ? ` (run ${r + 1}/${args.runs})` : ''}\n`);

  for (let r = 0; r < args.runs; r++) {
    // ── Extraction ───────────────────────────────────────────────────────
    if (args.only.has('extraction')) {
      for (const c of suite.extraction) {
        progress('extraction', c.id, r);
        const text = c.padTo ? `${FILLER.repeat(Math.ceil(c.padTo / FILLER.length)).slice(0, c.padTo)}\n\n${c.text}` : c.text;
        const { value, latencyMs } = await run('extraction', c.id, r, () =>
          ai.extractSkills({ text, availableSkills: taxonomy }));
        const fallback = ai.isAIError(value);
        const extracted = fallback ? ai.keywordExtractSkills(text, taxonomy) : value;
        // Same id filter matching-service applies before returning to the client
        const validIds = new Set(taxonomy.map(s => s.skillId));
        const final = extracted.filter(s => validIds.has(s.skillId));
        const got = new Set(final.map(s => s.skillId));
        const expected = new Set(c.expected);
        const tp = [...got].filter(id => expected.has(id)).length;
        const nameOf = (id: string) => taxonomy.find(t => t.skillId === id)?.skillName ?? id;
        results.push({
          feature: 'extraction', id: c.id, run: r, tags: c.tags ?? [], latencyMs, fallback,
          checks: { exactSet: tp === got.size && tp === expected.size },
          leakedNonEnglish: guards.findNonEnglishFields(final),
          leakedUnknownSkills: final.map(s => s.skillName).filter(n => !taxonomyNames.has(n)),
          output: final,
          signature: [...got].sort().join('|'),
          detail: { tp, fp: got.size - tp, fn: expected.size - tp },
          notes: [
            ...[...got].filter(id => !expected.has(id)).map(id => `extra: ${nameOf(id)}`),
            ...[...expected].filter(id => !got.has(id)).map(id => `missed: ${nameOf(id)}`),
          ],
        });
      }
    }

    // ── Match ────────────────────────────────────────────────────────────
    if (args.only.has('match')) {
      for (const c of suite.match) {
        progress('match', c.id, r);
        const freelancerSkills = toSkillInfo(c.freelancer);
        const projectRequirements = toSkillInfo(c.required);
        const { value, latencyMs } = await run('match', c.id, r, () =>
          ai.analyzeSkillMatch({ freelancerSkills, projectRequirements }));
        const fallback = ai.isAIError(value);
        const final = fallback ? ai.keywordMatchSkills(freelancerSkills, projectRequirements) : value;
        const expectedScore = Math.round((c.expected.length / c.required.length) * 100);
        const gotSet = new Set(final.matchedSkills);
        const expected = new Set(c.expected);
        results.push({
          feature: 'match', id: c.id, run: r, tags: c.tags ?? [], latencyMs, fallback,
          checks: {
            exactSet: gotSet.size === expected.size && c.expected.every(s => gotSet.has(s)),
          },
          leakedNonEnglish: guards.findNonEnglishFields({ ...final, matchedSkills: [], missingSkills: [] }),
          leakedUnknownSkills: final.matchedSkills.filter(s => !c.required.includes(s)),
          output: final,
          signature: [...gotSet].sort().join('|'),
          detail: { scoreError: Math.abs(final.matchScore - expectedScore) },
          notes: [
            ...[...gotSet].filter(s => !expected.has(s)).map(s => `extra: ${s}`),
            ...c.expected.filter(s => !gotSet.has(s)).map(s => `missed: ${s}`),
          ],
        });
      }
    }

    // ── Skill gap ────────────────────────────────────────────────────────
    if (args.only.has('gap')) {
      type Gap = { currentSkills: string[]; recommendedSkills: string[]; marketDemand: Array<{ skillName: string }>; reasoning: string };
      for (const c of suite.gap) {
        progress('gap', c.id, r);
        const { value, latencyMs } = await run('gap', c.id, r, () =>
          ai.generateSkillGapAnalysis(c.current, taxonomy) as Promise<Gap | { code: string }>);
        const fallback = 'code' in value;
        const final: Gap = 'code' in value
          ? { currentSkills: c.current, recommendedSkills: [], marketDemand: [], reasoning: '' }
          : value;
        const names = [...(final.recommendedSkills ?? []), ...(final.marketDemand ?? []).map(d => d?.skillName)];
        const currentKeys = new Set(c.current.map(guards.normalizeSkillKey));
        const candidatesLeft = taxonomy.some(t => !currentKeys.has(guards.normalizeSkillKey(t.skillName)));
        // The user's own skill names may be in any script
        const scrubbed = JSON.parse(JSON.stringify(final), (_k, v) =>
          typeof v === 'string' ? c.current.reduce((acc, s) => acc.split(s).join(' '), v) : v);
        results.push({
          feature: 'gap', id: c.id, run: r, tags: c.tags ?? [], latencyMs, fallback,
          checks: {
            valid: !fallback
              && names.every(n => typeof n === 'string' && taxonomyNames.has(n))
              && (final.recommendedSkills ?? []).every(n => typeof n === 'string' && !currentKeys.has(guards.normalizeSkillKey(n))),
            useful: !candidatesLeft || (final.recommendedSkills ?? []).length > 0,
          },
          leakedNonEnglish: guards.findNonEnglishFields(scrubbed),
          leakedUnknownSkills: names.filter(n => typeof n !== 'string' || !taxonomyNames.has(n)),
          output: final,
          signature: [...(final.recommendedSkills ?? [])].sort().join('|'),
        });
      }
    }

    // ── Proposal ─────────────────────────────────────────────────────────
    if (args.only.has('proposal')) {
      for (const c of suite.proposal) {
        progress('proposal', c.id, r);
        const request = c.request as unknown as Parameters<typeof ai.generateAIProposal>[0];
        const { value, latencyMs } = await run('proposal', c.id, r, () => ai.generateAIProposal(request));
        const templated = JSON.stringify(ai.fallbackGenerateProposal(request));
        const fallback = ai.isAIError(value) || JSON.stringify(value) === templated;
        const final = ai.isAIError(value) ? ai.fallbackGenerateProposal(request) : value;
        const milestones = Array.isArray(final.proposedMilestones) ? final.proposedMilestones : [];
        const milestoneSum = milestones.reduce((acc, m) => acc + (typeof m?.amount === 'number' ? m.amount : 0), 0);
        const prose = [final.coverLetter, ...(final.highlights ?? [])].join('\n');
        const allowedKeys = new Set([...c.request.freelancerSkills, ...c.request.projectSkills].map(guards.normalizeSkillKey));
        const unsupportedSkills = taxonomy
          .filter(t => !allowedKeys.has(guards.normalizeSkillKey(t.skillName)))
          .filter(t => new RegExp(`(?<![\\w.+#-])${guards.escapeRegExp(t.skillName)}(?![\\w+#-])`, t.skillName.length <= 3 ? '' : 'i').test(prose))
          .map(t => t.skillName);
        const words = final.coverLetter.split(/\s+/).filter(Boolean).length;
        const allowedText = [c.request.freelancerName, c.request.projectTitle, ...(c.request.projectMilestones ?? []).map(m => m.title)];
        const scrubbed = JSON.parse(JSON.stringify(final), (_k, v) =>
          typeof v === 'string' ? allowedText.reduce((acc, s) => (s ? acc.split(s).join(' ') : acc), v) : v);
        results.push({
          feature: 'proposal', id: c.id, run: r, tags: c.tags ?? [], latencyMs, fallback,
          checks: {
            structure: typeof final.coverLetter === 'string'
              && milestones.length > 0
              && milestones.every(m => typeof m?.title === 'string' && typeof m?.description === 'string'
                && typeof m?.amount === 'number' && m.amount > 0 && typeof m?.durationDays === 'number' && m.durationDays > 0)
              && Array.isArray(final.highlights) && final.highlights.length >= 3 && final.highlights.length <= 4,
            milestonesSumToRate: Math.abs(milestoneSum - final.proposedRate) <= final.proposedRate * 0.05,
            rateWithinBudget: final.proposedRate <= c.request.projectBudget * 1.5,
            lengthOk: words >= 120 && words <= 800,
            mentionsProject: final.coverLetter.toLowerCase().includes(c.request.projectTitle.toLowerCase()),
            signedByFreelancer: final.coverLetter.includes(c.request.freelancerName),
            mentionsEscrow: /escrow/i.test(final.coverLetter),
            noPlaceholders: !/\[(your|client|employer|name|company|insert|project)[^\]]*\]|\{\{|lorem ipsum|\bTODO\b/i.test(prose),
            noPromptLeak: !PROMPT_LEAK_MARKERS.some(m => prose.toLowerCase().includes(m.toLowerCase())),
            noUnsupportedSkills: unsupportedSkills.length === 0,
            noForbidden: !(c.forbidden ?? []).some(f => prose.toLowerCase().includes(f.toLowerCase())),
          },
          leakedNonEnglish: guards.findNonEnglishFields(scrubbed),
          leakedUnknownSkills: [],
          output: final,
          detail: { words },
          notes: unsupportedSkills.length ? [`claims skills not on profile/project: ${unsupportedSkills.join(', ')}`] : [],
        });
      }
    }
  }

  globalThis.fetch = realFetch;

  // ── Judge ──────────────────────────────────────────────────────────────
  const judgeModel = process.env['EVAL_JUDGE_MODEL'] ?? 'openai/gpt-oss-120b';
  if (args.judge) {
    const judgeWindow = new TokenWindow(3000);
    const judgeUrl = `${config.llm.apiUrl.replace(/\/+$/, '')}/chat/completions`;
    const ask = async (rubric: string, input: unknown, output: unknown) => {
      for (let attempt = 1; attempt <= MAX_CASE_ATTEMPTS; attempt++) {
        await judgeWindow.waitIfLow();
        const response = await realFetch(judgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llm.apiKey}` },
          body: JSON.stringify({
            model: judgeModel,
            temperature: 0,
            max_tokens: 1200,
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `You are a strict, fair evaluator of an AI feature on a Web3 and software freelance marketplace. Score each criterion from 1 (very poor) to 5 (excellent). Judge only against the given input; do not reward length. Respond with JSON only: {"scores": {<criterion>: number}, "issues": [up to 3 short strings naming concrete problems, empty if none]}.\n\nCriteria:\n${rubric}`,
              },
              { role: 'user', content: `INPUT:\n${JSON.stringify(input, null, 2)}\n\nOUTPUT TO EVALUATE:\n${JSON.stringify(output, null, 2)}` },
            ],
          }),
        });
        judgeWindow.observe(response.headers);
        if (response.status === 429) {
          judgeWindow.exhaust();
          continue;
        }
        try {
          const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
          const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '') as { scores?: Record<string, number>; issues?: string[] };
          if (parsed.scores) return { scores: parsed.scores, issues: (parsed.issues ?? []).slice(0, 3) };
        } catch { /* retry */ }
      }
      return undefined;
    };

    const rubrics: Partial<Record<Feature, string>> = {
      proposal: `- relevance: addresses this specific project's goals and required skills
- specificity: concrete plan and deliverables rather than generic filler
- honesty: claims only what the freelancer profile supports; no invented experience, skills or numbers; budget and milestones are consistent
- professionalism: tone, clarity, grammar and formatting suitable to send to a client`,
      gap: `- relevance: the recommended skills sensibly complement the freelancer's current skills for freelance software/Web3 work
- reasoning: the reasoning is accurate, specific and consistent with the recommendations`,
      match: `- faithfulness: the reasoning agrees with matchedSkills and missingSkills and does not claim matches that are not there`,
    };
    for (const r of results.filter(x => x.run === 0 && rubrics[x.feature] && !x.fallback)) {
      process.stderr.write(`  judge ${r.feature} ${r.id}\n`);
      const input = r.feature === 'proposal'
        ? suite.proposal.find(c => c.id === r.id)?.request
        : r.feature === 'gap'
          ? { currentSkills: suite.gap.find(c => c.id === r.id)?.current }
          : suite.match.find(c => c.id === r.id);
      const verdict = await ask(rubrics[r.feature]!, input, r.output);
      if (verdict) r.judge = verdict;
    }
  }

  // ── Raw (pre-guard) response analysis ──────────────────────────────────
  const rawStats = rawCalls.map(call => {
    const text = guards.stripReasoning(call.content);
    const parsed = text ? ai.parseJsonResponse<unknown>(text, 'Eval') : null;
    let skillNames: unknown[] = [];
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (call.feature === 'extraction') {
        const items = Array.isArray(parsed) ? parsed : (Array.isArray(obj['skills']) ? obj['skills'] as unknown[] : []);
        skillNames = items.map(i => (i as Record<string, unknown>)?.['skillName']);
      } else if (call.feature === 'match') {
        skillNames = Array.isArray(obj['matchedSkills']) ? obj['matchedSkills'] as unknown[] : [];
      } else if (call.feature === 'gap') {
        skillNames = [
          ...(Array.isArray(obj['recommendedSkills']) ? obj['recommendedSkills'] as unknown[] : []),
          ...(Array.isArray(obj['marketDemand']) ? (obj['marketDemand'] as unknown[]).map(d => (d as Record<string, unknown>)?.['skillName']) : []),
        ];
      }
    }
    const names = skillNames.filter((n): n is string => typeof n === 'string');
    return {
      ...call,
      ok: call.status === 200,
      parsed: parsed !== null && call.finishReason !== 'length',
      nonEnglish: guards.containsNonEnglishScript(call.content),
      hadThink: /<think>/i.test(call.content),
      skillCount: names.length,
      unknownSkillCount: guards.canonicalizeSkills(names, taxonomy).unknown.length,
    };
  });

  // ── Scorecard ──────────────────────────────────────────────────────────
  const caseFailed = (r: CaseResult) =>
    r.fallback || r.leakedNonEnglish.length > 0 || r.leakedUnknownSkills.length > 0 || Object.values(r.checks).some(v => !v);

  const rows = FEATURES
    .map(feature => {
      const rs = results.filter(r => r.feature === feature);
      const raws = rawStats.filter(r => r.feature === feature);
      if (rs.length === 0) return null;
      const okRaws = raws.filter(r => r.ok);
      const skills = okRaws.reduce((a, r) => a + r.skillCount, 0);
      const unknown = okRaws.reduce((a, r) => a + r.unknownSkillCount, 0);
      // Cases that never reach the model (deterministic 0%/100% matches, full-taxonomy gaps) are excluded
      const modelCases = new Set(raws.map(r => `${r.caseId}#${r.run}`)).size;
      return {
        feature,
        'case runs': rs.length,
        'calls': raws.length,
        'retry rate': pct(Math.max(0, raws.length - modelCases), modelCases),
        'JSON ok (raw)': pct(okRaws.filter(r => r.parsed).length, okRaws.length),
        'non-English (raw)': pct(okRaws.filter(r => r.nonEnglish).length, okRaws.length),
        'unknown skills (raw)': feature === 'proposal' ? '-' : pct(unknown, skills),
        'leaked non-Eng': rs.filter(r => r.leakedNonEnglish.length > 0).length,
        'leaked unknown': rs.reduce((a, r) => a + r.leakedUnknownSkills.length, 0),
        fallback: pct(rs.filter(r => r.fallback).length, rs.length),
        'pass': pct(rs.filter(r => !caseFailed(r)).length, rs.length),
        'p50 ms': percentile(rs.map(r => r.latencyMs), 50),
        'p95 ms': percentile(rs.map(r => r.latencyMs), 95),
        'avg tokens': okRaws.length
          ? Math.round(okRaws.reduce((a, r) => a + r.promptTokens + r.completionTokens, 0) / okRaws.length)
          : 0,
      };
    })
    .filter(Boolean);

  const quality: Record<string, string> = {};
  const ext = results.filter(r => r.feature === 'extraction');
  if (ext.length) {
    const tp = ext.reduce((a, r) => a + (r.detail?.['tp'] ?? 0), 0);
    const fp = ext.reduce((a, r) => a + (r.detail?.['fp'] ?? 0), 0);
    const fn = ext.reduce((a, r) => a + (r.detail?.['fn'] ?? 0), 0);
    const precision = tp + fp ? tp / (tp + fp) : 1;
    const recall = tp + fn ? tp / (tp + fn) : 1;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    quality['extraction precision'] = precision.toFixed(3);
    quality['extraction recall'] = recall.toFixed(3);
    quality['extraction F1 (target ≥ 0.80)'] = f1.toFixed(3);
    quality['extraction exact-set cases'] = pct(ext.filter(r => r.checks['exactSet']).length, ext.length);
  }
  const match = results.filter(r => r.feature === 'match');
  if (match.length) {
    quality['match exact-set accuracy'] = pct(match.filter(r => r.checks['exactSet']).length, match.length);
    quality['match score MAE (target ≤ 10)'] = avg(match.map(r => r.detail?.['scoreError'] ?? 0)).toFixed(1);
  }
  const gap = results.filter(r => r.feature === 'gap');
  if (gap.length) {
    quality['gap validity (target 100%)'] = pct(gap.filter(r => r.checks['valid']).length, gap.length);
    quality['gap non-empty recommendations'] = pct(gap.filter(r => r.checks['useful']).length, gap.length);
  }
  const prop = results.filter(r => r.feature === 'proposal');
  if (prop.length) {
    for (const check of Object.keys(prop[0]!.checks)) {
      quality[`proposal ${check}`] = pct(prop.filter(r => r.checks[check]).length, prop.length);
    }
  }

  // Consistency: does the same input give the same answer on every run?
  if (args.runs > 1) {
    for (const feature of ['extraction', 'match', 'gap'] as Feature[]) {
      const byCase = new Map<string, Set<string>>();
      for (const r of results.filter(x => x.feature === feature && x.signature !== undefined)) {
        if (!byCase.has(r.id)) byCase.set(r.id, new Set());
        byCase.get(r.id)!.add(r.signature!);
      }
      if (byCase.size) {
        quality[`${feature} consistency (same answer every run)`] =
          pct([...byCase.values()].filter(s => s.size === 1).length, byCase.size);
      }
    }
  }

  // Judge averages
  const judged = results.filter(r => r.judge);
  for (const feature of FEATURES) {
    const js = judged.filter(r => r.feature === feature);
    const criteria = [...new Set(js.flatMap(r => Object.keys(r.judge!.scores)))];
    for (const k of criteria) {
      quality[`judge ${feature} ${k} (1-5)`] = avg(js.map(r => r.judge!.scores[k]!).filter(Number.isFinite)).toFixed(2);
    }
  }

  // Pass rate by tag (base cases carry no tag)
  const byTag: Record<string, { cases: number; pass: string }> = {};
  const tags = new Set(results.flatMap(r => (r.tags.length ? r.tags : ['base'])));
  for (const tag of tags) {
    const rs = results.filter(r => (r.tags.length ? r.tags : ['base']).includes(tag));
    byTag[tag] = { cases: rs.length, pass: pct(rs.filter(r => !caseFailed(r)).length, rs.length) };
  }

  console.log(`\nAI evaluation — model ${config.llm.model} — suite "${suite.name}" — label "${args.label}" — runs ${args.runs}${args.judge ? ` — judge ${judgeModel}` : ''}\n`);
  console.table(rows);
  console.log(`Rate-limited (429) responses retried by the eval: ${rateLimitedResponses}`);
  console.table(quality);
  console.table(byTag);

  const attention = results.filter(r => caseFailed(r)
    || (r.notes?.length ?? 0) > 0
    || (r.judge && Object.values(r.judge.scores).some(s => s <= 3)));
  if (attention.length) {
    console.log('\nCases needing attention:');
    for (const r of attention) {
      const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => `failed:${k}`);
      const low = r.judge ? Object.entries(r.judge.scores).filter(([, s]) => s <= 3).map(([k, s]) => `judge ${k}=${s}`) : [];
      const notes = [
        ...failed,
        r.fallback ? 'fallback' : '',
        r.leakedNonEnglish.length ? `non-English in ${r.leakedNonEnglish.join(',')}` : '',
        r.leakedUnknownSkills.length ? `unknown skills: ${r.leakedUnknownSkills.join(', ')}` : '',
        ...(r.notes ?? []),
        ...low,
        ...(low.length ? r.judge!.issues.map(i => `↳ ${i}`) : []),
      ].filter(Boolean);
      console.log(`  ${r.feature}/${r.id}${args.runs > 1 ? `#${r.run + 1}` : ''}: ${notes.join('; ')}`);
    }
  }

  const outDir = resolve(here, 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = resolve(outDir, `${stamp}-${args.label}.json`);
  writeFileSync(outFile, JSON.stringify({
    label: args.label, suite: suite.name, runs: args.runs, model: config.llm.model,
    judgeModel: args.judge ? judgeModel : null, at: new Date().toISOString(),
    rateLimitedResponses, scorecard: rows, quality, byTag, results, rawCalls: rawStats,
  }, null, 2));
  console.log(`\nSaved ${outFile}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
