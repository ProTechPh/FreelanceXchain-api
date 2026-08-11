/**
 * Canonical skill-name normalization for duplicate detection.
 *
 * Turns visually-equivalent inputs into one key so users cannot spam
 * duplicates of an existing skill with padding, weird casing, full-width
 * unicode, repeated inner whitespace, or invisible zero-width characters
 * (e.g. " React " -> "react", "Ｒｅａｃｔ" -> "react", "Node  JS" -> "node js",
 * "R\u200beact" -> "react").
 */
export function normalizeSkillName(name: string): string {
  return name
    .normalize('NFKC')
    // Strip zero-width / format characters (U+200B-U+200D, U+2060, U+FEFF) —
    // JS `\s` does not match these, so they would otherwise bypass dedup.
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
