/**
 * AI layer evaluation
 *
 * Runs the labeled cases in dataset.json against the configured LLM provider
 * (LLM_API_URL / LLM_MODEL from .env) through the same exported functions the
 * API uses, then prints a scorecard and saves the full run to results/.
 *
 * Usage: pnpm eval:ai [--label <name>] [--only extraction|match|gap|proposal]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// NODE_ENV=test turns off the AI response cache (every case hits the model)
// and keeps Redis from connecting. Set before the service modules load.
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = process.env['EVAL_LOG_LEVEL'] ?? 'warn';

const here = dirname(fileURLToPath(import.meta.url));

type Skill = { skillId: string; skillName: string };
type Dataset = {
  taxonomy: Skill[];
  extraction: Array<{ id: string; text: string; expected: string[]; tags?: string[] }>;
  match: Array<{ id: string; freelancer: string[]; required: string[]; expected: string[]; tags?: string[] }>;
  gap: Array<{ id: string; current: string[]; tags?: string[] }>;
  proposal: Array<{ id: string; request: Record<string, unknown>; tags?: string[] }>;
};
type Feature = 'extraction' | 'match' | 'gap' | 'proposal';

type RawCall = {
  feature: Feature;
  caseId: string;
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
  tags: string[];
  latencyMs: number;
  fallback: boolean;
  checks: Record<string, boolean>;
  leakedNonEnglish: string[];
  leakedUnknownSkills: string[];
  output: unknown;
  detail?: Record<string, number>;
};

function parseArgs(): { label: string; only: Feature | undefined } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { label: get('--label') ?? 'run', only: get('--only') as Feature | undefined };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]!);
}

const pct = (num: number, den: number) => (den === 0 ? 'n/a' : `${((num / den) * 100).toFixed(1)}%`);

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

// Provider tokens-per-minute budget. Free-tier keys are small (Groq: 8k TPM),
// and a request reserves its max_tokens up front, so the eval waits for the
// window to refill instead of measuring rate-limit fallbacks as quality.
const MIN_TOKENS_BEFORE_CALL = Number(process.env['EVAL_MIN_TOKENS'] ?? 5000);
const MAX_CASE_ATTEMPTS = 4;

async function main() {
  const { label, only } = parseArgs();
  const dataset = JSON.parse(readFileSync(resolve(here, 'dataset.json'), 'utf8')) as Dataset;

  const ai = await import('../../src/services/ai-client.js');
  const guards = await import('../../src/services/ai-guards.js');
  const { config } = await import('../../src/config/env.js');

  if (!ai.isAIAvailable()) {
    console.error('LLM_API_KEY is not set; nothing to evaluate.');
    process.exit(1);
  }

  const taxonomy = dataset.taxonomy;
  const taxonomyNames = new Set(taxonomy.map(s => s.skillName));
  const toSkillInfo = (names: string[]) =>
    names.map(name => taxonomy.find(t => guards.normalizeSkillKey(t.skillName) === guards.normalizeSkillKey(name))
      ?? { skillId: `free:${name}`, skillName: name });

  // ── Capture every raw provider response ────────────────────────────────
  const rawCalls: RawCall[] = [];
  let currentFeature: Feature = 'extraction';
  let currentCase = '';
  let remainingTokens = Infinity;
  let tokensResetMs = 0;
  let rateLimitedResponses = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const started = performance.now();
    const response = await realFetch(input, init);
    const latencyMs = performance.now() - started;
    const remaining = response.headers.get('x-ratelimit-remaining-tokens');
    if (remaining !== null) remainingTokens = Number(remaining);
    tokensResetMs = Math.max(
      parseResetMs(response.headers.get('x-ratelimit-reset-tokens')),
      Number(response.headers.get('retry-after') ?? 0) * 1000,
    );
    if (response.status === 429) rateLimitedResponses++;
    try {
      const body = await response.clone().json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      rawCalls.push({
        feature: currentFeature,
        caseId: currentCase,
        status: response.status,
        latencyMs,
        content: body.choices?.[0]?.message?.content ?? '',
        finishReason: body.choices?.[0]?.finish_reason,
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
      });
    } catch {
      rawCalls.push({
        feature: currentFeature, caseId: currentCase, status: response.status, latencyMs,
        content: '', finishReason: undefined, promptTokens: 0, completionTokens: 0,
      });
    }
    return response;
  }) as typeof fetch;

  const results: CaseResult[] = [];
  const run = async <T>(feature: Feature, id: string, fn: () => Promise<T>) => {
    currentFeature = feature;
    currentCase = id;
    for (let attempt = 1; ; attempt++) {
      if (remainingTokens < MIN_TOKENS_BEFORE_CALL && tokensResetMs > 0) {
        await sleep(tokensResetMs + 500);
        remainingTokens = Infinity;
      }
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
      remainingTokens = 0;
      tokensResetMs = Math.max(tokensResetMs, 5000);
    }
  };

  // ── Extraction ─────────────────────────────────────────────────────────
  if (!only || only === 'extraction') {
    for (const c of dataset.extraction) {
      const { value, latencyMs } = await run('extraction', c.id, () =>
        ai.extractSkills({ text: c.text, availableSkills: taxonomy }));
      const fallback = ai.isAIError(value);
      const extracted = fallback ? ai.keywordExtractSkills(c.text, taxonomy) : value;
      // Same id filter matching-service applies before returning to the client
      const validIds = new Set(taxonomy.map(s => s.skillId));
      const final = extracted.filter(s => validIds.has(s.skillId));
      const got = new Set(final.map(s => s.skillId));
      const expected = new Set(c.expected);
      const tp = [...got].filter(id => expected.has(id)).length;
      results.push({
        feature: 'extraction', id: c.id, tags: c.tags ?? [], latencyMs, fallback,
        checks: { exactSet: tp === got.size && tp === expected.size },
        leakedNonEnglish: guards.findNonEnglishFields(final),
        leakedUnknownSkills: final.map(s => s.skillName).filter(n => !taxonomyNames.has(n)),
        output: final,
        detail: { tp, fp: got.size - tp, fn: expected.size - tp },
      });
    }
  }

  // ── Match ──────────────────────────────────────────────────────────────
  if (!only || only === 'match') {
    for (const c of dataset.match) {
      const freelancerSkills = toSkillInfo(c.freelancer);
      const projectRequirements = toSkillInfo(c.required);
      const { value, latencyMs } = await run('match', c.id, () =>
        ai.analyzeSkillMatch({ freelancerSkills, projectRequirements }));
      const fallback = ai.isAIError(value);
      const final = fallback ? ai.keywordMatchSkills(freelancerSkills, projectRequirements) : value;
      const expectedScore = Math.round((c.expected.length / c.required.length) * 100);
      const gotSet = new Set(final.matchedSkills);
      results.push({
        feature: 'match', id: c.id, tags: c.tags ?? [], latencyMs, fallback,
        checks: {
          exactSet: gotSet.size === c.expected.length && c.expected.every(s => gotSet.has(s)),
        },
        leakedNonEnglish: guards.findNonEnglishFields(final),
        leakedUnknownSkills: final.matchedSkills.filter(s => !c.required.includes(s)),
        output: final,
        detail: { scoreError: Math.abs(final.matchScore - expectedScore) },
      });
    }
  }

  // ── Skill gap ──────────────────────────────────────────────────────────
  if (!only || only === 'gap') {
    type Gap = { currentSkills: string[]; recommendedSkills: string[]; marketDemand: Array<{ skillName: string }>; reasoning: string };
    const gapFn = (current: string[]): Promise<Gap | { code: string }> =>
      ai.generateSkillGapAnalysis(current, taxonomy);

    for (const c of dataset.gap) {
      const { value, latencyMs } = await run('gap', c.id, () => gapFn(c.current));
      const fallback = 'code' in value;
      const final: Gap = 'code' in value
        ? { currentSkills: c.current, recommendedSkills: [], marketDemand: [], reasoning: '' }
        : value;
      const names = [...(final.recommendedSkills ?? []), ...(final.marketDemand ?? []).map(d => d?.skillName)];
      const currentKeys = new Set(c.current.map(guards.normalizeSkillKey));
      results.push({
        feature: 'gap', id: c.id, tags: c.tags ?? [], latencyMs, fallback,
        checks: {
          valid: !fallback
            && names.every(n => typeof n === 'string' && taxonomyNames.has(n))
            && (final.recommendedSkills ?? []).every(n => typeof n === 'string' && !currentKeys.has(guards.normalizeSkillKey(n))),
          useful: (final.recommendedSkills ?? []).length > 0,
        },
        leakedNonEnglish: guards.findNonEnglishFields(final),
        leakedUnknownSkills: names.filter(n => typeof n !== 'string' || !taxonomyNames.has(n)),
        output: final,
      });
    }
  }

  // ── Proposal ───────────────────────────────────────────────────────────
  if (!only || only === 'proposal') {
    for (const c of dataset.proposal) {
      const request = c.request as unknown as Parameters<typeof ai.generateAIProposal>[0];
      const { value, latencyMs } = await run('proposal', c.id, () => ai.generateAIProposal(request));
      const templated = JSON.stringify(ai.fallbackGenerateProposal(request));
      const fallback = ai.isAIError(value) || JSON.stringify(value) === templated;
      const final = ai.isAIError(value) ? ai.fallbackGenerateProposal(request) : value;
      const milestones = Array.isArray(final.proposedMilestones) ? final.proposedMilestones : [];
      const milestoneSum = milestones.reduce((acc, m) => acc + (typeof m?.amount === 'number' ? m.amount : 0), 0);
      const budget = request.projectBudget;
      results.push({
        feature: 'proposal', id: c.id, tags: c.tags ?? [], latencyMs, fallback,
        checks: {
          structure: typeof final.coverLetter === 'string' && final.coverLetter.length >= 300
            && milestones.length > 0
            && milestones.every(m => typeof m?.title === 'string' && typeof m?.description === 'string'
              && typeof m?.amount === 'number' && m.amount > 0 && typeof m?.durationDays === 'number' && m.durationDays > 0)
            && Array.isArray(final.highlights) && final.highlights.length >= 3 && final.highlights.length <= 4,
          milestonesSumToRate: Math.abs(milestoneSum - final.proposedRate) <= final.proposedRate * 0.05,
          rateWithinBudget: final.proposedRate <= budget * 1.5,
        },
        leakedNonEnglish: guards.findNonEnglishFields(final),
        leakedUnknownSkills: [],
        output: final,
      });
    }
  }

  globalThis.fetch = realFetch;

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
  const features: Feature[] = ['extraction', 'match', 'gap', 'proposal'];
  const rows = features
    .map(feature => {
      const rs = results.filter(r => r.feature === feature);
      const raws = rawStats.filter(r => r.feature === feature);
      if (rs.length === 0) return null;
      const okRaws = raws.filter(r => r.ok);
      const skills = okRaws.reduce((a, r) => a + r.skillCount, 0);
      const unknown = okRaws.reduce((a, r) => a + r.unknownSkillCount, 0);
      return {
        feature,
        cases: rs.length,
        'provider calls': raws.length,
        'JSON valid (raw)': pct(okRaws.filter(r => r.parsed).length, okRaws.length),
        'non-English (raw)': pct(okRaws.filter(r => r.nonEnglish).length, okRaws.length),
        '<think> (raw)': pct(okRaws.filter(r => r.hadThink).length, okRaws.length),
        'unknown skills (raw)': feature === 'proposal' ? '-' : pct(unknown, skills),
        'leaked non-English': rs.filter(r => r.leakedNonEnglish.length > 0).length,
        'leaked unknown skills': rs.reduce((a, r) => a + r.leakedUnknownSkills.length, 0),
        fallback: pct(rs.filter(r => r.fallback).length, rs.length),
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
    quality['match score MAE (target ≤ 10)'] = (match.reduce((a, r) => a + (r.detail?.['scoreError'] ?? 0), 0) / match.length).toFixed(1);
  }
  const gap = results.filter(r => r.feature === 'gap');
  if (gap.length) {
    quality['gap validity (target 100%)'] = pct(gap.filter(r => r.checks['valid']).length, gap.length);
    quality['gap non-empty recommendations'] = pct(gap.filter(r => r.checks['useful']).length, gap.length);
  }
  const prop = results.filter(r => r.feature === 'proposal');
  if (prop.length) {
    quality['proposal structure pass (target ≥ 95%)'] = pct(prop.filter(r => r.checks['structure']).length, prop.length);
    quality['proposal milestones sum to rate'] = pct(prop.filter(r => r.checks['milestonesSumToRate']).length, prop.length);
    quality['proposal rate within 1.5× budget'] = pct(prop.filter(r => r.checks['rateWithinBudget']).length, prop.length);
  }

  console.log(`\nAI evaluation — model ${config.llm.model} — label "${label}"\n`);
  console.table(rows);
  console.log(`Rate-limited (429) responses retried by the eval: ${rateLimitedResponses}`);
  console.table(quality);

  const failing = results.filter(r => r.leakedNonEnglish.length || r.leakedUnknownSkills.length || r.fallback
    || Object.values(r.checks).some(v => !v));
  if (failing.length) {
    console.log('\nCases needing attention:');
    for (const r of failing) {
      const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
      const notes = [
        ...failed.map(k => `failed:${k}`),
        r.fallback ? 'fallback' : '',
        r.leakedNonEnglish.length ? `non-English in ${r.leakedNonEnglish.join(',')}` : '',
        r.leakedUnknownSkills.length ? `unknown skills: ${r.leakedUnknownSkills.join(', ')}` : '',
      ].filter(Boolean);
      console.log(`  ${r.feature}/${r.id}: ${notes.join('; ')}`);
    }
  }

  const outDir = resolve(here, 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = resolve(outDir, `${stamp}-${label}.json`);
  writeFileSync(outFile, JSON.stringify({
    label, model: config.llm.model, at: new Date().toISOString(),
    rateLimitedResponses, scorecard: rows, quality, results, rawCalls: rawStats,
  }, null, 2));
  console.log(`\nSaved ${outFile}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
