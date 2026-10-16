// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDocRepo = {
  createDocument: jest.fn<any>(),
  getDocumentById: jest.fn<any>(),
  deleteDocument: jest.fn<any>(),
  findByEmployer: jest.fn<any>(),
};
const mockProfileRepo = {
  getProfileByUserId: jest.fn<any>(),
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
      expect(mockDocRepo.findByEmployer).not.toHaveBeenCalled();
    });

    it('stores a null label for "other" documents without one', async () => {
      mockProfileRepo.getProfileByUserId.mockResolvedValueOnce(completeProfile);
      mockUploadFileToStorage.mockResolvedValueOnce({ success: true, metadata: { fileId: 'file-o', url: '/o', size: 3 } });
      mockDocRepo.createDocument.mockImplementationOnce(async (data) => ({ ...data, created_at: 'c', updated_at: 'u' }));

      const result = await uploadBusinessDocument('emp-1', { ...uploadInput, documentType: 'other' });
      expect(result.data.label).toBeNull();
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
      expect(result.data).toEqual({ complete: true, missingFields: [], missingDocuments: [] });
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
});
