/**
 * Canonical skill-name normalization for duplicate detection.
 *
 * Turns visually-equivalent inputs into one key so users cannot spam
 * duplicates of an existing skill with padding, weird casing, full-width
 * unicode, repeated inner whitespace, or invisible zero-width characters
 * (e.g. " React " -> "react", "Ｒｅａｃｔ" -> "react", "Node  JS" -> "node js",
 * "R\u200beact" -> "react").
 */
const FORMAT_CHARS_PATTERN = /[\u200b-\u200d\u2060\ufeff]/g;
const NODE_JS_ALIAS_PATTERN = /^node[\s._-]*js$/;

export function normalizeSkillName(name: string): string {
  return name
    .normalize('NFKC')
    // Strip zero-width / format characters (U+200B-U+200D, U+2060, U+FEFF) —
    // JS `\s` does not match these, so they would otherwise bypass dedup.
    .replace(FORMAT_CHARS_PATTERN, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Canonical key for exact skill-facet matching.
 *
 * This is still exact matching: only known aliases of the same skill collapse
 * together. It deliberately does not treat broad labels like "Node" or
 * "JavaScript" as Node.js.
 */
export function normalizeSkillSearchKey(name: string): string {
  const normalized = normalizeSkillName(name);
  return NODE_JS_ALIAS_PATTERN.test(normalized) ? 'node.js' : normalized;
}

/**
 * Display canonical aliases returned from legacy profile data without changing
 * unrelated custom skill casing.
 */
export function canonicalizeSkillDisplayName(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(FORMAT_CHARS_PATTERN, '')
    .trim()
    .replace(/\s+/g, ' ');

  return normalizeSkillSearchKey(cleaned) === 'node.js' ? 'Node.js' : cleaned;
}
