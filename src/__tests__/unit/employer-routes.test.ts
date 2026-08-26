// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validateAppwriteDocumentId: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
  safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
}));

const router = (await import('../../routes/employer-routes.js')).default;

describe('Employer Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
  });

  describe('GET /projects', () => {
    it('should return employer projects on success', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'Project 1' }], hasMore: false },
      });
      const res = await request(app).get('/api/employers/projects');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/employers/projects');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /profile', () => {
    it('should return employer profile on success', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', userId: 'user-1', companyName: 'Acme' },
      });
      const res = await request(app).get('/api/employers/profile');
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('Acme');
    });

    it('should return 404 when profile not found', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/employers/profile');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /profile', () => {
    it('should update employer profile on success', async () => {
      mockUpdateEmployerProfile.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', companyName: 'New Name', description: 'Updated description here', industry: 'Tech' },
      });
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'New Name', description: 'Updated description here', industry: 'Tech' });
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('New Name');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'A' }); // too short
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when profile not found', async () => {
      mockUpdateEmployerProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'Valid Name' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id', () => {
    it('should return employer profile by user ID', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', userId: 'user-2', companyName: 'Corp' },
      });
      const res = await request(app).get('/api/employers/some-uuid');
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('Corp');
    });

    it('should return 404 when not found', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/employers/some-uuid');
      expect(res.status).toBe(404);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

function makeApp(basePath: string, r: any) {
  const a = express();
  a.use(express.json());
  a.use(basePath, r);
  return a;
}
const employerRouter = router;
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockProjectService = { listProjectsByEmployer: mockListProjectsByEmployer };
const mockEmployerProfileService = {
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
};

describe('employer-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/employers', employerRouter);
  });

  it('GET /projects with continuationToken', async () => {
    mockProjectService.listProjectsByEmployer.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/employers/projects?continuationToken=tok1');
    expect(res.status).toBe(200);
  });

  it('GET /projects with limit', async () => {
    mockProjectService.listProjectsByEmployer.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/employers/projects?limit=5');
    expect(res.status).toBe(200);
  });

  it('GET /projects service error', async () => {
    mockProjectService.listProjectsByEmployer.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/employers/projects');
    expect(res.status).toBe(400);
  });

  it('GET /profile success', async () => {
    mockEmployerProfileService.getEmployerProfileByUserId.mockResolvedValue(ok({ id: 'ep1' }));
    const res = await request(app).get('/api/employers/profile');
    expect(res.status).toBe(200);
  });

  it('GET /profile not found', async () => {
    mockEmployerProfileService.getEmployerProfileByUserId.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/employers/profile');
    expect(res.status).toBe(404);
  });

  it('PATCH /profile success', async () => {
    mockEmployerProfileService.updateEmployerProfile.mockResolvedValue(ok({ id: 'ep1' }));
    const res = await request(app).patch('/api/employers/profile').send({ companyName: 'Acme' });
    expect(res.status).toBe(200);
  });

  it('PATCH /profile validation error', async () => {
    const res = await request(app).patch('/api/employers/profile').send({ companyName: 'a' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile PROFILE_NOT_FOUND returns 404', async () => {
    mockEmployerProfileService.updateEmployerProfile.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/employers/profile').send({ companyName: 'Acme Corp' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile other error returns 400', async () => {
    mockEmployerProfileService.updateEmployerProfile.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).patch('/api/employers/profile').send({ companyName: 'Acme Corp' });
    expect(res.status).toBe(400);
  });

  it('GET /:id success', async () => {
    mockEmployerProfileService.getEmployerProfileByUserId.mockResolvedValue(ok({ id: 'ep1' }));
    const res = await request(app).get('/api/employers/u1');
    expect(res.status).toBe(200);
  });

  it('GET /:id not found', async () => {
    mockEmployerProfileService.getEmployerProfileByUserId.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/employers/u1');
    expect(res.status).toBe(404);
  });
});

describe('employer-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockGetEmployerProfileByUserId = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
      getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
      updateEmployerProfile: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
      listProjectsByEmployer: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/employer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
    jest.clearAllMocks();
  });

  it('L289: GET /:id', async () => {
    mockGetEmployerProfileByUserId.mockResolvedValueOnce({ success: true, data: { id: 'ep1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/employers/user-1');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Description and industry validation tests
// ═══════════════════════════════════════════════════════════════

describe('employer-routes - PATCH /profile description and industry validation', () => {
  let app: any;
  const mockUpdateEmployerProfile = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
      getEmployerProfileByUserId: jest.fn(),
      updateEmployerProfile: mockUpdateEmployerProfile,
    }));
    jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
      listProjectsByEmployer: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/employer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
    jest.clearAllMocks();
  });

  it('should return 400 when description is less than 10 characters', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/employers/profile')
      .send({ description: 'Short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'description' })])
    );
  });

  it('should return 400 when industry is less than 2 characters', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/employers/profile')
      .send({ industry: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'industry' })])
    );
  });

  it('should accept valid description (10+ chars)', async () => {
    mockUpdateEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep1' } });
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/employers/profile')
      .send({ description: 'A valid description here' });
    expect(res.status).toBe(200);
  });

  it('should accept valid industry (2+ chars)', async () => {
    mockUpdateEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep1' } });
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/employers/profile')
      .send({ industry: 'Tech' });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// ?? nullish coalescing fallback branch
// Line: 289
// ═══════════════════════════════════════════════════════════════

describe('employer-routes - GET /:id ?? fallback branch', () => {
  let app: any;
  const mockGetEmployerProfileByUserId = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (req: any, _res: any, next: any) => {
        for (const key of Object.keys(req.params)) delete req.params[key];
        next();
      },
      fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
      validateAppwriteDocumentId: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    }));
    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-request-id',
    }));
    jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
      getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
      updateEmployerProfile: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
      listProjectsByEmployer: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/employer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
    jest.clearAllMocks();
  });

  it('L289: GET /:id uses ?? fallback when id param is undefined', async () => {
    mockGetEmployerProfileByUserId.mockResolvedValueOnce({ success: true, data: { id: 'ep1', companyName: 'Corp' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/employers/user-1');
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe('Corp');
  });
});
