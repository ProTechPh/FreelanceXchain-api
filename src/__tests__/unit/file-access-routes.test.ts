// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockStorage = {
  getFile: jest.fn<any>(),
  getFileDownload: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: mockStorage,
  BUCKETS: {
    DISPUTE_EVIDENCE: 'dispute-evidence',
    MILESTONE_DELIVERABLES: 'milestone-deliverables',
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    KYC_DOCUMENTS: 'kyc-documents',
    PORTFOLIO_IMAGES: 'portfolio-images',
    AVATARS: 'avatars',
    ATTACHMENTS: 'attachments',
    BUSINESS_DOCUMENTS: 'business-documents',
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: { queryAll: jest.fn().mockResolvedValue([]) },
}));
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: { queryAll: jest.fn().mockResolvedValue([]), findProjectById: jest.fn().mockResolvedValue(null) },
}));
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: { queryAll: jest.fn().mockResolvedValue([]) },
}));
const mockContractQueryAll = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: { getContractById: jest.fn().mockResolvedValue(null), getContractsByProject: jest.fn().mockResolvedValue([]), queryAll: mockContractQueryAll },
}));

let mockUser: any = { userId: 'user-1', role: 'user' };

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
  optionalAuthMiddleware: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: () => (_req: any, _res: any, next: any) => next(),
  validateAppwriteDocumentId: () => (_req: any, _res: any, next: any) => next(),
}));

const router = (await import('../../routes/file-access-routes.js')).default;
const app = express();
app.use(express.json());
app.use('/api/files/access', router);

const proposalRepoMock = (await import('../../repositories/proposal-repository.ts')).proposalRepository as any;
const projectRepoMock = (await import('../../repositories/project-repository.ts')).projectRepository as any;
const disputeRepoMock = (await import('../../repositories/dispute-repository.ts')).disputeRepository as any;
const contractRepoMock = (await import('../../repositories/contract-repository.ts')).contractRepository as any;

describe('File Access Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'user-1', role: 'user' };
  });

  describe('GET /api/files/access/:bucket/:fileId', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid bucket', async () => {
      const res = await request(app).get('/api/files/access/invalid-bucket/file-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BUCKET');
    });

    it('returns 403 when user is not owner and not admin', async () => {
      mockStorage.getFile.mockResolvedValueOnce({
        name: 'otheruser_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows access when user is owner', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'user-1_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('hello'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/pdf');
      expect(res.header['content-disposition']).toContain('inline; filename="test.pdf"');
    });

    it('supports download query param', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'user-1_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('hello'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1?download=true');
      expect(res.status).toBe(200);
      expect(res.header['content-disposition']).toContain('attachment; filename="test.pdf"');
    });

    it('allows admin access even if not owner', async () => {
      mockUser = { userId: 'admin-1', role: 'admin' };
      mockStorage.getFile.mockResolvedValue({
        name: 'otheruser_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('admin-data'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(200);
    });

    it('allows any signed-in user to view employer business documents', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'employer-9_uuid_bir-2303.pdf',
        sizeOriginal: 2048,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('pdf-data'));

      const res = await request(app).get('/api/files/access/business-documents/file-1');
      expect(res.status).toBe(200);
    });

    it('rejects anonymous access to employer business documents', async () => {
      mockUser = null;
      const res = await request(app).get('/api/files/access/business-documents/file-1');
      expect(res.status).toBe(401);
    });

    it('allows authenticated users to view portfolio images', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'otheruser_uuid_portfolio.png',
        sizeOriginal: 2048,
        mimeType: 'image/png',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('image-data'));

      const res = await request(app).get('/api/files/access/portfolio-images/file-1');
      expect(res.status).toBe(200);
    });

    it('returns 404 when file is not found', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('File not found (404)'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('returns 500 when storage throws general error', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('Appwrite network failure'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('FILE_STREAM_ERROR');
    });
  });

  describe('GET /api/files/access/:bucket/:fileId/info', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid bucket', async () => {
      const res = await request(app).get('/api/files/access/unknown-bucket/file-1/info');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BUCKET');
    });

    it('returns 403 when access is denied', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'other_uuid_doc.pdf',
        sizeOriginal: 500,
        mimeType: 'application/pdf',
      });

      const res = await request(app).get('/api/files/access/kyc-documents/file-1/info');
      expect(res.status).toBe(403);
    });

    it('returns file info on success', async () => {
      mockStorage.getFile.mockResolvedValue({
        $id: 'file-1',
        name: 'user-1_uuid_doc.pdf',
        sizeOriginal: 500,
        mimeType: 'application/pdf',
        $createdAt: '2026-01-01',
        $updatedAt: '2026-01-02',
      });

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('file-1');
      expect(res.body.name).toBe('doc.pdf');
      expect(res.body.size).toBe(500);
    });

    it('returns 404 when file not found', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('not found'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('returns 500 on unexpected error', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('DB failure'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/files/access/batch', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).post('/api/files/access/batch').send({ urls: [] });
      expect(res.status).toBe(401);
    });

    it('returns 400 when urls is not an array', async () => {
      const res = await request(app).post('/api/files/access/batch').send({ urls: 'not-array' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('converts authorized Appwrite URLs and rejects external URLs', async () => {
      const urls = [
        'https://appwrite.io/v1/storage/buckets/portfolio-images/files/file-123/view',
        'https://example.com/other-image.jpg',
      ];

      const res = await request(app).post('/api/files/access/batch').send({ urls });
      expect(res.status).toBe(200);
      expect(res.body.urls).toHaveLength(2);
      expect(res.body.urls[0].secure).toBe('/api/files/access/portfolio-images/file-123');
      expect(res.body.urls[0].accessible).toBe(true);
      expect(res.body.urls[1].secure).toBeNull();
      expect(res.body.urls[1].accessible).toBe(false);
    });

    it('returns inaccessible record when url item cannot be matched', async () => {
      const res = await request(app)
        .post('/api/files/access/batch')
        .send({ urls: [12345] });
      expect(res.status).toBe(200);
      expect(res.body.urls[0]).toEqual({
        original: 12345,
        secure: null,
        accessible: false,
      });
    });
  });
});

describe('File Access Routes - coverage gap branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'user-1', role: 'user' };
  });

  it('falls back to application/octet-stream when the file has no mime type', async () => {
    mockStorage.getFile.mockResolvedValue({
      name: 'user-1_uuid_archive.bin',
      sizeOriginal: 32,
    });
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('binary'));

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1');

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('application/octet-stream');
  });

  it('answers 500 FILE_STREAM_ERROR when storage rejects with a non-Error value', async () => {
    mockStorage.getFile.mockRejectedValueOnce('not-an-error');

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('FILE_STREAM_ERROR');
  });

  it('answers 500 INTERNAL_ERROR on the info route when storage rejects with a non-Error value', async () => {
    mockStorage.getFile.mockRejectedValueOnce('not-an-error');

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});


describe('File Access Routes - negotiated contract deliverables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'freelancer-9', role: 'user' };
  });

  it('allows contract parties to read deliverables stored on contract-scoped milestones', async () => {
    mockStorage.getFile.mockResolvedValue({ name: 'someone_uuid_work.pdf', sizeOriginal: 10, mimeType: 'application/pdf' });
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('work'));
    mockContractQueryAll.mockResolvedValueOnce([{
      id: 'c9', employer_id: 'employer-9', freelancer_id: 'freelancer-9', milestone_source: 'contract',
      milestones: [{ id: 'm1', deliverable_files: [{ url: '/api/files/access/milestone-deliverables/file-9' }] }],
    }]);
    const res = await request(app).get('/api/files/access/milestone-deliverables/file-9');
    expect(res.status).toBe(200);
  });

  it('denies outsiders', async () => {
    mockUser = { userId: 'outsider', role: 'user' };
    mockStorage.getFile.mockResolvedValue({ name: 'someone_uuid_work.pdf', sizeOriginal: 10, mimeType: 'application/pdf' });
    mockContractQueryAll.mockResolvedValueOnce([{
      id: 'c9', employer_id: 'employer-9', freelancer_id: 'freelancer-9', milestone_source: 'contract',
      milestones: [{ id: 'm1', deliverable_files: [{ url: '/api/files/access/milestone-deliverables/file-9' }] }],
    }]);
    const res = await request(app).get('/api/files/access/milestone-deliverables/file-9');
    expect(res.status).toBe(403);
  });
});

describe('File Access Routes - proposal and dispute resource authorization', () => {
  const fileMeta = (name = 'someone_uuid_attachment.pdf') => ({
    name,
    sizeOriginal: 1024,
    mimeType: 'application/pdf',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'user-1', role: 'user' };
    mockContractQueryAll.mockResolvedValue([]);
  });

  it('allows the proposal freelancer to read a proposal attachment', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('proposal'));
    proposalRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'proposal-1',
        freelancer_id: 'user-1',
        project_id: 'project-1',
        attachments: [{ url: '/api/files/access/proposal-attachments/file-1' }],
      },
    ]);

    const res = await request(app).get('/api/files/access/proposal-attachments/file-1');

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('application/pdf');
    expect(projectRepoMock.findProjectById).not.toHaveBeenCalled();
  });

  it('allows the project employer to read a proposal attachment', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('proposal'));
    proposalRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'proposal-1',
        freelancer_id: 'freelancer-1',
        project_id: 'project-1',
        attachments: JSON.stringify([{ fileId: 'file-1' }]),
      },
    ]);
    projectRepoMock.findProjectById.mockResolvedValueOnce({
      id: 'project-1',
      employer_id: 'user-1',
    });

    const res = await request(app).get('/api/files/access/proposal-attachments/file-1');

    expect(res.status).toBe(200);
    expect(projectRepoMock.findProjectById).toHaveBeenCalledWith('project-1');
  });

  it('denies a signed-in outsider reading a proposal attachment', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    proposalRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'proposal-1',
        freelancer_id: 'freelancer-1',
        project_id: 'project-1',
        attachments: [{ fileId: 'file-1' }],
      },
    ]);
    projectRepoMock.findProjectById.mockResolvedValueOnce({
      id: 'project-1',
      employer_id: 'employer-1',
    });

    const res = await request(app).get('/api/files/access/proposal-attachments/file-1');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('denies a proposal attachment that no proposal references', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    proposalRepoMock.queryAll.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/files/access/proposal-attachments/file-1');

    expect(res.status).toBe(403);
  });

  it('denies a proposal attachment when the project can no longer be found', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    proposalRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'proposal-1',
        freelancer_id: 'freelancer-1',
        project_id: 'project-1',
        attachments: [{ fileId: 'file-1' }],
      },
    ]);
    projectRepoMock.findProjectById.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/files/access/proposal-attachments/file-1');

    expect(res.status).toBe(403);
  });

  it('allows either contract party to read dispute evidence', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta('someone_uuid_evidence.pdf'));
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('evidence'));
    disputeRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'dispute-1',
        contract_id: 'contract-1',
        evidence: [{ url: '/api/files/access/dispute-evidence/file-1' }],
      },
    ]);
    contractRepoMock.getContractById.mockResolvedValueOnce({
      id: 'contract-1',
      employer_id: 'employer-1',
      freelancer_id: 'user-1',
    });

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1');

    expect(res.status).toBe(200);
    expect(contractRepoMock.getContractById).toHaveBeenCalledWith('contract-1');
  });

  it('denies a non-party reading dispute evidence', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    disputeRepoMock.queryAll.mockResolvedValueOnce([
      { id: 'dispute-1', contract_id: 'contract-1', evidence: [{ fileId: 'file-1' }] },
    ]);
    contractRepoMock.getContractById.mockResolvedValueOnce({
      id: 'contract-1',
      employer_id: 'employer-1',
      freelancer_id: 'freelancer-1',
    });

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1');

    expect(res.status).toBe(403);
  });

  it('denies dispute evidence that no dispute references', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    disputeRepoMock.queryAll.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/files/access/dispute-evidence/file-1');

    expect(res.status).toBe(403);
    expect(contractRepoMock.getContractById).not.toHaveBeenCalled();
  });

  it('allows a contract party to read deliverables referenced by project milestones', async () => {
    mockUser = { userId: 'employer-1', role: 'user' };
    mockStorage.getFile.mockResolvedValue(fileMeta('freelancer-1_uuid_deliverable.pdf'));
    mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('deliverable'));
    projectRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'project-1',
        milestones: [{ id: 'm1', deliverable_files: [{ fileId: 'file-1' }] }],
      },
    ]);
    contractRepoMock.getContractsByProject.mockResolvedValueOnce([
      { id: 'contract-1', employer_id: 'employer-1', freelancer_id: 'freelancer-1' },
    ]);

    const res = await request(app).get('/api/files/access/milestone-deliverables/file-1');

    expect(res.status).toBe(200);
    expect(contractRepoMock.getContractsByProject).toHaveBeenCalledWith('project-1');
  });

  it('denies deliverables when the user holds no contract for the project', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    projectRepoMock.queryAll.mockResolvedValueOnce([
      {
        id: 'project-1',
        milestones: [{ id: 'm1', deliverable_files: [{ fileId: 'file-1' }] }],
      },
    ]);
    contractRepoMock.getContractsByProject.mockResolvedValueOnce([
      { id: 'contract-1', employer_id: 'employer-1', freelancer_id: 'freelancer-1' },
    ]);

    const res = await request(app).get('/api/files/access/milestone-deliverables/file-1');

    expect(res.status).toBe(403);
  });

  it('rejects batch entries for buckets outside the configured taxonomy', async () => {
    const res = await request(app)
      .post('/api/files/access/batch')
      .send({ urls: ['https://appwrite.example/v1/storage/buckets/unknown-bucket/files/file-1/view'] });

    expect(res.status).toBe(200);
    expect(res.body.urls[0]).toEqual({
      original: 'https://appwrite.example/v1/storage/buckets/unknown-bucket/files/file-1/view',
      secure: null,
      accessible: false,
    });
    expect(mockStorage.getFile).not.toHaveBeenCalled();
  });

  it('marks a batch URL inaccessible when the caller cannot read the file', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta('someone_uuid_tax.pdf'));

    const res = await request(app)
      .post('/api/files/access/batch')
      .send({ urls: ['https://appwrite.example/v1/storage/buckets/kyc-documents/files/file-1/view'] });

    expect(res.status).toBe(200);
    expect(res.body.urls[0]).toEqual({
      original: 'https://appwrite.example/v1/storage/buckets/kyc-documents/files/file-1/view',
      secure: null,
      accessible: false,
    });
  });

  it('marks a batch URL inaccessible when authorization lookup throws', async () => {
    mockStorage.getFile.mockResolvedValue(fileMeta());
    proposalRepoMock.queryAll.mockRejectedValueOnce(new Error('proposal index unavailable'));

    const res = await request(app)
      .post('/api/files/access/batch')
      .send({ urls: ['https://appwrite.example/v1/storage/buckets/proposal-attachments/files/file-1/view'] });

    expect(res.status).toBe(200);
    expect(res.body.urls[0].secure).toBeNull();
    expect(res.body.urls[0].accessible).toBe(false);
  });
});
