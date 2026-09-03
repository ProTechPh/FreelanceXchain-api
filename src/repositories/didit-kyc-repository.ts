import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { KycVerification, UpdateKycVerificationInput } from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';
import { fromAppwriteDoc } from './base-repository.js';

const TABLE_NAME = 'kyc_verifications';

/**
 * Fetch ALL KYC documents matching the given queries, using cursor-based
 * pagination. Mirrors BaseRepository.fetchAll — replaces the Query.limit(1000)
 * pattern that silently dropped records past 1000 (the truncation class fixed
 * across the listing layer). Errors propagate to the caller.
 */
async function listAllKycDocuments(baseQueries: string[], pageSize = 100): Promise<Record<string, unknown>[]> {
  const allDocs: Record<string, unknown>[] = [];
  let lastId: string | undefined;

  while (true) {
    const queries = [...baseQueries, Query.limit(pageSize)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

    const response = await databases.listDocuments(DATABASE_ID, TABLE_NAME, queries);
    allDocs.push(...response.documents);

    if (response.documents.length < pageSize) break;
    lastId = response.documents[response.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return allDocs;
}

function mapKyc(doc: Record<string, unknown>): KycVerification {
  const result = fromAppwriteDoc<Record<string, unknown>>(doc);
  for (const field of ['decline_reasons', 'review_reasons', 'metadata']) {
    const value = result[field];
    if (typeof value === 'string') {
      try {
        result[field] = JSON.parse(value);
      } catch {
        // ignore JSON parse error
      }
    }
  }

  const meta = result['metadata'] as Record<string, unknown> | null;
  if (meta && typeof meta === 'object') {
    if (!result['date_of_birth'] && meta['date_of_birth']) result['date_of_birth'] = meta['date_of_birth'];
    if (!result['issuing_country'] && meta['issuing_country']) result['issuing_country'] = meta['issuing_country'];
    if (!result['liveness_confidence_score'] && meta['liveness_confidence_score']) result['liveness_confidence_score'] = meta['liveness_confidence_score'];
    if (!result['face_similarity_score'] && meta['face_similarity_score']) result['face_similarity_score'] = meta['face_similarity_score'];
    if (!result['ip_country_code'] && meta['ip_country_code']) result['ip_country_code'] = meta['ip_country_code'];
    if (result['is_vpn'] === undefined && meta['is_vpn'] !== undefined) result['is_vpn'] = meta['is_vpn'];
    if (result['is_proxy'] === undefined && meta['is_proxy'] !== undefined) result['is_proxy'] = meta['is_proxy'];
  }

  return result as KycVerification;
}

let cachedAllowedKeys: Set<string> | null = null;

async function getAllowedKeys(): Promise<Set<string> | null> {
  if (cachedAllowedKeys) return cachedAllowedKeys;
  try {
    const dbClient = databases as unknown as { listAttributes?: (dbId: string, colId: string) => Promise<{ attributes?: { key: string }[] }> };
    if (typeof dbClient.listAttributes === 'function') {
      const res = await dbClient.listAttributes(DATABASE_ID, TABLE_NAME);
      if (res?.attributes && Array.isArray(res.attributes)) {
        cachedAllowedKeys = new Set(res.attributes.map((a) => a.key));
        return cachedAllowedKeys;
      }
    }
  } catch {
    // If listing attributes fails, fallback to default allowed keys
  }
  return null;
}

const DEFAULT_ALLOWED_KYC_ATTRIBUTES = new Set([
  'user_id',
  'status',
  'didit_session_id',
  'didit_session_token',
  'didit_session_url',
  'didit_workflow_id',
  'decision',
  'document_type',
  'document_number',
  'first_name',
  'last_name',
  'nationality',
  'document_verified',
  'liveness_passed',
  'face_matched',
  'ip_address',
  'metadata',
  'reviewed_by',
  'admin_notes',
]);

async function filterKycAttributes(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const allowedKeys = (await getAllowedKeys()) ?? DEFAULT_ALLOWED_KYC_ATTRIBUTES;
  const attrs: Record<string, unknown> = {};

  let meta: Record<string, unknown> = {};
  if (typeof data['metadata'] === 'object' && data['metadata'] !== null) {
    meta = { ...(data['metadata'] as Record<string, unknown>) };
  } else if (typeof data['metadata'] === 'string') {
    try {
      meta = JSON.parse(data['metadata']);
    } catch {
      meta = {};
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (
      key === 'id' ||
      key === '$id' ||
      key === '$createdAt' ||
      key === '$updatedAt' ||
      key === '$collectionId' ||
      key === '$databaseId' ||
      key === '$permissions' ||
      value === undefined
    ) {
      continue;
    }

    if (allowedKeys.has(key)) {
      attrs[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
    } else {
      if (['date_of_birth', 'issuing_country', 'liveness_confidence_score', 'face_similarity_score', 'ip_country_code', 'is_vpn', 'is_proxy', 'completed_at', 'expires_at'].includes(key)) {
        meta[key] = value;
      }
    }
  }

  if (allowedKeys.has('metadata')) {
    attrs['metadata'] = JSON.stringify(meta);
  }

  if (allowedKeys.has('created_at') && !attrs['created_at']) {
    attrs['created_at'] = new Date().toISOString();
  }
  if (allowedKeys.has('updated_at')) {
    attrs['updated_at'] = new Date().toISOString();
  }

  return attrs;
}

export async function createKycVerification(
  verification: Omit<KycVerification, 'created_at' | 'updated_at'>
): Promise<KycVerification | null> {
  const docId = verification.id || ID.unique();
  const attrs = await filterKycAttributes(verification as Record<string, unknown>);

  try {
    const doc = await databases.createDocument(
      DATABASE_ID,
      TABLE_NAME,
      docId,
      attrs
    );
    return mapKyc(doc);
  } catch (error) {
    logger.error('Error creating KYC verification', error as Error);
    return null;
  }
}

/**
 * Get KYC verification by ID
 */
export async function getKycVerificationById(id: string): Promise<KycVerification | null> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, TABLE_NAME, id);
    return mapKyc(doc);
  } catch (error) {
    logger.error('Error fetching KYC verification', error as Error);
    return null;
  }
}

/**
 * Get KYC verification by user ID
 */
export async function getKycVerificationByUserId(userId: string): Promise<KycVerification | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      TABLE_NAME,
      [
        Query.equal('user_id', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]
    );
    const doc = response.documents[0];
    return doc ? mapKyc(doc) : null;
  } catch (error) {
    logger.error('Error fetching KYC verification by user', error as Error);
    throw error;
  }
}

/**
 * Get KYC verification by Didit session ID
 */
export async function getKycVerificationBySessionId(sessionId: string): Promise<KycVerification | null> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      TABLE_NAME,
      [
        Query.equal('didit_session_id', sessionId),
        Query.limit(1),
      ]
    );
    const doc = response.documents[0];
    return doc ? mapKyc(doc) : null;
  } catch (error) {
    logger.error('Error fetching KYC verification by session', error as Error);
    return null;
  }
}

/**
 * Update KYC verification
 */
export async function updateKycVerification(
  id: string,
  updates: UpdateKycVerificationInput
): Promise<KycVerification | null> {
  if (Object.keys(updates).length === 0) return getKycVerificationById(id);

  const attrs = await filterKycAttributes(updates as Record<string, unknown>);
  if (Object.keys(attrs).length === 0) return getKycVerificationById(id);

  try {
    const doc = await databases.updateDocument(
      DATABASE_ID,
      TABLE_NAME,
      id,
      attrs
    );
    return mapKyc(doc);
  } catch (error) {
    logger.error('Error updating KYC verification', error as Error);
    return null;
  }
}

/**
 * Get all KYC verifications by status
 */
export async function getKycVerificationsByStatus(status: KycVerification['status']): Promise<KycVerification[]> {
  try {
    // listAllKycDocuments (cursor pagination) instead of Query.limit(1000): the
    // admin status list silently hid verifications past the first 1000.
    const documents = await listAllKycDocuments([
      Query.equal('status', status),
      Query.orderDesc('$createdAt'),
    ]);
    return documents.map(mapKyc);
  } catch (error) {
    logger.error('Error fetching KYC verifications by status', error as Error);
    return [];
  }
}

/**
 * Get pending reviews (completed but not yet approved/rejected by admin)
 */
export async function getPendingReviews(): Promise<KycVerification[]> {
  try {
    // listAllKycDocuments (cursor pagination) instead of Query.limit(1000): with
    // more than 1000 completed-but-unreviewed verifications, the admin queue
    // silently hid the older ones and they were never reviewed.
    const documents = await listAllKycDocuments([
      Query.equal('status', 'completed'),
      Query.isNull('reviewed_by'),
      Query.orderAsc('$createdAt'),
    ]);
    return documents.map(mapKyc);
  } catch (error) {
    logger.error('Error fetching pending reviews', error as Error);
    return [];
  }
}

/**
 * Delete KYC verification (for testing/cleanup)
 */
export async function deleteKycVerification(id: string): Promise<boolean> {
  try {
    await databases.deleteDocument(DATABASE_ID, TABLE_NAME, id);
    return true;
  } catch (error) {
    logger.error('Error deleting KYC verification', error as Error);
    return false;
  }
}

/**
 * Get all KYC verifications for a user (history)
 */
export async function getKycVerificationHistory(userId: string): Promise<KycVerification[]> {
  try {
    // listAllKycDocuments (cursor pagination) instead of Query.limit(1000): a
    // user with more than 1000 KYC attempts saw only the newest 1000.
    const documents = await listAllKycDocuments([
      Query.equal('user_id', userId),
      Query.orderDesc('$createdAt'),
    ]);
    return documents.map(mapKyc);
  } catch (error) {
    logger.error('Error fetching KYC verification history', error as Error);
    return [];
  }
}
