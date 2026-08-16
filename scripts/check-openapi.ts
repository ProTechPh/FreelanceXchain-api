import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { generateSwaggerSpec } from '../src/config/swagger.js';

/**
 * CI drift check: regenerate `openapi.json` from `openapi.base.json` (the
 * canonical, hand-maintained spec) plus the validation-middleware schemas, and
 * fail when the committed file differs.
 *
 * Because the committed `openapi.json` must be an exact artifact of this
 * regeneration, ANY semantic difference is drift — a middleware schema changed
 * without regenerating, or a hand-edit was made to `openapi.json` instead of
 * the base. Fix with: `pnpm run openapi:generate`.
 */
function main(): void {
  const committedPath = resolve(process.cwd(), 'openapi.json');
  let committed: unknown;
  try {
    committed = JSON.parse(readFileSync(committedPath, 'utf8')) as unknown;
  } catch (error) {
    console.error(`Failed to read committed spec at ${committedPath}:`, error);
    process.exit(1);
  }

  const generated = generateSwaggerSpec();

  if (isDeepStrictEqual(generated, committed)) {
    console.log('OpenAPI spec is up to date (openapi.json == generated from openapi.base.json + middleware schemas).');
    return;
  }

  const committedPaths = Object.keys((committed as { paths?: Record<string, unknown> }).paths ?? {});
  const generatedPaths = Object.keys((generated as { paths?: Record<string, unknown> }).paths ?? {});
  const missing = committedPaths.filter(p => !generatedPaths.includes(p));
  const added = generatedPaths.filter(p => !committedPaths.includes(p));
  const shared = committedPaths.filter(p => generatedPaths.includes(p));
  const changed = shared.filter(p => !isDeepStrictEqual(
    (committed as { paths?: Record<string, unknown> }).paths?.[p],
    (generated as { paths?: Record<string, unknown> }).paths?.[p],
  ));

  console.error('OpenAPI spec drift detected: committed openapi.json differs from the spec regenerated from openapi.base.json.');
  if (missing.length > 0) console.error(`  Paths only in committed spec (hand-edits): ${missing.join(', ')}`);
  if (added.length > 0) console.error(`  Paths only in regenerated spec: ${added.join(', ')}`);
  if (changed.length > 0) console.error(`  Paths with differing operations: ${changed.join(', ')}`);
  console.error('');
  console.error('Either a validation-middleware schema changed without regenerating, or openapi.json was hand-edited.');
  console.error('Fix by running `pnpm run openapi:generate` and committing the result (make hand-edits in openapi.base.json instead).');
  process.exit(1);
}

main();
