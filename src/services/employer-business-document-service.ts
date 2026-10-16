import {
  employerBusinessDocumentRepository,
  EmployerBusinessDocumentEntity,
} from '../repositories/employer-business-document-repository.js';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { logger } from '../config/logger.js';
import { BUCKETS } from '../config/appwrite.js';
import { generateId } from '../utils/id.js';
import { uploadFileToStorage, deleteFileFromStorage } from '../utils/storage-uploader.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  BusinessDocument,
  BusinessDocumentType,
  BusinessProfileCompleteness,
} from '../models/employer-profile.js';

export type UploadBusinessDocumentInput = {
  documentType: BusinessDocumentType;
  label?: string | undefined;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
};

// Profile fields an employer must fill in before posting a project.
// Website is the only optional business field.
const REQUIRED_PROFILE_FIELDS: Array<[keyof EmployerProfileEntity, string]> = [
  ['company_name', 'companyName'],
  ['description', 'description'],
  ['industry', 'industry'],
  ['business_type', 'businessType'],
  ['tin', 'tin'],
  ['registration_number', 'registrationNumber'],
  ['business_address', 'businessAddress'],
  ['business_phone', 'businessPhone'],
  ['business_email', 'businessEmail'],
  ['year_established', 'yearEstablished'],
];

export function mapBusinessDocumentFromEntity(entity: EmployerBusinessDocumentEntity): BusinessDocument {
  return {
    id: entity.id,
    employerId: entity.employer_id,
    documentType: entity.document_type,
    label: entity.label ?? null,
    fileName: entity.file_name,
    fileUrl: entity.file_url,
    mimeType: entity.mime_type,
    size: entity.size,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

/**
 * Documents required for the employer's business type. Sole proprietors
 * register with DTI; partnerships, corporations and cooperatives with SEC.
 */
export function getRequiredDocumentTypes(businessType: string | null | undefined): BusinessDocumentType[] {
  const registration: BusinessDocumentType = businessType === 'sole_proprietorship' ? 'dti_certificate' : 'sec_registration';
  return ['bir_2303', registration, 'mayors_permit'];
}

export async function listBusinessDocuments(employerId: string): Promise<BusinessDocument[]> {
  const entities = await employerBusinessDocumentRepository.findByEmployer(employerId);
  return entities.map(mapBusinessDocumentFromEntity);
}

export async function uploadBusinessDocument(
  userId: string,
  input: UploadBusinessDocumentInput
): Promise<ServiceResult<BusinessDocument>> {
  const profile = await employerProfileRepository.getProfileByUserId(userId);
  if (!profile) {
    return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
  }

  const upload = await uploadFileToStorage({
    buffer: input.buffer,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    bucket: BUCKETS.BUSINESS_DOCUMENTS,
    userId,
  });
  if (!upload.success || !upload.metadata?.fileId) {
    return errorResult('UPLOAD_FAILED', upload.error || 'Failed to upload document');
  }

  const fileId = upload.metadata.fileId;
  let created: EmployerBusinessDocumentEntity;
  try {
    created = await employerBusinessDocumentRepository.createDocument({
      id: generateId(),
      employer_id: userId,
      document_type: input.documentType,
      label: input.documentType === 'other' ? input.label?.trim() || null : null,
      file_id: fileId,
      file_url: upload.metadata.url,
      file_name: input.originalFilename,
      mime_type: input.mimeType,
      size: upload.metadata.size,
    });
  } catch (error) {
    logger.error('Failed to save business document record', { error, userId });
    await deleteFileFromStorage(fileId, BUCKETS.BUSINESS_DOCUMENTS);
    return errorResult('UPLOAD_FAILED', 'Failed to save document');
  }

  // One document per type (except "other"): the new upload replaces the old one.
  if (input.documentType !== 'other') {
    const existing = await employerBusinessDocumentRepository.findByEmployer(userId);
    const replaced = existing.filter(doc => doc.document_type === input.documentType && doc.id !== created.id);
    for (const doc of replaced) {
      await employerBusinessDocumentRepository.deleteDocument(doc.id);
      await deleteFileFromStorage(doc.file_id, BUCKETS.BUSINESS_DOCUMENTS);
    }
  }

  return successResult(mapBusinessDocumentFromEntity(created));
}

export async function deleteBusinessDocument(
  userId: string,
  documentId: string
): Promise<ServiceResult<{ id: string }>> {
  const doc = await employerBusinessDocumentRepository.getDocumentById(documentId);
  if (!doc) {
    return errorResult('DOCUMENT_NOT_FOUND', 'Document not found');
  }
  if (doc.employer_id !== userId) {
    return errorResult('FORBIDDEN', 'You can only delete your own documents');
  }

  await employerBusinessDocumentRepository.deleteDocument(doc.id);
  await deleteFileFromStorage(doc.file_id, BUCKETS.BUSINESS_DOCUMENTS);
  return successResult({ id: doc.id });
}

/**
 * Remove every business document (records and files) for a user.
 * Used when an account is deleted.
 */
export async function deleteAllBusinessDocuments(userId: string): Promise<void> {
  const docs = await employerBusinessDocumentRepository.findByEmployer(userId);
  for (const doc of docs) {
    await employerBusinessDocumentRepository.deleteDocument(doc.id);
    await deleteFileFromStorage(doc.file_id, BUCKETS.BUSINESS_DOCUMENTS);
  }
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export async function getBusinessProfileCompleteness(
  userId: string
): Promise<ServiceResult<BusinessProfileCompleteness>> {
  const profile = await employerProfileRepository.getProfileByUserId(userId);
  if (!profile) {
    return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
  }

  const missingFields = REQUIRED_PROFILE_FIELDS
    .filter(([column]) => !isFilled(profile[column]))
    .map(([, field]) => field);

  const docs = await employerBusinessDocumentRepository.findByEmployer(userId);
  const submitted = new Set(docs.map(doc => doc.document_type));
  const missingDocuments = getRequiredDocumentTypes(profile.business_type)
    .filter(type => !submitted.has(type));

  return successResult({
    complete: missingFields.length === 0 && missingDocuments.length === 0,
    missingFields,
    missingDocuments,
  });
}
