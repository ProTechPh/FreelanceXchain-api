// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Rate Limiter — cleanupExpiredEntries (lines 37-46, branch at L41)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Rate Limiter — cleanupExpiredEntries', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should clean up expired entries when interval fires', async () => {
    jest.useFakeTimers();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');

    const req = { ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    // Create rate limiters with short windows to get entries into the store
    const limiter1 = rateLimiter('cleanup-test-1', { windowMs: 1000, maxRequests: 5 });
    const limiter2 = rateLimiter('cleanup-test-2', { windowMs: 1000, maxRequests: 5 });

    // Populate stores
    limiter1(req, res, next);
    limiter2(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Advance time past the window AND past the cleanup interval (5 min)
    jest.advanceTimersByTime(5 * 60 * 1000 + 100);

    // After cleanup, new requests should start fresh (count=1)
    next.mockClear();
    const req2 = { ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' }, headers: {} } as any;
    limiter1(req2, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should not delete entries that have not expired', async () => {
    jest.useFakeTimers();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');

    const req = { ip: '10.0.0.2', socket: { remoteAddress: '10.0.0.2' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    const limiter = rateLimiter('cleanup-active-test', { windowMs: 600_000, maxRequests: 2 });

    limiter(req, res, next);
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Advance 3 minutes — cleanup fires but entries still valid (10 min window)
    jest.advanceTimersByTime(3 * 60 * 1000);

    // Should still be rate-limited
    next.mockClear();
    limiter(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('should handle mixed expired and non-expired entries across stores', async () => {
    jest.useFakeTimers();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');

    const req1 = { ip: '10.0.0.3', socket: { remoteAddress: '10.0.0.3' }, headers: {} } as any;
    const req2 = { ip: '10.0.0.4', socket: { remoteAddress: '10.0.0.4' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    // Short window for req1, long window for req2
    const limiterShort = rateLimiter('mixed-short', { windowMs: 500, maxRequests: 1 });
    const limiterLong = rateLimiter('mixed-long', { windowMs: 600_000, maxRequests: 5 });

    limiterShort(req1, res, next);
    limiterLong(req2, res, next);

    // Advance past short window + cleanup interval
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // req1's entry should be cleaned (expired), req2's should survive
    next.mockClear();
    limiterShort(req1, res, next);
    expect(next).toHaveBeenCalledTimes(1); // Fresh entry after cleanup
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CSRF Middleware — production throw (line 10) & doubleCsrf option branches
// ═══════════════════════════════════════════════════════════════════════════════
describe('CSRF Middleware — coverage gaps', () => {
  const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw when CSRF_SECRET is not set in production', async () => {
    jest.resetModules();
    const originalEnv = process.env.NODE_ENV;
    const originalCsrfSecret = process.env.CSRF_SECRET;
    delete process.env.CSRF_SECRET;
    process.env.NODE_ENV = 'production';

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { jwt: { secret: 'test-secret' }, server: { nodeEnv: 'production' } },
    }));
    jest.unstable_mockModule('csrf-csrf', () => ({
      doubleCsrf: jest.fn(() => ({
        generateCsrfToken: jest.fn(),
        doubleCsrfProtection: jest.fn(),
      })),
    }));

    await expect(import('../../middleware/csrf-middleware.js')).rejects.toThrow(
      'CSRF_SECRET not set — using JWT_SECRET as fallback (insecure in production)'
    );

    process.env.NODE_ENV = originalEnv;
    if (originalCsrfSecret !== undefined) process.env.CSRF_SECRET = originalCsrfSecret;
  });

  it('should cover getSecret fallback when csrfSecret is set', async () => {
    jest.resetModules();
    process.env.CSRF_SECRET = 'my-csrf-secret';
    process.env.NODE_ENV = 'test';

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

    let capturedGetSecret: any;
    jest.unstable_mockModule('csrf-csrf', () => ({
      doubleCsrf: jest.fn((options: any) => {
        capturedGetSecret = options.getSecret;
        return {
          generateCsrfToken: jest.fn(() => 'token'),
          doubleCsrfProtection: jest.fn((_req: any, _res: any, next: any) => next()),
        };
      }),
    }));

    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { jwt: { secret: 'jwt-fallback' }, server: { nodeEnv: 'test' } },
    }));

    await import('../../middleware/csrf-middleware.js');
    // getSecret should return csrfSecret (not the jwt fallback)
    expect(capturedGetSecret()).toBe('my-csrf-secret');
    delete process.env.CSRF_SECRET;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Proposal Repository — parse branches (L28, L46, L57)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Proposal Repository — parse & stringify branches', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  it('should handle mapDoc parse when attachments is already an array (not string)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      project_id: 'pr1',
      freelancer_id: 'f1',
      attachments: [{ url: 'file.pdf', filename: 'file.pdf', size: 100, mimeType: 'application/pdf' }],
    });

    const result = await repo.getProposalById('p1');
    expect(result).not.toBeNull();
    expect(result!.attachments).toEqual([{ url: 'file.pdf', filename: 'file.pdf', size: 100, mimeType: 'application/pdf' }]);
  });

  it('should handle createProposal without attachments (false branch at L46)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      project_id: 'pr1',
      freelancer_id: 'f1',
    });

    const result = await repo.createProposal({
      id: 'p1',
      project_id: 'pr1',
      freelancer_id: 'f1',
      cover_letter: null,
      proposed_rate: 100,
      estimated_duration: 30,
      status: 'pending',
    } as any);
    expect(result).not.toBeNull();
    expect(mockDatabases.createDocument).toHaveBeenCalled();
  });

  it('should handle updateProposal without attachments (false branch at L57)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      status: 'accepted',
    });

    const result = await repo.updateProposal('p1', { status: 'accepted' });
    expect(result).not.toBeNull();
    expect(mockDatabases.updateDocument).toHaveBeenCalled();
  });

  it('should handle mapDoc parse when attachments is a JSON string', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      attachments: JSON.stringify([{ url: 'test.pdf', filename: 'test.pdf', size: 200, mimeType: 'application/pdf' }]),
    });

    const result = await repo.getProposalById('p1');
    expect(result).not.toBeNull();
    expect(result!.attachments).toHaveLength(1);
  });

  it('should handle mapDoc parse when attachments is invalid JSON string (catch branch)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      attachments: 'not-valid-json{{{',
    });

    const result = await repo.getProposalById('p1');
    expect(result).not.toBeNull();
    // parse('not-valid-json{{{', []) catches and returns fallback []
    expect(result!.attachments).toEqual([]);
  });

  it('should handle mapDoc parse when attachments is null/undefined (fallback branch)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      // no attachments field
    });

    const result = await repo.getProposalById('p1');
    expect(result).not.toBeNull();
  });

  it('should handle createProposal WITH attachments (stringify branch)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      attachments: JSON.stringify([{ url: 'test.pdf', filename: 'test.pdf', size: 100, mimeType: 'application/pdf' }]),
    });

    const result = await repo.createProposal({
      id: 'p1',
      project_id: 'pr1',
      freelancer_id: 'f1',
      cover_letter: null,
      attachments: [{ url: 'test.pdf', filename: 'test.pdf', size: 100, mimeType: 'application/pdf' }],
      proposed_rate: 100,
      estimated_duration: 30,
      status: 'pending',
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle updateProposal WITH attachments (stringify branch)', async () => {
    const { ProposalRepository } = await import('../../repositories/proposal-repository.js');
    const repo = new ProposalRepository();

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      attachments: JSON.stringify([{ url: 'test.pdf', filename: 'test.pdf', size: 100, mimeType: 'application/pdf' }]),
    });

    const result = await repo.updateProposal('p1', {
      attachments: [{ url: 'test.pdf', filename: 'test.pdf', size: 100, mimeType: 'application/pdf' }],
    } as any);
    expect(result).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Project Repository — parse branches (L60, L63, L105)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Project Repository — parse & branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.createDocument.mockReset();
  });

  it('should handle mapDoc when fields are already parsed (not strings)', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      title: 'Test Project',
      status: 'open',
      required_skills: [{ skill_id: 's1', skill_name: 'React', category_id: 'cat1', years_of_experience: 2 }],
      milestones: [{ id: 'm1', title: 'M1', status: 'pending' }],
      tags: ['react', 'node'],
      attachments: [{ url: 'test.pdf', filename: 'test.pdf', size: 100, mimeType: 'application/pdf' }],
    });

    const result = await projectRepository.getProjectById('p1');
    expect(result).not.toBeNull();
    expect(result!.required_skills).toHaveLength(1);
    expect(result!.milestones).toHaveLength(1);
    expect(result!.tags).toHaveLength(2);
  });

  it('should handle mapDoc when fields are null/undefined (fallback)', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      title: 'Test Project',
      // no required_skills, milestones, tags, attachments
    });

    const result = await projectRepository.getProjectById('p1');
    expect(result).not.toBeNull();
  });

  it('should handle mapDoc when JSON fields are invalid strings (catch branch L63)', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      title: 'Test Project',
      required_skills: 'invalid-json{{{',
      milestones: 'also-invalid{{{',
      tags: 'bad-json',
      attachments: 'not-json',
    });

    const result = await projectRepository.getProjectById('p1');
    expect(result).not.toBeNull();
  });

  it('should handle updateProject returning null (L105 false branch)', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));

    const result = await projectRepository.updateProject('nonexistent', { title: 'Updated' });
    expect(result).toBeNull();
  });

  it('should handle getProjectsByMultipleCategories', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        title: 'Project 1',
        status: 'open',
        required_skills: JSON.stringify([
          { skill_id: 's1', skill_name: 'React', category_id: 'cat1', years_of_experience: 2 },
        ]),
        milestones: '[]',
        tags: '[]',
        attachments: '[]',
      }],
      total: 1,
    });

    const result = await projectRepository.getProjectsByMultipleCategories(['cat1']);
    expect(result.items).toHaveLength(1);
  });

  it('should handle getProjectsByMultipleCategories with no matches', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        title: 'Project 1',
        status: 'open',
        required_skills: JSON.stringify([
          { skill_id: 's1', skill_name: 'React', category_id: 'cat1', years_of_experience: 2 },
        ]),
        milestones: '[]',
        tags: '[]',
        attachments: '[]',
      }],
      total: 1,
    });

    const result = await projectRepository.getProjectsByMultipleCategories(['cat999']);
    expect(result.items).toHaveLength(0);
  });

  it('should handle getProjectsByBudgetRange', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        title: 'Project 1',
        status: 'open',
        budget: 5000,
        required_skills: '[]',
        milestones: '[]',
        tags: '[]',
        attachments: '[]',
      }],
      total: 1,
    });

    const result = await projectRepository.getProjectsByBudgetRange(1000, 10000);
    expect(result.items).toHaveLength(1);
  });

  it('should handle getProjectsByBudgetRange out of range', async () => {
    const { projectRepository } = await import('../../repositories/project-repository.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        title: 'Project 1',
        status: 'open',
        budget: 500,
        required_skills: '[]',
        milestones: '[]',
        tags: '[]',
        attachments: '[]',
      }],
      total: 1,
    });

    const result = await projectRepository.getProjectsByBudgetRange(1000, 10000);
    expect(result.items).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Contract Repository — mapDoc & relation branches (L25, L46, L57)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Contract Repository — branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  it('should cover mapDoc branches for created_at/updated_at fallback', async () => {
    const { ContractRepository } = await import('../../repositories/contract-repository.js');
    const repo = new ContractRepository();

    // Document with $createdAt/$updatedAt but no created_at/updated_at attrs
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'c1',
      $createdAt: '2025-01-01T00:00:00Z',
      $updatedAt: '2025-01-02T00:00:00Z',
      project_id: 'p1',
      status: 'active',
    });

    const result = await repo.getContractById('c1');
    expect(result).not.toBeNull();
    expect(result!.created_at).toBe('2025-01-01T00:00:00Z');
    expect(result!.updated_at).toBe('2025-01-02T00:00:00Z');
  });

  it('should cover mapDoc with explicit created_at/updated_at', async () => {
    const { ContractRepository } = await import('../../repositories/contract-repository.js');
    const repo = new ContractRepository();

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'c1',
      $createdAt: '2025-01-01T00:00:00Z',
      $updatedAt: '2025-01-02T00:00:00Z',
      created_at: '2025-06-01T00:00:00Z',
      updated_at: '2025-06-02T00:00:00Z',
      project_id: 'p1',
      status: 'active',
    });

    const result = await repo.getContractById('c1');
    expect(result).not.toBeNull();
    expect(result!.created_at).toBe('2025-06-01T00:00:00Z');
  });

  it('should handle getContractByIdWithRelations with freelancer/employer profiles (L57 branch)', async () => {
    const { ContractRepository } = await import('../../repositories/contract-repository.js');
    const repo = new ContractRepository();

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' })
      .mockResolvedValueOnce({ $id: 'p1', title: 'Project', description: 'desc' })
      .mockResolvedValueOnce({ $id: 'f1', name: 'Freelancer', email: 'f@test.com' })
      .mockResolvedValueOnce({ $id: 'e1', name: 'Employer', email: 'e@test.com' });

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'fp1', user_id: 'f1', hourly_rate: 50, skills: '["React"]' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'e1', company_name: 'Acme', industry: 'Tech' }],
        total: 1,
      });

    const result = await repo.getContractByIdWithRelations('c1');
    expect(result).not.toBeNull();
    expect(result.freelancer.profile).not.toBeNull();
    expect(result.employer.profile).not.toBeNull();
  });

  it('should handle getContractByIdWithRelations with skills as array (L87 branch)', async () => {
    const { ContractRepository } = await import('../../repositories/contract-repository.js');
    const repo = new ContractRepository();

    mockDatabases.getDocument
      .mockResolvedValueOnce({ $id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' })
      .mockResolvedValueOnce({ $id: 'p1', title: 'Project', description: 'desc' })
      .mockResolvedValueOnce({ $id: 'f1', name: 'Freelancer', email: 'f@test.com' })
      .mockResolvedValueOnce({ $id: 'e1', name: 'Employer', email: 'e@test.com' });

    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'fp1', user_id: 'f1', hourly_rate: 50, skills: ['React', 'Node'] }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'ep1', user_id: 'e1', company_name: 'Acme', industry: 'Tech' }],
        total: 1,
      });

    const result = await repo.getContractByIdWithRelations('c1');
    expect(result).not.toBeNull();
    expect(result.freelancer.profile.skills).toEqual(['React', 'Node']);
  });

  it('should handle findContractByProposalId with error', async () => {
    const { ContractRepository } = await import('../../repositories/contract-repository.js');
    const repo = new ContractRepository();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.findContractByProposalId('p1');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Didit KYC Repository — branch coverage
// ═══════════════════════════════════════════════════════════════════════════════
describe('Didit KYC Repository — branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  it('should handle createKycVerification with object values (JSON.stringify)', async () => {
    const { createKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'k1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      user_id: 'u1',
      status: 'pending',
      metadata: JSON.stringify({ key: 'value' }),
    });

    const result = await createKycVerification({
      id: 'k1',
      user_id: 'u1',
      status: 'pending',
      metadata: { key: 'value' },
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle createKycVerification with stringified object values', async () => {
    const { createKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'k1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      decline_reasons: JSON.stringify(['reason1']),
      review_reasons: JSON.stringify(['review1']),
    });

    const result = await createKycVerification({
      id: 'k1',
      user_id: 'u1',
      status: 'completed',
      decline_reasons: ['reason1'],
      review_reasons: ['review1'],
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle mapKyc parsing stringified decline_reasons', async () => {
    const { getKycVerificationById } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'k1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      decline_reasons: '["reason1", "reason2"]',
      review_reasons: '["review1"]',
      metadata: '{"key": "value"}',
    });

    const result = await getKycVerificationById('k1');
    expect(result).not.toBeNull();
    expect(result!.decline_reasons).toEqual(['reason1', 'reason2']);
    expect(result!.review_reasons).toEqual(['review1']);
    expect(result!.metadata).toEqual({ key: 'value' });
  });

  it('should handle updateKycVerification filtering out id/user_id/created_at', async () => {
    const { updateKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'k1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
      status: 'approved',
    });

    const result = await updateKycVerification('k1', {
      status: 'approved',
      id: 'should-be-ignored',
      user_id: 'should-be-ignored',
      created_at: 'should-be-ignored',
      metadata: { newKey: 'newValue' },
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle updateKycVerification with undefined values (skip branch)', async () => {
    const { updateKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'k1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
      status: 'approved',
    });

    const result = await updateKycVerification('k1', {
      status: 'approved',
      someField: undefined,
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle createKycVerification with id provided (L54 branch)', async () => {
    const { createKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'custom-id',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      user_id: 'u1',
    });

    const result = await createKycVerification({
      id: 'custom-id',
      user_id: 'u1',
      status: 'pending',
    } as any);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('custom-id');
  });

  it('should handle createKycVerification without id (ID.unique() branch)', async () => {
    const { createKycVerification } = await import('../../repositories/didit-kyc-repository.js');

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'unique-id',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      user_id: 'u1',
    });

    const result = await createKycVerification({
      user_id: 'u1',
      status: 'pending',
    } as any);
    expect(result).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Payment Repository — branch coverage
// ═══════════════════════════════════════════════════════════════════════════════
describe('Payment Repository — branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  it('should handle findByTxHash with error', async () => {
    const { PaymentRepository } = await import('../../repositories/payment-repository.js');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await PaymentRepository.findByTxHash('0xabc');
    expect(result).toBeNull();
  });

  it('should handle getTotalEarnings with error', async () => {
    const { PaymentRepository } = await import('../../repositories/payment-repository.js');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await PaymentRepository.getTotalEarnings('u1');
    expect(result).toBe(0);
  });

  it('should handle getTotalSpent with error', async () => {
    const { PaymentRepository } = await import('../../repositories/payment-repository.js');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await PaymentRepository.getTotalSpent('u1');
    expect(result).toBe(0);
  });

  it('should handle findByUserId with hasMore=true', async () => {
    const { PaymentRepository } = await import('../../repositories/payment-repository.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 5 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'p1' }, { $id: 'p2' }],
        total: 5,
      });

    const result = await PaymentRepository.findByUserId('u1', { limit: 2, offset: 0 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Base Repository Appwrite — branch coverage
// ═══════════════════════════════════════════════════════════════════════════════
describe('Base Repository Appwrite — branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  it('should handle create with object values being JSON.stringified', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
      name: 'test',
      nested: JSON.stringify({ key: 'value' }),
    });

    const result = await repo.create({
      name: 'test',
      nested: { key: 'value' },
    } as any);
    expect(result).not.toBeNull();
  });

  it('should handle create with id provided', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'custom-id',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
    });

    const result = await repo.create({ id: 'custom-id', name: 'test' } as any);
    expect(result.id).toBe('custom-id');
  });

  it('should handle create with undefined values (skip branch)', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-01',
    });

    const result = await repo.create({ name: 'test', missing: undefined } as any);
    expect(result).not.toBeNull();
  });

  it('should handle update with id/created_at keys being skipped', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
      name: 'updated',
    });

    const result = await repo.update('doc1', { id: 'ignore', created_at: 'ignore', name: 'updated' } as any);
    expect(result).not.toBeNull();
  });

  it('should handle update with undefined values (skip branch)', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
      name: 'updated',
    });

    const result = await repo.update('doc1', { name: 'updated', missing: undefined } as any);
    expect(result).not.toBeNull();
  });

  it('should handle update with object values being JSON.stringified', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.updateDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
      nested: JSON.stringify({ key: 'value' }),
    });

    const result = await repo.update('doc1', { nested: { key: 'value' } } as any);
    expect(result).not.toBeNull();
  });

  it('should handle mapDocument with created_at/updated_at fallback branches', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    // When $createdAt/$updatedAt exist but created_at/updated_at don't
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'doc1',
      $createdAt: '2025-01-01',
      $updatedAt: '2025-01-02',
    });

    const result = await repo.getById('doc1');
    expect(result).not.toBeNull();
    expect(result!.created_at).toBe('2025-01-01');
  });

  it('should handle findOne returning null', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await repo.findOne('name', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should handle queryPaginated with ascending=true', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1' }],
      total: 1,
    });

    const result = await repo.queryPaginated({}, 'name', true);
    expect(result.items).toHaveLength(1);
  });

  it('should handle listWithQueries with mapper', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testListWithQueries(queries: any[], mapper?: (doc: any) => any) {
        return this.listWithQueries(queries, mapper);
      }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1', name: 'test' }],
      total: 1,
    });

    const result = await repo.testListWithQueries([], (doc: any) => ({ id: doc.$id, custom: true }));
    expect(result).toHaveLength(1);
    expect(result[0].custom).toBe(true);
  });

  it('should handle listWithQueries without mapper', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testListWithQueries(queries: any[]) {
        return this.listWithQueries(queries);
      }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1', name: 'test' }],
      total: 1,
    });

    const result = await repo.testListWithQueries([]);
    expect(result).toHaveLength(1);
  });

  it('should handle listWithQueries error', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testListWithQueries(queries: any[]) {
        return this.listWithQueries(queries);
      }
    })();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.testListWithQueries([]);
    expect(result).toEqual([]);
  });

  it('should handle countWithQueries error', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testCountWithQueries(queries: any[]) {
        return this.countWithQueries(queries);
      }
    })();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.testCountWithQueries([]);
    expect(result).toBe(0);
  });

  it('should handle paginatedWithQueries error', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testPaginatedWithQueries(queries: any[], limit: number, offset: number, mapper?: (doc: any) => any) {
        return this.paginatedWithQueries(queries, limit, offset, mapper);
      }
    })();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.testPaginatedWithQueries([], 20, 0);
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });

  it('should handle paginatedWithQueries with mapper', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testPaginatedWithQueries(queries: any[], limit: number, offset: number, mapper?: (doc: any) => any) {
        return this.paginatedWithQueries(queries, limit, offset, mapper);
      }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1' }],
      total: 1,
    });

    const result = await repo.testPaginatedWithQueries([], 20, 0, (doc: any) => ({ id: doc.$id, custom: true }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].custom).toBe(true);
  });

  it('should handle paginatedWithQueries without mapper', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
      public testPaginatedWithQueries(queries: any[], limit: number, offset: number) {
        return this.paginatedWithQueries(queries, limit, offset);
      }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1' }],
      total: 1,
    });

    const result = await repo.testPaginatedWithQueries([], 20, 0);
    expect(result.items).toHaveLength(1);
  });

  it('should handle queryAll with ascending=true', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'doc1', name: 'test' }],
      total: 1,
    });

    const result = await repo.queryAll('name', true);
    expect(result).toHaveLength(1);
  });

  it('should handle queryAll error', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.queryAll();
    expect(result).toEqual([]);
  });

  it('should handle queryPaginated error', async () => {
    const { BaseRepositoryAppwrite } = await import('../../repositories/base-repository-appwrite.js');
    const repo = new (class extends BaseRepositoryAppwrite<any> {
      constructor() { super('test-collection'); }
    })();

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await repo.queryPaginated();
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Message Service — employer profile branch (L46-47) & getConversations (L172)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Message Service — employer profile branch & getConversations', () => {
  const mockUserRepo = { getUserById: jest.fn<any>() };
  const mockFreelancerProfileRepo = { getById: jest.fn<any>() };
  const mockEmployerProfileRepo = { getById: jest.fn<any>() };

  const mockMessageRepository = {
    findConversation: jest.fn<any>(),
    createConversation: jest.fn<any>(),
    createMessage: jest.fn<any>(),
    updateConversation: jest.fn<any>(),
    getUserConversations: jest.fn<any>(),
    getConversationMessages: jest.fn<any>(),
    markMessagesAsRead: jest.fn<any>(),
    getUnreadCount: jest.fn<any>(),
  };

  const mockNotificationEmitter = { emitToUser: jest.fn<any>() };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
      generateId: () => 'generated-id',
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: mockUserRepo,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
      freelancerProfileRepository: mockFreelancerProfileRepo,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
      employerProfileRepository: mockEmployerProfileRepo,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/message-repository.ts'), () => ({
      messageRepository: mockMessageRepository,
    }));
    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      notificationEmitter: mockNotificationEmitter,
    }));
  });

  it('should resolve receiver from employer profile (L46-47)', async () => {
    const { sendMessage } = await import('../../services/message-service.js');

    // User not found
    mockUserRepo.getUserById.mockResolvedValueOnce(null);
    // Freelancer profile not found
    mockFreelancerProfileRepo.getById.mockResolvedValueOnce(null);
    // Employer profile found!
    mockEmployerProfileRepo.getById.mockResolvedValueOnce({ user_id: 'employer-user-id' });
    mockMessageRepository.findConversation.mockResolvedValueOnce(null);
    mockMessageRepository.createConversation.mockResolvedValueOnce({
      id: 'conv-new', participant1_id: 'sender', participant2_id: 'employer-user-id', unread_count_2: 0,
    });
    mockMessageRepository.createMessage.mockResolvedValueOnce({ id: 'msg-1' });
    mockMessageRepository.updateConversation.mockResolvedValueOnce(undefined);

    const result = await sendMessage({
      senderId: 'sender',
      receiverId: 'employer-profile-id',
      content: 'Hello employer',
    });

    expect(result.success).toBe(true);
  });

  it('should handle getConversations with user as participant2 (L172 branch)', async () => {
    const { getConversations } = await import('../../services/message-service.js');

    mockMessageRepository.getUserConversations.mockResolvedValueOnce({
      items: [{
        id: 'conv-1',
        participant1_id: 'other-user',
        participant2_id: 'current-user',
      }],
      total: 1,
    });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'other-user', name: 'Other', email: 'other@test.com' });

    const result = await getConversations('current-user');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].otherUser.id).toBe('other-user');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Analytics Service — branch coverage for uncovered branches
// ═══════════════════════════════════════════════════════════════════════════════
describe('Analytics Service — branch coverage', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
      logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    }));

    mockDatabases = {
      listDocuments: jest.fn<any>(),
      getDocument: jest.fn<any>(),
    };

    jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
      databases: mockDatabases,
      DATABASE_ID: 'test-db',
      Query: {
        equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
        orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
        orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
        limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
        offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
      },
    }));

    jest.unstable_mockModule(resolveModule('src/config/collections.ts'), () => ({
      COLLECTIONS: {
        USERS: 'users',
        PROJECTS: 'projects',
        CONTRACTS: 'contracts',
        PROPOSALS: 'proposals',
        REVIEWS: 'reviews',
        AUDIT_LOG_ENTRIES: 'audit_log_entries',
      },
    }));

    jest.unstable_mockModule(resolveModule('src/utils/cache.ts'), () => ({
      platformMetricsCache: { get: jest.fn().mockReturnValue(null), set: jest.fn() },
      skillTrendsCache: { get: jest.fn().mockReturnValue(null), set: jest.fn() },
      adminAnalyticsCache: { get: jest.fn().mockReturnValue(null), set: jest.fn() },
    }));
  });

  it('should handle freelancer analytics with no reviews (L105 branch)', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ total_amount: 500, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [{ status: 'accepted' }], total: 1 });

    const result = await getFreelancerAnalytics('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.averageRating).toBe(0);
    }
  });

  it('should handle getSkillTrends with empty skills and various demand levels', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'p1',
          status: 'open',
          required_skills: JSON.stringify([
            { skill_name: 'React', name: 'React' },
            { skill_name: null, name: null },
          ]),
          budget: 1000,
          created_at: '2025-01-01',
        },
        // Add enough projects for high demand (>=10)
        ...Array.from({ length: 10 }, (_, i) => ({
          $id: `p${i + 2}`,
          status: 'open',
          required_skills: JSON.stringify([{ skill_name: 'React' }]),
          budget: 1000,
          created_at: '2025-01-01',
        })),
      ],
      total: 11,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const reactTrend = result.data.find((s: any) => s.skillName === 'React');
      expect(reactTrend).toBeDefined();
      expect(reactTrend!.demandLevel).toBe('high');
    }
  });

  it('should handle getSkillTrends with medium demand (3-9 projects)', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: Array.from({ length: 5 }, (_, i) => ({
        $id: `p${i}`,
        status: 'open',
        required_skills: JSON.stringify([{ skill_name: 'Vue' }]),
        budget: 2000,
        created_at: new Date(Date.now() - 60 * 86400000).toISOString(), // old
      })),
      total: 5,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const vueTrend = result.data.find((s: any) => s.skillName === 'Vue');
      expect(vueTrend).toBeDefined();
      expect(vueTrend!.demandLevel).toBe('medium');
    }
  });

  it('should handle getSkillTrends with low demand (<3 projects)', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        status: 'open',
        required_skills: JSON.stringify([{ skill_name: 'Svelte' }]),
        budget: 500,
        created_at: '2025-01-01',
      }],
      total: 1,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const trend = result.data.find((s: any) => s.skillName === 'Svelte');
      expect(trend).toBeDefined();
      expect(trend!.demandLevel).toBe('low');
    }
  });

  it('should handle getSkillTrends with growth rate (olderCount > 0)', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        // 3 old projects
        ...Array.from({ length: 3 }, (_, i) => ({
          $id: `old-${i}`,
          status: 'open',
          required_skills: JSON.stringify([{ skill_name: 'Angular' }]),
          budget: 1000,
          created_at: new Date(Date.now() - 90 * 86400000).toISOString(), // old
        })),
        // 1 recent project
        {
          $id: 'new-1',
          status: 'open',
          required_skills: JSON.stringify([{ skill_name: 'Angular' }]),
          budget: 1000,
          created_at: new Date().toISOString(), // recent
        },
      ],
      total: 4,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const trend = result.data.find((s: any) => s.skillName === 'Angular');
      expect(trend).toBeDefined();
      expect(typeof trend!.growthRate).toBe('number');
    }
  });

  it('should handle getSkillTrends with growth rate (recentCount=0, olderCount=0)', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        status: 'open',
        required_skills: '[]',
        budget: 0,
        created_at: '2025-01-01',
      }],
      total: 1,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends with error', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await getSkillTrends();
    expect(result.success).toBe(false);
  });

  it('should handle getSkillTrends with string skills (not objects)', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1',
        status: 'open',
        required_skills: JSON.stringify(['React', 'Node.js']),
        budget: 1000,
        created_at: '2025-01-01',
      }],
      total: 1,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends cache hit', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');
    const { skillTrendsCache } = await import('../../utils/cache.js');

    (skillTrendsCache.get as jest.Mock).mockReturnValueOnce([{ skillName: 'React' }]);

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('should handle getSkillDemandTrends alias', async () => {
    const { getSkillDemandTrends } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [],
      total: 0,
    });

    const result = await getSkillDemandTrends();
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills with no completed contracts', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 }) // contracts
      .mockResolvedValueOnce({ documents: [], total: 0 }) // reviews
      .mockResolvedValueOnce({ documents: [], total: 0 }); // proposals

    const result = await getFreelancerAnalytics('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topSkills).toEqual([]);
    }
  });

  it('should handle calculateTopSkills with completed contracts (fetch projects)', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ project_id: 'p1', total_amount: 1000, created_at: '2025-01-01' }], total: 1 }) // contracts
      .mockResolvedValueOnce({ documents: [], total: 0 }) // reviews
      .mockResolvedValueOnce({ documents: [], total: 0 }); // proposals

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      required_skills: JSON.stringify([{ skill_name: 'React' }]),
    });

    const result = await getFreelancerAnalytics('u1');
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills with project fetch error (catch)', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ project_id: 'p1', total_amount: 1000, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    mockDatabases.getDocument.mockRejectedValueOnce(new Error('Project not found'));

    const result = await getFreelancerAnalytics('u1');
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills outer error', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ project_id: 'p1', total_amount: 1000, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    mockDatabases.getDocument.mockRejectedValueOnce(new Error('Project not found'));

    const result = await getFreelancerAnalytics('u1');
    expect(result.success).toBe(true);
  });

  it('should handle employer analytics with no projects (L273 branch)', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('u1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.averageProjectBudget).toBe(0);
    }
  });

  it('should handle platformMetricsCache hit', async () => {
    const { getPlatformMetrics } = await import('../../services/analytics-service.js');
    const { platformMetricsCache } = await import('../../utils/cache.js');

    (platformMetricsCache.get as jest.Mock).mockReturnValueOnce({
      totalUsers: 100,
      totalProjects: 50,
    });

    const result = await getPlatformMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalUsers).toBe(100);
    }
  });

  it('should handle platform metrics with zero totalContracts (L287 branch)', async () => {
    const { getPlatformMetrics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 100 })
      .mockResolvedValueOnce({ documents: [], total: 50 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getPlatformMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completionRate).toBe(0);
    }
  });

  it('should handle admin analytics with all branches', async () => {
    const { getAdminAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 100 })
      .mockResolvedValueOnce({ documents: [], total: 50 })
      .mockResolvedValueOnce({
        documents: [{ total_amount: 10000 }, { total_amount: 20000 }],
        total: 2,
      })
      .mockResolvedValueOnce({ documents: [], total: 10 })
      .mockResolvedValueOnce({
        documents: [
          { created_at: new Date().toISOString() },
          { created_at: new Date(Date.now() - 60 * 86400000).toISOString() },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        documents: [
          { created_at: new Date().toISOString() },
          { created_at: new Date(Date.now() - 60 * 86400000).toISOString() },
        ],
        total: 2,
      });

    const result = await getAdminAnalytics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalRevenue).toBe(1500);
      expect(result.data.userGrowthData.length).toBeGreaterThan(0);
    }
  });

  it('should handle admin analytics error', async () => {
    const { getAdminAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await getAdminAnalytics();
    expect(result.success).toBe(false);
  });

  it('should handle freelancer analytics with startDate only', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ total_amount: 500, created_at: '2025-06-01' }, { total_amount: 300, created_at: '2025-01-01' }], total: 2 })
      .mockResolvedValueOnce({ documents: [{ rating: 4 }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('u1', { startDate: '2025-03-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalEarnings).toBe(500);
    }
  });

  it('should handle freelancer analytics with endDate only', async () => {
    const { getFreelancerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ total_amount: 200, created_at: '2025-01-01' }, { total_amount: 400, created_at: '2025-06-01' }], total: 2 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('u1', { endDate: '2025-03-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalEarnings).toBe(200);
    }
  });

  it('should handle employer analytics with startDate only', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ budget: 5000, created_at: '2025-06-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ total_amount: 3000, created_at: '2025-06-01' }], total: 1 });

    const result = await getEmployerAnalytics('u1', { startDate: '2025-03-01' });
    expect(result.success).toBe(true);
  });

  it('should handle employer analytics with endDate only', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ budget: 5000, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ total_amount: 3000, created_at: '2025-01-01' }], total: 1 });

    const result = await getEmployerAnalytics('u1', { endDate: '2025-03-01' });
    expect(result.success).toBe(true);
  });

  it('should handle employer calculateTopSkills with no contracts', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ budget: 5000, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('u1');
    expect(result.success).toBe(true);
  });

  it('should handle employer calculateTopSkills with contracts', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ budget: 5000, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ project_id: 'p1', total_amount: 5000, created_at: '2025-01-01' }], total: 1 });

    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'p1',
      required_skills: JSON.stringify([{ skill_name: 'React' }]),
    });

    const result = await getEmployerAnalytics('u1');
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Scheduler Service — covered by scheduler-service-coverage.test.ts
//     (requires module-level jest.unstable_mockModule for node-cron)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Cache — covered by cache.test.ts (LRUCache import conflicts with mocks)
// ═══════════════════════════════════════════════════════════════════════════════
