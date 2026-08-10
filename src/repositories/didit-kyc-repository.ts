import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { KycVerification, UpdateKycVerificationInput } from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';
import { fromAppwriteDoc } from './base-repository.js';

const TABLE_NAME = 'kyc_verifications';

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
        Query.orderDesc('created_at'),
        Query.limit(1),
      ]
    );
    const doc = response.documents[0];
    return doc ? mapKyc(doc) : null;
  } catch (error) {
    logger.error('Error fetching KYC verification by user', error as Error);
    return null;
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
    const response = await databases.listDocuments(
      DATABASE_ID,
      TABLE_NAME,
      [
        Query.equal('status', status),
        Query.orderDesc('created_at'),
        Query.limit(1000),
      ]
    );
    return response.documents.map(mapKyc);
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
    const response = await databases.listDocuments(
      DATABASE_ID,
      TABLE_NAME,
      [
        Query.equal('status', 'completed'),
        Query.isNull('reviewed_by'),
        Query.orderAsc('completed_at'),
        Query.limit(1000),
      ]
    );
    return response.documents.map(mapKyc);
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
    const response = await databases.listDocuments(
      DATABASE_ID,
      TABLE_NAME,
      [
        Query.equal('user_id', userId),
        Query.orderDesc('created_at'),
        Query.limit(1000),
      ]
    );
    return response.documents.map(mapKyc);
  } catch (error) {
    logger.error('Error fetching KYC verification history', error as Error);
    return [];
  }
}
