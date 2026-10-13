/**
 * AI output guards
 * Pure helpers that keep LLM output in English and inside the skill taxonomy.
 */

import type { SkillInfo } from './ai-types.js';

// Scripts the model has drifted into in practice (Qwen → Chinese) plus other
// common non-Latin scripts. Latin text (English, Filipino/Taglish), digits,
// punctuation and emoji are all allowed.
const NON_ENGLISH_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Greek}]/u;

export function containsNonEnglishScript(text: string): boolean {
  return NON_ENGLISH_SCRIPT.test(text);
}

/**
 * Walk every string in a parsed value and return the paths that contain
 * non-English script, e.g. ["reasoning", "marketDemand[0].skillName"].
 */
export function findNonEnglishFields(value: unknown, path = ''): string[] {
  if (typeof value === 'string') {
    return containsNonEnglishScript(value) ? [path || '(root)'] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findNonEnglishFields(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      findNonEnglishFields(item, path ? `${path}.${key}` : key)
    );
  }
  return [];
}

/**
 * Remove reasoning-model preambles (<think>…</think>), including an unclosed
 * one left by a truncated reply.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * Comparison key for skill names: case, spacing and common spelling variants
 * collapse to one key ("React.js" / "ReactJS" / "react" → "react",
 * "Node.js" / "NodeJS" → "node"), while distinct skills stay distinct
 * ("Java" ≠ "JavaScript", "C" ≠ "C++" ≠ "C#").
 */
export function normalizeSkillKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/\.?js$/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export type CanonicalSkills = {
  known: SkillInfo[];
  unknown: string[];
};

/**
 * Map model-produced skill names onto the taxonomy by exact normalized key.
 * Known skills come back with the taxonomy's own id and name, de-duplicated;
 * anything else is reported as unknown and must not be shown or stored.
 */
export function canonicalizeSkills(names: unknown[], taxonomy: SkillInfo[]): CanonicalSkills {
  const byKey = new Map<string, SkillInfo>();
  for (const skill of taxonomy) {
    const key = normalizeSkillKey(skill.skillName);
    if (key && !byKey.has(key)) byKey.set(key, skill);
  }

  const known: SkillInfo[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const match = byKey.get(normalizeSkillKey(name));
    if (!match) {
      unknown.push(name.trim());
    } else if (!seen.has(match.skillId)) {
      seen.add(match.skillId);
      known.push(match);
    }
  }
  return { known, unknown };
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Trim user-supplied text to a length the prompt budget can afford.
 */
export function capText(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
