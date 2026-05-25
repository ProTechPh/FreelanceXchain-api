/**
 * Didit KYC Repository
 * Database operations for KYC verifications using PostgreSQL
 * 
 * Note: We only store session info and decision - Didit handles all verification data.
 */

import { pool } from '../config/database.js';
import { KycVerification, UpdateKycVerificationInput } from '../models/didit-kyc.js';
import { logger } from '../config/logger.js';

const TABLE_NAME = 'kyc_verifications';

/**
 * Create a new KYC verification record
 */
export async function createKycVerification(
  verification: Omit<KycVerification, 'created_at' | 'updated_at'>
): Promise<KycVerification | null> {
  const now = new Date().toISOString();
  const keys = Object.keys(verification);
  const values = Object.values(verification);
  
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');

  const query = `
    INSERT INTO ${TABLE_NAME} (${columns}, created_at, updated_at)
    VALUES (${placeholders}, $${keys.length + 1}, $${keys.length + 2})
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [...values, now, now]);
    return result.rows[0] as KycVerification;
  } catch (error) {
    logger.error('Error creating KYC verification', error as Error);
    return null;
  }
}

/**
 * Get KYC verification by ID
 */
export async function getKycVerificationById(id: string): Promise<KycVerification | null> {
  const query = `SELECT * FROM ${TABLE_NAME} WHERE id = $1`;
  
  try {
    const result = await pool.query(query, [id]);
    return result.rows[0] as KycVerification || null;
  } catch (error) {
    logger.error('Error fetching KYC verification', error as Error);
    return null;
  }
}

/**
 * Get KYC verification by user ID
 */
export async function getKycVerificationByUserId(userId: string): Promise<KycVerification | null> {
  const query = `
    SELECT * FROM ${TABLE_NAME} 
    WHERE user_id = $1 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  
  try {
    const result = await pool.query(query, [userId]);
    return result.rows[0] as KycVerification || null;
  } catch (error) {
    logger.error('Error fetching KYC verification by user', error as Error);
    return null;
  }
}

/**
 * Get KYC verification by Didit session ID
 */
export async function getKycVerificationBySessionId(sessionId: string): Promise<KycVerification | null> {
  const query = `SELECT * FROM ${TABLE_NAME} WHERE didit_session_id = $1 LIMIT 1`;
  
  try {
    const result = await pool.query(query, [sessionId]);
    return result.rows[0] as KycVerification || null;
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
  const now = new Date().toISOString();
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  
  if (keys.length === 0) return getKycVerificationById(id);

  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
  
  const query = `
    UPDATE ${TABLE_NAME}
    SET ${setClause}, updated_at = $1
    WHERE id = $${keys.length + 2}
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [now, ...values, id]);
    return result.rows[0] as KycVerification || null;
  } catch (error) {
    logger.error('Error updating KYC verification', error as Error);
    return null;
  }
}

/**
 * Get all KYC verifications by status
 */
export async function getKycVerificationsByStatus(status: KycVerification['status']): Promise<KycVerification[]> {
  const query = `
    SELECT * FROM ${TABLE_NAME} 
    WHERE status = $1 
    ORDER BY created_at DESC
  `;
  
  try {
    const result = await pool.query(query, [status]);
    return result.rows as KycVerification[];
  } catch (error) {
    logger.error('Error fetching KYC verifications by status', error as Error);
    return [];
  }
}

/**
 * Get pending reviews (completed but not yet approved/rejected by admin)
 */
export async function getPendingReviews(): Promise<KycVerification[]> {
  const query = `
    SELECT * FROM ${TABLE_NAME} 
    WHERE status = 'completed' AND reviewed_by IS NULL 
    ORDER BY completed_at ASC
  `;
  
  try {
    const result = await pool.query(query);
    return result.rows as KycVerification[];
  } catch (error) {
    logger.error('Error fetching pending reviews', error as Error);
    return [];
  }
}

/**
 * Delete KYC verification (for testing/cleanup)
 */
export async function deleteKycVerification(id: string): Promise<boolean> {
  const query = `DELETE FROM ${TABLE_NAME} WHERE id = $1`;
  
  try {
    await pool.query(query, [id]);
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
  const query = `
    SELECT * FROM ${TABLE_NAME} 
    WHERE user_id = $1 
    ORDER BY created_at DESC
  `;
  
  try {
    const result = await pool.query(query, [userId]);
    return result.rows as KycVerification[];
  } catch (error) {
    logger.error('Error fetching KYC verification history', error as Error);
    return [];
  }
}
