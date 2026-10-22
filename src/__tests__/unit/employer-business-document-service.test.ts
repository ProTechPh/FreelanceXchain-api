// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDocRepo = {
  createDocument: jest.fn<any>(),
  getDocumentById: jest.fn<any>(),
  deleteDocument: jest.fn<any>(),
  findByEmployer: jest.fn<any>(),
  queryAll: jest.fn<any>(),
};
const mockProfileRepo = {
  getProfileByUserId: jest.fn<any>(),
  queryAll: jest.fn<any>(),
  updateProfile: jest.fn<any>(),
};
const mockUserRepo = {
  getUsersByIds: jest.fn<any>(),
};
const mockUploadFileToStorage = jest.fn<any>();
const mockDeleteFileFromStorage = jest.fn<any>();
const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/repositories/employer-business-document-repository.ts'), () => ({
  employerBusinessDocumentRepository: mockDocRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockProfileRepo,
}));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadFileToStorage: mockUploadFileToStorage,
  deleteFileFromStorage: mockDeleteFileFromStorage,
}));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));
jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({ generateId: () => 'new-doc' }));

const {
  listBusinessDocuments,
  uploadBusinessDocument,
  deleteBusinessDocument,
  deleteAllBusinessDocuments,
  getBusinessProfileCompleteness,
  getRequiredDocumentTypes,
  mapBusinessDocumentFromEntity,
  listBusinessProfilesForAdmin,
  submitBusinessProfileForVerification,
  verifyBusinessProfileByAdmin,
  rejectBusinessProfileByAdmin,
} = await import('../../services/employer-business-document-service.js');

const docEntity = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  employer_id: 'emp-1',
  document_type: 'bir_2303',
  label: null,
  file_id: 'file-1',
  file_url: '/api/files/access/business-documents/file-1',
  file_name: 'bir.pdf',
  mime_type: 'application/pdf',
  size: 1234,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const completeProfile = {
  id: 'ep-1',
  user_id: 'emp-1',
  company_name: 'Acme',
  description: 'We build things',
  industry: 'Tech',
  business_type: 'sole_proprietorship',
  tin: '123-456-789',
  registration_number: 'DTI-1234',
  business_address: '1 Main St, Makati',
  business_phone: '+63 912 345 6789',
  business_email: 'hello@acme.ph',
  website: null,
  year_established: 2015,
};

const uploadInput = {
  documentType: 'bir_2303',
  buffer: Buffer.from('pdf'),
  originalFilename: 'bir.pdf',
  mimeType: 'application/pdf',
};

describe('employer-business-document-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocRepo.findByEmployer.mockResolvedValue([]);
    mockDeleteFileFromStorage.mockResolvedValue({ success: true });
    mockDocRepo.deleteDocument.mockResolvedValue(true);
  });

  describe('getRequiredDocumentTypes', () => {
    it('requires DTI for sole proprietorships', () => {
      expect(getRequiredDocumentTypes('sole_proprietorship')).toEqual(['bir_2303', 'dti_certificate', 'mayors_permit']);
    });

    it('requires SEC for other business types and when unset', () => {
      expect(getRequiredDocumentTypes('corporation')).toEqual(['bir_2303', 'sec_registration', 'mayors_permit']);
      expect(getRequiredDocumentTypes(null)).toEqual(['bir_2303', 'sec_registration', 'mayors_permit']);
    });
  });

  describe('mapBusinessDocumentFromEntity', () => {
    it('maps snake_case to camelCase and defaults label to null', () => {
      const mapped = mapBusinessDocumentFromEntity(docEntity({ label: undefined }));
      expect(mapped).toMatchObject({ id: 'doc-1', employerId: 'emp-1', documentType: 'bir_2303', label: null, fileName: 'bir.pdf', size: 1234 });
    });
  });

  describe('listBusinessDocuments', () => {
    it('returns mapped documents', async () => {
      mockDocRepo.findByEmployer.mockResolvedValueOnce([docEntity()]);
      const docs = await listBusinessDocuments('emp-1');
      expect(docs).toHaveLength(1);
      expect(docs[0].fileUrl).toContain('business-documents');
    });
  });

  describe('uploadBusinessDocument', () => {
    it('fails when the employer profile is missing', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(null);
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('fails when the storage upload fails', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: false, error: 'boom' });
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.error).toEqual({ code: 'UPLOAD_FAILED', message: 'boom' });
    });

    it('uses a default message when the upload returns no file id', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { url: '/x' } });
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.error.message).toBe('Failed to upload document');
    });

    it('cleans up the file when the record cannot be saved', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { fileId: 'file-9', url: '/u', size: 3 } });
      mockDocRepo.createDocument.mockRejectedValueOnce(new Error('db down'));
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.error.code).toBe('UPLOAD_FAILED');
      expect(mockDeleteFileFromStorage).toHaveBeenCalledWith('file-9', 'business-documents');
    });

    it('uploads to the business-documents bucket and replaces an older document of the same type', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { fileId: 'file-new', url: '/new', size: 3 } });
      mockDocRepo.createDocument.mockImplementationOnce(async (data) => ({ ...data, created_at: 'c', updated_at: 'u' }));
      mockDocRepo.findByEmployer.mockResolvedValueOnce([
        docEntity({ id: 'old', file_id: 'file-old' }),
        docEntity({ id: 'new-doc', file_id: 'file-new' }),
        docEntity({ id: 'permit', document_type: 'mayors_permit', file_id: 'file-permit' }),
      ]);

      const result = await uploadBusinessDocument('emp-1', { ...uploadInput, label: 'ignored' });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('new-doc');
      expect(result.data.label).toBeNull();
      expect(mockUploadFileToStorage).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'business-documents', userId: 'emp-1' }));
      expect(mockDocRepo.deleteDocument).toHaveBeenCalledTimes(1);
      expect(mockDocRepo.deleteDocument).toHaveBeenCalledWith('old');
      expect(mockDeleteFileFromStorage).toHaveBeenCalledWith('file-old', 'business-documents');
    });

    it('keeps existing "other" documents and stores the trimmed label', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { fileId: 'file-o', url: '/o', size: 3 } });
      mockDocRepo.createDocument.mockImplementationOnce(async (data) => ({ ...data, created_at: 'c', updated_at: 'u' }));

      const result = await uploadBusinessDocument('emp-1', { ...uploadInput, documentType: 'other', label: '  BOI certificate ' });

      expect(result.data.label).toBe('BOI certificate');
      expect(mockDocRepo.createDocument).toHaveBeenCalled();
    });

    it('stores a null label for "other" documents without one', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { fileId: 'file-o', url: '/o', size: 3 } });
      mockDocRepo.createDocument.mockImplementationOnce(async (data) => ({ ...data, created_at: 'c', updated_at: 'u' }));

      const result = await uploadBusinessDocument('emp-1', { ...uploadInput, documentType: 'other' });
      expect(result.data.label).toBeNull();
    });
  });


    it('rejects duplicate file upload for different document type', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      const existing = docEntity({ id: 'd-existing', document_type: 'dti_certificate', file_name: 'bir.pdf', size: uploadInput.buffer.length });
      mockDocRepo.findByEmployer.mockResolvedValueOnce([existing]);
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_FILE');
    });

    it('rejects identical file upload for same document type', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      const existing = docEntity({ id: 'd-existing', document_type: 'bir_2303', file_name: 'bir.pdf', size: uploadInput.buffer.length });
      mockDocRepo.findByEmployer.mockResolvedValueOnce([existing]);
      const result = await uploadBusinessDocument('emp-1', uploadInput);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_FILE');
    });

  describe('verification workflow', () => {
    it('submits business profile for verification when complete', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockDocRepo.findByEmployer.mockResolvedValueOnce([
        docEntity(),
        docEntity({ id: 'd2', document_type: 'dti_certificate' }),
        docEntity({ id: 'd3', document_type: 'mayors_permit' }),
      ]);
      mockProfileRepo.updateProfile.mockResolvedValueOnce({ ...completeProfile, verification_status: 'pending' });
      const result = await submitBusinessProfileForVerification('emp-1');
      expect(result.success).toBe(true);
      expect(result.data.verificationStatus).toBe('pending');
      expect(mockProfileRepo.updateProfile).toHaveBeenCalledWith('ep-1', { verification_status: 'pending' });
    });

    it('fails to submit for verification when profile is incomplete', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce({ ...completeProfile, tin: null });
      mockDocRepo.findByEmployer.mockResolvedValueOnce([]);
      const result = await submitBusinessProfileForVerification('emp-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INCOMPLETE_PROFILE');
    });

    it('allows admin to verify and confirm a complete profile', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockDocRepo.findByEmployer.mockResolvedValueOnce([
        docEntity(),
        docEntity({ id: 'd2', document_type: 'dti_certificate' }),
        docEntity({ id: 'd3', document_type: 'mayors_permit' }),
      ]);
      mockProfileRepo.updateProfile.mockResolvedValueOnce({ ...completeProfile, verification_status: 'verified', verified_by: 'admin-1' });
      const result = await verifyBusinessProfileByAdmin('admin-1', 'emp-1', 'All documents valid');
      expect(result.success).toBe(true);
      expect(result.data.profile.verificationStatus).toBe('verified');
    });

    it('prevents admin from verifying an incomplete profile', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce({ ...completeProfile, tin: null });
      mockDocRepo.findByEmployer.mockResolvedValueOnce([]);
      const result = await verifyBusinessProfileByAdmin('admin-1', 'emp-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CANNOT_VERIFY_INCOMPLETE');
    });

    it('allows admin to reject with notes', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockProfileRepo.updateProfile.mockResolvedValueOnce({ ...completeProfile, verification_status: 'rejected', verification_notes: 'BIR is blurry' });
      const result = await rejectBusinessProfileByAdmin('admin-1', 'emp-1', 'BIR is blurry');
      expect(result.success).toBe(true);
      expect(result.data.profile.verificationStatus).toBe('rejected');
      expect(result.data.profile.verificationNotes).toBe('BIR is blurry');
    });

    it('rejects admin rejection if notes are too short', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      const result = await rejectBusinessProfileByAdmin('admin-1', 'emp-1', 'bad');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_NOTES');
    });
  });
  describe('deleteBusinessDocument', () => {
    it('returns DOCUMENT_NOT_FOUND for unknown documents', async () => {
      mockDocRepo.getDocumentById.mockResolvedValueOnce(null);
      const result = await deleteBusinessDocument('emp-1', 'doc-x');
      expect(result.error.code).toBe('DOCUMENT_NOT_FOUND');
    });

    it('forbids deleting another employer\'s document', async () => {
      mockDocRepo.getDocumentById.mockResolvedValueOnce(docEntity({ employer_id: 'someone-else' }));
      const result = await deleteBusinessDocument('emp-1', 'doc-1');
      expect(result.error.code).toBe('FORBIDDEN');
      expect(mockDocRepo.deleteDocument).not.toHaveBeenCalled();
    });

    it('deletes the record and the stored file', async () => {
      mockDocRepo.getDocumentById.mockResolvedValueOnce(docEntity());
      const result = await deleteBusinessDocument('emp-1', 'doc-1');
      expect(result).toEqual({ success: true, data: { id: 'doc-1' } });
      expect(mockDeleteFileFromStorage).toHaveBeenCalledWith('file-1', 'business-documents');
    });
  });

  describe('deleteAllBusinessDocuments', () => {
    it('removes every record and file for the employer', async () => {
      mockDocRepo.findByEmployer.mockResolvedValueOnce([docEntity(), docEntity({ id: 'doc-2', file_id: 'file-2' })]);
      await deleteAllBusinessDocuments('emp-1');
      expect(mockDocRepo.deleteDocument).toHaveBeenCalledTimes(2);
      expect(mockDeleteFileFromStorage).toHaveBeenCalledWith('file-2', 'business-documents');
    });
  });

  describe('getBusinessProfileCompleteness', () => {
    it('returns PROFILE_NOT_FOUND when there is no profile', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(null);
      const result = await getBusinessProfileCompleteness('emp-1');
      expect(result.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('lists every missing field and document for an empty profile', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce({ id: 'ep-1', user_id: 'emp-1', company_name: 'Acme', description: '   ', industry: 'Tech' });
      const result = await getBusinessProfileCompleteness('emp-1');
      expect(result.data.complete).toBe(false);
      expect(result.data.missingFields).toEqual([
        'description', 'businessType', 'tin', 'registrationNumber', 'businessAddress',
        'businessPhone', 'businessEmail', 'yearEstablished',
      ]);
      expect(result.data.missingFields).not.toContain('website');
      expect(result.data.missingDocuments).toEqual(['bir_2303', 'sec_registration', 'mayors_permit']);
    });

    it('is complete when all fields and the DTI-based documents are present', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockDocRepo.findByEmployer.mockResolvedValueOnce([
        docEntity(),
        docEntity({ id: 'd2', document_type: 'dti_certificate' }),
        docEntity({ id: 'd3', document_type: 'mayors_permit' }),
      ]);
      const result = await getBusinessProfileCompleteness('emp-1');
      expect(result.data).toEqual({ complete: true, missingFields: [], missingDocuments: [], verificationStatus: 'pending', verificationNotes: null, verifiedAt: null });
    });

    it('requires SEC instead of DTI for corporations', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce({ ...completeProfile, business_type: 'corporation' });
      mockDocRepo.findByEmployer.mockResolvedValueOnce([
        docEntity(),
        docEntity({ id: 'd2', document_type: 'dti_certificate' }),
        docEntity({ id: 'd3', document_type: 'mayors_permit' }),
      ]);
      const result = await getBusinessProfileCompleteness('emp-1');
      expect(result.data.complete).toBe(false);
      expect(result.data.missingDocuments).toEqual(['sec_registration']);
    });
  });

  describe('listBusinessProfilesForAdmin', () => {
    const profiles = [
      { ...completeProfile, id: 'ep-1', user_id: 'emp-1', company_name: 'Acme Trading', updated_at: '2026-01-01T00:00:00.000Z' },
      { ...completeProfile, id: 'ep-2', user_id: 'emp-2', company_name: 'Beta Corp', business_type: 'corporation', tin: null, updated_at: '2026-03-01T00:00:00.000Z' },
      { id: 'ep-3', user_id: 'ghost', name: 'Profile Name', company_name: 'No Docs Inc', description: '', industry: '', updated_at: '2026-02-01T00:00:00.000Z' },
    ];
    const documents = [
      docEntity({ id: 'd1', employer_id: 'emp-1', document_type: 'bir_2303', created_at: '2026-04-01T00:00:00.000Z' }),
      docEntity({ id: 'd2', employer_id: 'emp-1', document_type: 'dti_certificate', created_at: '2026-01-05T00:00:00.000Z' }),
      docEntity({ id: 'd3', employer_id: 'emp-1', document_type: 'mayors_permit', created_at: '2026-01-06T00:00:00.000Z' }),
      docEntity({ id: 'd4', employer_id: 'emp-2', document_type: 'bir_2303', created_at: '2026-02-10T00:00:00.000Z' }),
    ];

    beforeEach(() => {
      mockProfileRepo.queryAll.mockResolvedValue(profiles);
      mockDocRepo.queryAll.mockResolvedValue(documents);
      mockUserRepo.getUsersByIds.mockResolvedValue([
        { id: 'emp-1', name: 'Ana Reyes', email: 'ana@acme.ph', role: 'employer' },
        { id: 'emp-2', name: 'Ben Cruz', email: 'ben@beta.ph', role: 'freelancer' },
      ]);
    });

    it('summarizes every profile, newest activity first, with filter counts', async () => {
      const result = await listBusinessProfilesForAdmin();

      expect(result.counts).toEqual({ all: 3, withDocuments: 2, complete: 1, incomplete: 2, pending: 1, verified: 0, rejected: 0 });
      expect(result.items.map(item => item.userId)).toEqual(['emp-1', 'emp-2', 'ghost']);

      const [acme, beta, ghost] = result.items;
      expect(acme).toMatchObject({
        name: 'Ana Reyes', email: 'ana@acme.ph', activeRole: 'employer', complete: true,
        documentCount: 3, requiredDocumentCount: 3, submittedRequiredCount: 3,
        missingFieldCount: 0, missingDocumentCount: 0,
        lastDocumentAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
      });
      expect(beta).toMatchObject({
        activeRole: 'freelancer', businessType: 'corporation', complete: false,
        documentCount: 1, submittedRequiredCount: 1, missingFieldCount: 1, missingDocumentCount: 2,
        updatedAt: '2026-03-01T00:00:00.000Z',
      });
      expect(ghost).toMatchObject({
        name: 'Profile Name', email: null, activeRole: null, businessType: null,
        documentCount: 0, lastDocumentAt: null, updatedAt: '2026-02-01T00:00:00.000Z',
      });
      expect(mockUserRepo.getUsersByIds).toHaveBeenCalledWith(['emp-1', 'emp-2', 'ghost']);
    });

    it.each([
      ['complete', ['emp-1']],
      ['incomplete', ['emp-2', 'ghost']],
      ['with_documents', ['emp-1', 'emp-2']],
      ['all', ['emp-1', 'emp-2', 'ghost']],
    ])('filters by status %s', async (status, expected) => {
      const result = await listBusinessProfilesForAdmin({ status });
      expect(result.items.map(item => item.userId)).toEqual(expected);
    });

    it('searches company, name and email case-insensitively and counts only matches', async () => {
      expect((await listBusinessProfilesForAdmin({ search: 'BETA' })).items.map(item => item.userId)).toEqual(['emp-2']);
      expect((await listBusinessProfilesForAdmin({ search: 'ana@' })).items.map(item => item.userId)).toEqual(['emp-1']);
      const result = await listBusinessProfilesForAdmin({ search: 'no docs' });
      expect(result.items.map(item => item.userId)).toEqual(['ghost']);
      expect(result.counts).toEqual({ all: 1, withDocuments: 0, complete: 0, incomplete: 1, pending: 0, verified: 0, rejected: 0 });
    });

    it('shows one row per user when a user has duplicate employer profiles', async () => {
      mockProfileRepo.queryAll.mockResolvedValueOnce([
        { ...completeProfile, id: 'ep-old', user_id: 'emp-1', company_name: 'Acme Trading', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'ep-dup', user_id: 'emp-1', company_name: 'Empty copy', description: '', industry: '', updated_at: '2026-05-01T00:00:00.000Z' },
      ]);
      const result = await listBusinessProfilesForAdmin();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ userId: 'emp-1', companyName: 'Acme Trading', complete: true });
      expect(mockProfileRepo.queryAll).toHaveBeenCalledWith('$createdAt', true);
    });

    it('ignores a blank search', async () => {
      const result = await listBusinessProfilesForAdmin({ search: '   ' });
      expect(result.items).toHaveLength(3);
    });
  });
});
