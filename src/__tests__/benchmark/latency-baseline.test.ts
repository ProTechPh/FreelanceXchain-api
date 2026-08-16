/**
 * Latency baseline for POST /api/projects and POST /api/proposals.
 *
 * Measures the API request-handling path (Express + middleware + validation +
 * serialization) with service dependencies mocked — same wiring as the route
 * unit tests, flooded over real HTTP. This is a FRAMEWORK-OVERHEAD baseline:
 * Appwrite/Redis round-trips and service business logic are excluded, so real
 * latency will be higher. Run with:
 *
 *   node --experimental-vm-modules node_modules/jest/bin/jest.js \
 *     src/__tests__/benchmark/latency-baseline.test.ts --testTimeout=120000
 */
// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ── Service mocks (resolve instantly; no DB/blockchain I/O) ────────────────
const mockCreateProject = jest.fn(async () => ({
  success: true,
  data: { id: 'proj-bench-1', title: 'Benchmark project', status: 'open' },
}));
jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  createProject: mockCreateProject,
  getProjectById: jest.fn(),
  getProjectCategoryStats: jest.fn(),
  updateProject: jest.fn(),
  setMilestones: jest.fn(),
  listOpenProjects: jest.fn(),
  searchProjects: jest.fn(),
  listProjectsBySkills: jest.fn(),
  listProjectsByBudgetRange: jest.fn(),
  listProjectsByEmployer: jest.fn(),
  listProjectsByCategory: jest.fn(),
  listProjectsByMultipleCategories: jest.fn(),
  getProposalsByProject: jest.fn(),
  mapProjectFromEntity: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule(resolveModule('src/services/proposal-service.ts'), () => ({
  submitProposal: jest.fn(async () => ({
    success: true,
    data: { proposal: { id: 'prop-bench-1', status: 'pending' } },
  })),
  getProposalById: jest.fn(),
  getProposalWithEmployerHistory: jest.fn(),
  getProposalsByFreelancer: jest.fn(),
  getProposalsByProject: jest.fn(),
  acceptProposal: jest.fn(),
  rejectProposal: jest.fn(),
  withdrawProposal: jest.fn(),
}));

// ── Middleware mocks ────────────────────────────────────────────────────────
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: { nodeEnv: 'test', port: 0, baseUrl: 'http://localhost' },
    appwrite: { endpoint: 'http://localhost/v1', projectId: 'bench', apiKey: 'bench', databaseId: 'bench', buckets: {} },
    jwt: {},
    redis: {},
  },
}));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    auth: jest.fn(), authzFailure: jest.fn(), security: jest.fn(),
  },
}));
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', userId: 'user-1', email: 'bench@test.com', role: 'employer' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  withdrawalRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), async () => {
  // Real validation schemas + validate; only the UUID helpers are mocked.
  const real = await import('../../middleware/validation-core.js');
  return {
    ...real,
    validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    isValidUUID: jest.fn(() => true),
  };
});
jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  uploadProjectAttachments: [(_req: any, _res: any, next: any) => next()],
  uploadProposalAttachments: [(_req: any, _res: any, next: any) => next()],
}));
jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'bench-request-id',
}));
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: jest.fn(async () => [{ success: true, metadata: { id: 'f1' } }]),
  cleanupUploadedFiles: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  DATABASE_ID: 'bench',
  BUCKETS: {},
  databases: { listDocuments: jest.fn(), createDocument: jest.fn(), getDocument: jest.fn(), updateDocument: jest.fn() },
  Query: {},
  ID: { unique: () => 'bench-id' },
  Permission: {},
  Role: {},
  Client: class {},
  Account: class {},
  Storage: class {},
  Users: class {},
}));
jest.unstable_mockModule(resolveModule('src/utils/async-handler.ts'), () => ({
  asyncHandler: (fn: any) => fn,
}));

describe('Latency baseline (framework overhead, services mocked)', () => {
  it('loads POST /api/projects and POST /api/proposals', async () => {
    const expressMod = (await import('express')).default;
    const projectRouter = (await import('../../routes/project-routes.js')).default;
    const proposalRouter = (await import('../../routes/proposal-routes.js')).default;

    const app = expressMod();
    app.use(expressMod.json());
    app.use('/api/projects', projectRouter);
    app.use('/api/proposals', proposalRouter);
    app.use((err: any, _req: any, res: any, _next: any) => {
      console.log('[route error]', err?.message);
      res.status(500).json({ error: { message: err?.message } });
    });

    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;

    const projectBody = {
      title: 'Benchmark marketplace project',
      description: 'A sufficiently long description for the benchmark load test run.',
      requiredSkills: [{ skillId: '550e8400-e29b-41d4-a716-446655440000' }],
      budget: 5000,
      deadline: '2026-12-31',
    };
    const proposalBody = {
      projectId: '550e8400-e29b-41d4-a716-446655440000',
      attachments: [{ url: 'https://example.com/f.pdf', filename: 'f.pdf', size: 10, mimeType: 'application/pdf' }],
      proposedRate: 50,
      estimatedDuration: 30,
    };

    async function runFlood(pathName: string, body: unknown, concurrency: number, total: number) {
      // Warm-up (fail fast with the body if the wiring is wrong)
      const warm = await request(server).post(pathName).send(body);
      if (warm.status !== 201) {
        throw new Error(`warm-up ${pathName} returned ${warm.status}: ${JSON.stringify(warm.body).slice(0, 200)}`);
      }

      const latencies: number[] = [];
      let index = 0;
      let failures = 0;
      const worker = async () => {
        while (true) {
          const i = index++;
          if (i >= total) return;
          const start = performance.now();
          const res = await request(server).post(pathName).send(body);
          latencies.push(performance.now() - start);
          if (res.status !== 201) failures++;
        }
      };
      const startAll = performance.now();
      await Promise.all(Array.from({ length: concurrency }, worker));
      const elapsedSec = (performance.now() - startAll) / 1000;

      latencies.sort((a, b) => a - b);
      const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
      return {
        path: pathName,
        requests: latencies.length,
        concurrency,
        rps: latencies.length / elapsedSec,
        p50Ms: p(0.5).toFixed(2),
        p95Ms: p(0.95).toFixed(2),
        p99Ms: p(0.99).toFixed(2),
        maxMs: latencies[latencies.length - 1]!.toFixed(2),
        errors: failures,
      };
    }

    const results = [
      await runFlood('/api/projects', projectBody, 25, 1000),
      await runFlood('/api/proposals', proposalBody, 25, 1000),
    ];

    server.close();

    const report = {
      note: 'Framework-overhead baseline only: Express + auth + real validation middleware + serialization. Appwrite/Redis/service I/O excluded — production latency will be higher.',
      results,
    };
    writeFileSync('benchmark-results.json', JSON.stringify(report, null, 2));
    console.log('\n===== LATENCY BASELINE =====');
    for (const r of results) {
      console.log(`${r.path}: ${r.requests} req @ concurrency ${r.concurrency} | ${r.rps.toFixed(0)} rps | p50 ${r.p50Ms}ms | p95 ${r.p95Ms}ms | p99 ${r.p99Ms}ms | max ${r.maxMs}ms | errors ${r.errors}`);
    }
    console.log('===== END =====');

    expect(mockCreateProject).toHaveBeenCalled();
    expect(results[0].requests).toBe(1000);
    expect(results[1].requests).toBe(1000);
  }, 110000);
});
