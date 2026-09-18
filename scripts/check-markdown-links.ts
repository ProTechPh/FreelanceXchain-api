import { basename, dirname, join, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

/**
 * CI markdown-link check: walk every markdown file in the repo (excluding
 * CHANGELOG.md — its links intentionally point at docs that were moved or
 * deleted — and build/vendor directories) and fail on any internal relative
 * link, to a file or a directory, that does not resolve.
 *
 * External links (http(s), mailto, tel, data, protocol-relative //), pure
 * in-page anchors (#section), and links inside fenced code blocks are
 * ignored.
 *
 * Fix with: `pnpm run docs:check`.
 */
const ROOT = resolve(process.cwd());
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.zcode', 'dist', 'coverage', 'artifacts']);

function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md') || name.toLowerCase().endsWith('.markdown');
}

/** Recursively collect markdown files, skipping build/vendor directories. */
function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (isMarkdownFile(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract relative-link targets from a markdown file.
 * Fenced code blocks are stripped first so example paths in code samples
 * don't produce false positives.
 */
function extractLinkTargets(content: string): string[] {
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const targets: string[] = [];
  const linkPattern = /\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(withoutCodeBlocks)) !== null) {
    targets.push(match[1]);
  }
  return targets;
}

/** Returns a human-readable failure message, or null when the link is fine. */
function validateTarget(filePath: string, rawTarget: string): string | null {
  const target = rawTarget.split('#')[0].trim();
  if (!target) return null;
  // External / protocol-relative / in-page anchors are out of scope.
  if (/^(https?:|mailto:|tel:|data:|\/\/)/i.test(target)) return null;
  if (target.startsWith('#')) return null;

  const resolved = resolve(join(dirname(filePath), target));
  if (existsSync(resolved)) return null;
  return `${filePath} -> ${rawTarget}`;
}

function main(): void {
  const files = collectMarkdownFiles(ROOT).filter(file => !/changelog/i.test(basename(file)));

  const broken: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const target of extractLinkTargets(content)) {
      const failure = validateTarget(file, target);
      if (failure) broken.push(failure);
    }
  }

  if (broken.length === 0) {
    console.log(`Markdown links OK (${files.length} files checked).`);
    return;
  }

  console.error(`Broken internal markdown links (${broken.length}):`);
  for (const failure of broken) console.error(`  ${failure}`);
  console.error('');
  console.error('Fix each link to point at an existing file/directory, or add the file to the');
  console.error('explicit exclusion list in scripts/check-markdown-links.ts if it is intentionally historical.');
  process.exit(1);
}

main();
