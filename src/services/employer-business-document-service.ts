import {
  employerBusinessDocumentRepository,
  EmployerBusinessDocumentEntity,
} from '../repositories/employer-business-document-repository.js';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { userRepository } from '../repositories/user-repository.js';
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

  const docs = await employerBusinessDocumentRepository.findByEmployer(userId);
  return successResult(computeCompleteness(profile, docs));
}

/** Required business fields and documents still missing from a profile. */
export function computeCompleteness(
  profile: EmployerProfileEntity,
  docs: EmployerBusinessDocumentEntity[]
): BusinessProfileCompleteness {
  const missingFields = REQUIRED_PROFILE_FIELDS
    .filter(([column]) => !isFilled(profile[column]))
    .map(([, field]) => field);

  const submitted = new Set(docs.map(doc => doc.document_type));
  const missingDocuments = getRequiredDocumentTypes(profile.business_type)
    .filter(type => !submitted.has(type));

  return {
    complete: missingFields.length === 0 && missingDocuments.length === 0,
    missingFields,
    missingDocuments,
  };
}

export const ADMIN_BUSINESS_PROFILE_STATUSES = ['all', 'with_documents', 'complete', 'incomplete'] as const;
export type AdminBusinessProfileStatus = typeof ADMIN_BUSINESS_PROFILE_STATUSES[number];

export type AdminBusinessProfileSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  activeRole: string | null;
  companyName: string;
  businessType: string | null;
  documentCount: number;
  requiredDocumentCount: number;
  submittedRequiredCount: number;
  complete: boolean;
  missingFieldCount: number;
  missingDocumentCount: number;
  lastDocumentAt: string | null;
  updatedAt: string;
};

export type AdminBusinessProfileList = {
  items: AdminBusinessProfileSummary[];
  counts: { all: number; withDocuments: number; complete: number; incomplete: number };
};

function latest(...dates: Array<string | null | undefined>): string | null {
  return dates.filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
}

/**
 * Read-only overview of every employer business profile for admins: identity,
 * completeness and documents on file. Includes users currently acting as
 * freelancers who have set up an employer side.
 */
export async function listBusinessProfilesForAdmin(
  options: { status?: AdminBusinessProfileStatus; search?: string } = {}
): Promise<AdminBusinessProfileList> {
  const [allProfiles, documents] = await Promise.all([
    employerProfileRepository.queryAll('$createdAt', true),
    employerBusinessDocumentRepository.queryAll(),
  ]);

  // One row per user. If a user somehow has more than one employer profile,
  // keep the oldest: it is the one getProfileByUserId returns and the app uses.
  const seenUsers = new Set<string>();
  const profiles = allProfiles.filter(profile => {
    if (seenUsers.has(profile.user_id)) return false;
    seenUsers.add(profile.user_id);
    return true;
  });

  const docsByEmployer = new Map<string, EmployerBusinessDocumentEntity[]>();
  for (const doc of documents) {
    const list = docsByEmployer.get(doc.employer_id) ?? [];
    list.push(doc);
    docsByEmployer.set(doc.employer_id, list);
  }

  const users = await userRepository.getUsersByIds([...new Set(profiles.map(profile => profile.user_id))]);
  const usersById = new Map(users.map(user => [user.id, user]));

  const all: AdminBusinessProfileSummary[] = profiles.map(profile => {
    const docs = docsByEmployer.get(profile.user_id) ?? [];
    const completeness = computeCompleteness(profile, docs);
    const required = getRequiredDocumentTypes(profile.business_type);
    const user = usersById.get(profile.user_id);
    const lastDocumentAt = latest(...docs.map(doc => doc.created_at));
    return {
      userId: profile.user_id,
      name: user?.name ?? profile.name ?? null,
      email: user?.email ?? null,
      activeRole: user?.role ?? null,
      companyName: profile.company_name,
      businessType: profile.business_type ?? null,
      documentCount: docs.length,
      requiredDocumentCount: required.length,
      submittedRequiredCount: required.length - completeness.missingDocuments.length,
      complete: completeness.complete,
      missingFieldCount: completeness.missingFields.length,
      missingDocumentCount: completeness.missingDocuments.length,
      lastDocumentAt,
      updatedAt: latest(profile.updated_at, lastDocumentAt) ?? profile.updated_at,
    };
  });

  const search = options.search?.trim().toLowerCase();
  const matching = search
    ? all.filter(item => [item.companyName, item.name, item.email]
      .some(value => value?.toLowerCase().includes(search)))
    : all;

  const counts = {
    all: matching.length,
    withDocuments: matching.filter(item => item.documentCount > 0).length,
    complete: matching.filter(item => item.complete).length,
    incomplete: matching.filter(item => !item.complete).length,
  };

  const status = options.status ?? 'all';
  const items = matching
    .filter(item => status === 'all'
      || (status === 'with_documents' && item.documentCount > 0)
      || (status === 'complete' && item.complete)
      || (status === 'incomplete' && !item.complete))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { items, counts };
}
