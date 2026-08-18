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
      result[field] = JSON.parse(value);
    }
  }
  return result as KycVerification;
}

export async function createKycVerification(
  verification: Omit<KycVerification, 'created_at' | 'updated_at'>
): Promise<KycVerification | null> {
  const now = new Date().toISOString();
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(verification)) {
    if (value !== undefined) {
      attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    }
  }
  attrs.created_at = now;
  attrs.updated_at = now;

  try {
    const doc = await databases.createDocument(
      DATABASE_ID,
      TABLE_NAME,
      verification.id || ID.unique(),
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

  const now = new Date().toISOString();
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'id' && key !== 'user_id' && key !== 'created_at' && value !== undefined) {
      attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    }
  }
  attrs.updated_at = now;

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
