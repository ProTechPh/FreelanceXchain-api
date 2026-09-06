/**
 * Latency baseline benchmark suite across core marketplace endpoints:
 * - POST /api/projects (Create project - heavy validation)
 * - GET  /api/projects (List open projects - pagination)
 * - POST /api/proposals (Submit proposal - validation & rates)
 * - GET  /api/skills (Full skill taxonomy - LRU cache read)
 * - GET  /api/reputation/:userId (Reputation score computation)
 * - GET  /api/reputation/:userId/history (Work history - project title mapping)
 *
 * Measures the API request-handling path (Express + middleware + validation +
 * serialization) with service dependencies mocked — same wiring as the route
 * unit tests, flooded over real HTTP.
 */
// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
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
const mockListOpenProjects = jest.fn(async () => ({
  success: true,
  data: {
    items: [
      { id: 'proj-bench-1', title: 'Benchmark project', status: 'open', budget: 5000, employer_id: 'user-1' },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  },
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  createProject: mockCreateProject,
  getProjectById: jest.fn(),
  getProjectCategoryStats: jest.fn(),
  updateProject: jest.fn(),
  setMilestones: jest.fn(),
  listOpenProjects: mockListOpenProjects,
  searchProjects: jest.fn(),
  listProjectsBySkills: jest.fn(),
  listProjectsByBudgetRange: jest.fn(),
  listProjectsByEmployer: jest.fn(),
  listProjectsByCategory: jest.fn(),
  listProjectsByMultipleCategories: jest.fn(),
  getProposalsByProject: jest.fn(),
  mapProjectFromEntity: (p: any) => p,
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

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  getFullTaxonomy: jest.fn(async () => ({
    categories: [
      { id: 'cat-1', name: 'Software Development', skills: [{ id: 'sk-1', name: 'TypeScript' }] },
    ],
  })),
  getActiveCategories: jest.fn(async () => []),
  getAllCategories: jest.fn(async () => []),
  createCategory: jest.fn(),
  getCategoryById: jest.fn(),
  updateCategory: jest.fn(),
  createSkill: jest.fn(),
  getSkillById: jest.fn(),
  updateSkill: jest.fn(),
  deprecateSkill: jest.fn(),
  getAllSkills: jest.fn(async () => []),
  getActiveSkills: jest.fn(async () => []),
  getActiveSkillsByCategory: jest.fn(async () => []),
  searchSkills: jest.fn(async () => []),
  validateSkillIds: jest.fn(async () => ({ valid: [], invalid: [] })),
}));

jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
  createUserCustomSkill: jest.fn(),
  getUserCustomSkills: jest.fn(async () => []),
  getUserCustomSkillById: jest.fn(),
  updateUserCustomSkill: jest.fn(),
  deleteUserCustomSkill: jest.fn(),
  searchUserCustomSkills: jest.fn(async () => []),
  getPendingSkillSuggestions: jest.fn(async () => []),
  updateSkillSuggestionStatus: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: jest.fn(async (userId: string) => ({
    success: true,
    data: {
      userId,
      score: 4.85,
      totalRatings: 12,
      averageRating: 4.9,
      ratings: [],
    },
  })),
  getWorkHistory: jest.fn(async () => ({
    success: true,
    data: [
      {
        contractId: 'c-1',
        projectId: 'p-1',
        projectTitle: 'DeFi Staking Protocol',
        role: 'freelancer',
        completedAt: '2026-01-01T00:00:00Z',
        rating: 5,
        ratingComment: 'Super fast delivery!',
      },
    ],
  })),
  submitRating: jest.fn(),
  canUserRate: jest.fn(async () => ({ success: true, data: { canRate: true } })),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-aggregation-service.ts'), () => ({
  getReputationLeaderboard: jest.fn(async () => ({ success: true, data: [] })),
  getAggregatedScore: jest.fn(async () => ({ success: true, data: { score: 4.85 } })),
  getReputationBreakdown: jest.fn(async () => ({ success: true, data: {} })),
  getReputationHistory: jest.fn(async () => ({ success: true, data: [] })),
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
  // Real validation schemas + validate; only the ID helpers are mocked.
  const real = await import('../../middleware/validation-core.js');
  return {
    ...real,
    validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    validateAppwriteDocumentId: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    isValidUUID: jest.fn(() => true),
    isValidAppwriteDocumentId: jest.fn(() => true),
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
  it('loads core endpoints under concurrent flood', async () => {
    const expressMod = (await import('express')).default;
    const projectRouter = (await import('../../routes/project-routes.js')).default;
    const proposalRouter = (await import('../../routes/proposal-routes.js')).default;
    const skillRouter = (await import('../../routes/skill-routes.js')).default;
    const reputationRouter = (await import('../../routes/reputation-routes.js')).default;

    const app = expressMod();
    app.use(expressMod.json());
    app.use('/api/projects', projectRouter);
    app.use('/api/proposals', proposalRouter);
    app.use('/api/skills', skillRouter);
    app.use('/api/reputation', reputationRouter);
    app.use((err: any, _req: any, res: any, _next: any) => {
      console.log('[route error]', err?.message);
      res.status(500).json({ error: { message: err?.message } });
    });

    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

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

    async function runFlood(
      method: 'GET' | 'POST',
      pathName: string,
      body: unknown,
      concurrency: number,
      total: number,
      expectedStatus: number
    ) {
      // Warm-up
      const warmReq = method === 'POST'
        ? request(server).post(pathName).send(body)
        : request(server).get(pathName);
      const warm = await warmReq;
      if (warm.status !== expectedStatus) {
        throw new Error(`warm-up ${method} ${pathName} returned ${warm.status}: ${JSON.stringify(warm.body).slice(0, 200)}`);
      }

      const latencies: number[] = [];
      let index = 0;
      let failures = 0;
      const worker = async () => {
        while (true) {
          const i = index++;
          if (i >= total) return;
          const start = performance.now();
          const res = method === 'POST'
            ? await request(server).post(pathName).send(body)
            : await request(server).get(pathName);
          latencies.push(performance.now() - start);
          if (res.status !== expectedStatus) failures++;
        }
      };
      const startAll = performance.now();
      await Promise.all(Array.from({ length: concurrency }, worker));
      const elapsedSec = (performance.now() - startAll) / 1000;

      latencies.sort((a, b) => a - b);
      const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
      return {
        method,
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
      await runFlood('POST', '/api/projects', projectBody, 25, 1000, 201),
      await runFlood('GET', '/api/projects', null, 25, 1000, 200),
      await runFlood('POST', '/api/proposals', proposalBody, 25, 1000, 201),
      await runFlood('GET', '/api/skills', null, 25, 1000, 200),
      await runFlood('GET', '/api/reputation/bench-user', null, 25, 1000, 200),
      await runFlood('GET', '/api/reputation/bench-user/history', null, 25, 1000, 200),
    ];

    server.close();

    const report = {
      note: 'Framework-overhead baseline: Express router + auth middleware + validation schemas + serialization. Appwrite/Redis/blockchain I/O mocked to measure pure request processing overhead.',
      results,
    };
    writeFileSync('benchmark-results.json', JSON.stringify(report, null, 2));
    console.log('\n===== COMPREHENSIVE LATENCY BASELINE =====');
    for (const r of results) {
      console.log(`${r.method.padEnd(4)} ${r.path.padEnd(32)}: ${r.requests} req @ c=${r.concurrency} | ${r.rps.toFixed(0).padStart(4)} rps | p50 ${r.p50Ms.padStart(5)}ms | p95 ${r.p95Ms.padStart(5)}ms | p99 ${r.p99Ms.padStart(5)}ms | max ${r.maxMs.padStart(6)}ms | errors ${r.errors}`);
    }
    console.log('===== END =====');

    expect(mockCreateProject).toHaveBeenCalled();
    for (const res of results) {
      expect(res.requests).toBe(1000);
      expect(res.errors).toBe(0);
    }
  }, 120000);
});
