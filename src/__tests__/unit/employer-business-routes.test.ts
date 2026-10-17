// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockEnsureEmployerProfile = jest.fn<any>();
const mockListBusinessDocuments = jest.fn<any>();
const mockUploadBusinessDocument = jest.fn<any>();
const mockDeleteBusinessDocument = jest.fn<any>();
const mockGetCompleteness = jest.fn<any>();

let currentUser: any = { userId: 'emp-1', role: 'employer' };
let uploadedFiles: any[] = [];

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
  ensureEmployerProfile: mockEnsureEmployerProfile,
}));
jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/services/employer-business-document-service.ts'), () => ({
  listBusinessDocuments: mockListBusinessDocuments,
  uploadBusinessDocument: mockUploadBusinessDocument,
  deleteBusinessDocument: mockDeleteBusinessDocument,
  getBusinessProfileCompleteness: mockGetCompleteness,
}));
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'emp-1', role: 'employer' }; next(); },
  optionalAuthMiddleware: (req: any, _res: any, next: any) => { if (currentUser) req.user = currentUser; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateAppwriteDocumentId: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));
jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  uploadBusinessDocument: [(req: any, _res: any, next: any) => { req.files = uploadedFiles; next(); }],
}));
jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/employer-routes.js')).default;

const fullProfile = {
  id: 'ep-1',
  userId: 'emp-1',
  companyName: 'Acme',
  tin: '123-456-789',
  registrationNumber: 'DTI-1',
  businessAddress: 'Makati',
  businessPhone: '+63 912 345 6789',
  businessEmail: 'hi@acme.ph',
  website: 'https://acme.ph',
  businessType: 'sole_proprietorship',
};

const doc = {
  id: 'doc-1',
  employerId: 'emp-1',
  documentType: 'bir_2303',
  label: null,
  fileName: 'bir.pdf',
  fileUrl: '/api/files/access/business-documents/f1',
  mimeType: 'application/pdf',
  size: 10,
};

describe('Employer business routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { userId: 'emp-1', role: 'employer' };
    uploadedFiles = [{ buffer: Buffer.from('pdf'), originalname: 'bir.pdf', mimetype: 'application/pdf' }];
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/employers', router);
  });

  describe('PATCH /profile business fields', () => {
    it('accepts and trims valid business fields', async () => {
      mockUpdateEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep-1' } });
      const res = await request(app).patch('/api/employers/profile').send({
        businessType: 'corporation',
        tin: ' 123-456-789-000 ',
        registrationNumber: 'CS201912345',
        businessAddress: '1 Ayala Ave, Makati City',
        businessPhone: '+63 (2) 8123-4567',
        businessEmail: 'ops@acme.ph',
        website: 'https://acme.ph',
        yearEstablished: 2010,
      });
      expect(res.status).toBe(200);
      expect(mockUpdateEmployerProfile).toHaveBeenCalledWith('emp-1', expect.objectContaining({
        businessType: 'corporation',
        tin: '123-456-789-000',
        yearEstablished: 2010,
      }));
    });

    it('allows clearing the optional website', async () => {
      mockUpdateEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep-1' } });
      const res = await request(app).patch('/api/employers/profile').send({ website: '' });
      expect(res.status).toBe(200);
      expect(mockUpdateEmployerProfile).toHaveBeenCalledWith('emp-1', expect.objectContaining({ website: '' }));
    });

    it('allows a null website', async () => {
      mockUpdateEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep-1' } });
      const res = await request(app).patch('/api/employers/profile').send({ website: null });
      expect(res.status).toBe(200);
    });

    it('rejects every malformed business field', async () => {
      const res = await request(app).patch('/api/employers/profile').send({
        businessType: 'llc',
        tin: '12345',
        registrationNumber: 'x',
        businessAddress: 'abc',
        businessPhone: 'call me',
        businessEmail: 'not-an-email',
        website: 'ftp://acme.ph',
        yearEstablished: 1700,
      });
      expect(res.status).toBe(400);
      const fields = res.body.error.details.map((d: any) => d.field);
      expect(fields).toEqual(expect.arrayContaining([
        'businessType', 'tin', 'registrationNumber', 'businessAddress', 'businessPhone',
        'businessEmail', 'website', 'yearEstablished',
      ]));
      expect(mockUpdateEmployerProfile).not.toHaveBeenCalled();
    });

    it('rejects non-string and out-of-range values', async () => {
      const res = await request(app).patch('/api/employers/profile').send({
        tin: 123,
        registrationNumber: 'x'.repeat(51),
        businessAddress: 'y'.repeat(501),
        businessPhone: 5,
        businessEmail: `${'a'.repeat(250)}@acme.ph`,
        website: 'not a url',
        yearEstablished: 2000.5,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveLength(7);
    });

    it('rejects a non-string website and a non-numeric year', async () => {
      const res = await request(app).patch('/api/employers/profile').send({ website: 42, yearEstablished: '2010' });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d: any) => d.field)).toEqual(['website', 'yearEstablished']);
    });
  });

  describe('POST /profile (ensure)', () => {
    it('returns the existing or newly created employer profile', async () => {
      mockEnsureEmployerProfile.mockResolvedValueOnce({ success: true, data: { id: 'ep-1', userId: 'emp-1' } });
      const res = await request(app).post('/api/employers/profile');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ep-1');
      expect(mockEnsureEmployerProfile).toHaveBeenCalledWith('emp-1');
    });

    it('returns 404 when the user is missing', async () => {
      mockEnsureEmployerProfile.mockResolvedValueOnce({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      const res = await request(app).post('/api/employers/profile');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /profile/completeness', () => {
    it('returns the completeness result', async () => {
      mockGetCompleteness.mockResolvedValueOnce({ success: true, data: { complete: false, missingFields: ['tin'], missingDocuments: [] } });
      const res = await request(app).get('/api/employers/profile/completeness');
      expect(res.status).toBe(200);
      expect(res.body.missingFields).toEqual(['tin']);
    });

    it('returns 404 when the profile is missing', async () => {
      mockGetCompleteness.mockResolvedValueOnce({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'nope' } });
      const res = await request(app).get('/api/employers/profile/completeness');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /profile/documents', () => {
    it('lists the employer\'s own documents', async () => {
      mockListBusinessDocuments.mockResolvedValueOnce([doc]);
      const res = await request(app).get('/api/employers/profile/documents');
      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(mockListBusinessDocuments).toHaveBeenCalledWith('emp-1');
    });
  });

  describe('POST /profile/documents', () => {
    it('uploads a document', async () => {
      uploadedFiles = [{ buffer: Buffer.from('pdf'), originalname: 'bir.pdf', mimetype: 'application/octet-stream', detectedMimeType: 'application/pdf' }];
      mockUploadBusinessDocument.mockResolvedValueOnce({ success: true, data: doc });
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'bir_2303' });
      expect(res.status).toBe(201);
      expect(mockUploadBusinessDocument).toHaveBeenCalledWith('emp-1', expect.objectContaining({
        documentType: 'bir_2303',
        label: undefined,
        originalFilename: 'bir.pdf',
        mimeType: 'application/pdf',
      }));
    });

    it('falls back to the multer mimetype and passes the label for "other"', async () => {
      mockUploadBusinessDocument.mockResolvedValueOnce({ success: true, data: { ...doc, documentType: 'other' } });
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'other', label: 'BOI certificate' });
      expect(res.status).toBe(201);
      expect(mockUploadBusinessDocument).toHaveBeenCalledWith('emp-1', expect.objectContaining({ label: 'BOI certificate', mimeType: 'application/pdf' }));
    });

    it('rejects an unknown document type', async () => {
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'passport' });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('documentType');
    });

    it('requires a label for "other" documents', async () => {
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'other', label: ' ' });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('label');
    });

    it('rejects an overly long label for "other" documents', async () => {
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'other', label: 'x'.repeat(256) });
      expect(res.status).toBe(400);
    });

    it('returns 404 when the profile is missing', async () => {
      mockUploadBusinessDocument.mockResolvedValueOnce({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'nope' } });
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'bir_2303' });
      expect(res.status).toBe(404);
    });

    it('returns 500 when the upload fails', async () => {
      mockUploadBusinessDocument.mockResolvedValueOnce({ success: false, error: { code: 'UPLOAD_FAILED', message: 'boom' } });
      const res = await request(app).post('/api/employers/profile/documents').send({ documentType: 'bir_2303' });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /profile/documents/:documentId', () => {
    it('deletes a document', async () => {
      mockDeleteBusinessDocument.mockResolvedValueOnce({ success: true, data: { id: 'doc-1' } });
      const res = await request(app).delete('/api/employers/profile/documents/doc-1');
      expect(res.status).toBe(200);
      expect(mockDeleteBusinessDocument).toHaveBeenCalledWith('emp-1', 'doc-1');
    });

    it('returns 403 for another employer\'s document', async () => {
      mockDeleteBusinessDocument.mockResolvedValueOnce({ success: false, error: { code: 'FORBIDDEN', message: 'no' } });
      const res = await request(app).delete('/api/employers/profile/documents/doc-1');
      expect(res.status).toBe(403);
    });

    it('returns 404 for a missing document', async () => {
      mockDeleteBusinessDocument.mockResolvedValueOnce({ success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'no' } });
      const res = await request(app).delete('/api/employers/profile/documents/doc-1');
      expect(res.status).toBe(404);
    });
  });

  describe('public profile and documents', () => {
    it('returns the full profile to signed-in users', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValueOnce({ success: true, data: fullProfile });
      const res = await request(app).get('/api/employers/emp-1');
      expect(res.status).toBe(200);
      expect(res.body.tin).toBe('123-456-789');
      expect(res.body.businessEmail).toBe('hi@acme.ph');
    });

    it('hides registration and contact fields from anonymous visitors', async () => {
      currentUser = null;
      mockGetEmployerProfileByUserId.mockResolvedValueOnce({ success: true, data: fullProfile });
      const res = await request(app).get('/api/employers/emp-1');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        companyName: 'Acme',
        website: 'https://acme.ph',
        businessType: 'sole_proprietorship',
        tin: null,
        registrationNumber: null,
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
      });
    });

    it('includes file links for signed-in users', async () => {
      mockListBusinessDocuments.mockResolvedValueOnce([doc]);
      const res = await request(app).get('/api/employers/emp-1/documents');
      expect(res.status).toBe(200);
      expect(res.body.documents[0].fileUrl).toBe(doc.fileUrl);
    });

    it('omits file links and names for anonymous visitors', async () => {
      currentUser = null;
      mockListBusinessDocuments.mockResolvedValueOnce([doc]);
      const res = await request(app).get('/api/employers/emp-1/documents');
      expect(res.status).toBe(200);
      expect(res.body.documents[0]).not.toHaveProperty('fileUrl');
      expect(res.body.documents[0]).not.toHaveProperty('fileName');
      expect(res.body.documents[0].documentType).toBe('bir_2303');
    });
  });
});
