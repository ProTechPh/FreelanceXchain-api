// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ─── Middleware mocks (real routes run against them) ────────────────────────
const mockAuth = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuth,
  requireAuthentication: jest.fn((_req: any, _res: any, next: any) => next()),
  requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// ─── Repository mocks (the only layer mocked below the services) ───────────
const mockSavedSearchRepository = {
  create: jest.fn<any>(),
  findByUser: jest.fn<any>(),
  findOwnerById: jest.fn<any>(),
  getById: jest.fn<any>(),
  update: jest.fn<any>(),
  delete: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/saved-search-repository.ts'), () => ({
  savedSearchRepository: mockSavedSearchRepository,
}));

const mockFreelancerProfileRepository = {
  getAllProfilesPaginated: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

const mockProjectRepository = {
  getAllOpenProjects: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockSkillRepository = {
  findSkillsByIds: jest.fn<any>(),
  findSkillsByIdsStrict: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/skill-repository.ts'), () => ({
  skillRepository: mockSkillRepository,
}));

// The REAL routes + REAL services (saved-search-service, search-service
// resolver) — only the persistence and middleware layers are mocked.
const savedSearchRouter = (await import('../../routes/saved-search-routes.js')).default;

describe('Saved search with skill IDs — end to end (routes → services → matcher)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSkillRepository.findSkillsByIdsStrict.mockResolvedValue([]);
    app = express();
    app.use(express.json());
    app.use('/api/saved-searches', savedSearchRouter);
  });

  it('creates a freelancer saved search with skill IDs and executes it to matching profiles', async () => {
    const storedSearch = {
      id: 'search-1',
      user_id: 'user-1',
      name: 'React devs',
      search_type: 'freelancer',
      filters: JSON.stringify({ skills: ['skill-1', 'skill-2'] }),
      notify_on_new: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    // POST /api/saved-searches — the service persists whatever the body carries,
    // including skill IDs (the same filter format the live search API accepts).
    mockSavedSearchRepository.create.mockResolvedValueOnce(storedSearch);

    const createRes = await request(app)
      .post('/api/saved-searches')
      .send({
        name: 'React devs',
        searchType: 'freelancer',
        filters: { skills: ['skill-1', 'skill-2'] },
        notifyOnNew: true,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe('search-1');
    expect(createRes.body.filters).toEqual({ skills: ['skill-1', 'skill-2'] });
    expect(mockSavedSearchRepository.create).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'React devs',
      search_type: 'freelancer',
      filters: JSON.stringify({ skills: ['skill-1', 'skill-2'] }),
      notify_on_new: true,
    });

    // POST /api/saved-searches/:id/execute — the stored search is loaded, the
    // skill IDs are resolved to names via the taxonomy, and profiles (which
    // store skills by name) are matched. Without resolution this would match
    // nothing.
    mockSavedSearchRepository.getById.mockResolvedValueOnce(storedSearch);
    mockSkillRepository.findSkillsByIdsStrict.mockResolvedValueOnce([
      { id: 'skill-1', name: 'react' },
      { id: 'skill-2', name: 'node' },
    ]);
    mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
      items: [
        {
          id: 'fp-1', name: 'Jane', hourly_rate: 50,
          skills: [{ name: 'react', years_of_experience: 3 }],
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'fp-2', name: 'Bob', hourly_rate: 60,
          skills: [{ name: 'python', years_of_experience: 5 }],
          created_at: '2025-01-03T00:00:00Z',
        },
      ],
      total: 2,
      hasMore: false,
    });

    const execRes = await request(app).post('/api/saved-searches/search-1/execute');

    expect(execRes.status).toBe(200);
    expect(execRes.body.count).toBe(1);
    expect(execRes.body.results[0].id).toBe('fp-1');
    expect(mockSkillRepository.findSkillsByIdsStrict).toHaveBeenCalledWith(['skill-1', 'skill-2']);
  });

  it('creates a project saved search with skill IDs and executes it to matching projects', async () => {
    const storedSearch = {
      id: 'search-2',
      user_id: 'user-1',
      name: 'React projects',
      search_type: 'project',
      filters: JSON.stringify({ skills: ['skill-1'] }),
      notify_on_new: false,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    mockSavedSearchRepository.create.mockResolvedValueOnce(storedSearch);

    const createRes = await request(app)
      .post('/api/saved-searches')
      .send({
        name: 'React projects',
        searchType: 'project',
        filters: { skills: ['skill-1'] },
        notifyOnNew: false,
      });

    expect(createRes.status).toBe(201);
    expect(mockSavedSearchRepository.create).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'React projects',
      search_type: 'project',
      filters: JSON.stringify({ skills: ['skill-1'] }),
      notify_on_new: false,
    });

    // Projects carry both skill_id and skill_name on each required-skill ref,
    // so the matcher accepts the ID directly — no taxonomy round-trip needed.
    mockSavedSearchRepository.getById.mockResolvedValueOnce(storedSearch);
    mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
      items: [
        {
          id: 'proj-1', title: 'React Dashboard', description: 'Build a dashboard', budget: 300,
          required_skills: [{ skill_id: 'skill-1', skill_name: 'react' }],
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          id: 'proj-2', title: 'Vue Storefront', description: 'Build a storefront', budget: 400,
          required_skills: [{ skill_id: 'skill-2', skill_name: 'vue' }],
          created_at: '2025-01-03T00:00:00Z',
        },
      ],
      total: 2,
      hasMore: false,
    });

    const execRes = await request(app).post('/api/saved-searches/search-2/execute');

    expect(execRes.status).toBe(200);
    expect(execRes.body.count).toBe(1);
    expect(execRes.body.results[0].id).toBe('proj-1');
  });
});
