#!/usr/bin/env node
/**
 * Bump the patch version in package.json and mirror it into the OpenAPI
 * spec files, then print the new version to stdout.
 *
 * Runs in the deploy workflow before the Docker image build, so every push
 * to main deploys with an incremented version (1.0.0 -> 1.0.1 -> 1.0.2).
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = process.cwd();
const pkgPath = resolve(root, 'package.json');
const specPaths = [resolve(root, 'openapi.base.json'), resolve(root, 'openapi.json')];

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const [major, minor, patchRaw = '0'] = pkg.version.split('.');
const patch = parseInt(patchRaw, 10);
const nextVersion = Number.isFinite(patch)
  ? `${major}.${minor}.${patch + 1}`
  : `${major}.${minor}.0`;

pkg.version = nextVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

for (const specPath of specPaths) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  spec.info.version = nextVersion;
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
}

console.log(nextVersion);
