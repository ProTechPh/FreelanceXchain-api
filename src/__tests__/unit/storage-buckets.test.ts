// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('storage bucket provisioning', () => {
  const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/file-upload.ts'), 'utf8');
  const setupSource = readFileSync(resolve(process.cwd(), 'scripts/setup-appwrite-db.ts'), 'utf8');

  const allowedBuckets = [
    ...routeSource
      .slice(routeSource.indexOf('const ALLOWED_BUCKETS'), routeSource.indexOf('];', routeSource.indexOf('const ALLOWED_BUCKETS')))
      .matchAll(/'([a-z-]+)'/g),
  ].map((m) => m[1]);

  const provisionedBuckets = [...setupSource.matchAll(/bucketId:\s*'([a-z-]+)'/g)].map((m) => m[1]);

  it('parses both lists', () => {
    expect(allowedBuckets.length).toBeGreaterThan(0);
    expect(provisionedBuckets.length).toBeGreaterThan(0);
  });

  it('provisions every bucket the upload route accepts', () => {
    const missing = allowedBuckets.filter((b) => !provisionedBuckets.includes(b));
    expect(missing).toEqual([]);
  });
});
