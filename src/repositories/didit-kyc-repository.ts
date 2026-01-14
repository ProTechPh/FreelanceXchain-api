/**
 * Didit KYC Repository
 * Database operations for KYC verifications using Supabase
 */

import { getSupabaseClient } from '../config/supabase.js';
import { KycVerification, UpdateKycVerificationInput } from '../models/didit-kyc.js';

const supabase = getSupabaseClient();
const TABLE_NAME = 'kyc_verifications';

/**
 * Create a new KYC verification record
 */
export async function createKycVerification(
  verification: Omit<KycVerification, 'created_at' | 'updated_at'>
): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      ...verification,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating KYC verification:', error);
    return null;
  }

  return data as KycVerification;
}

/**
 * Get KYC verification by ID
 */
export async function getKycVerificationById(id: string): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching KYC verification:', error);
    return null;
  }

  return data as KycVerification;
}

/**
 * Get KYC verification by user ID
 */
export async function getKycVerificationByUserId(userId: string): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    console.error('Error fetching KYC verification by user:', error);
    return null;
  }

  return data as KycVerification;
}

/**
 * Get KYC verification by Didit session ID
 */
export async function getKycVerificationBySessionId(sessionId: string): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('didit_session_id', sessionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching KYC verification by session:', error);
    return null;
  }

  return data as KycVerification;
}

/**
 * Update KYC verification
 */
export async function updateKycVerification(
  id: string,
  updates: UpdateKycVerificationInput
): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating KYC verification:', error);
    return null;
  }

  return data as KycVerification;
}

/**
 * Get all KYC verifications by status
 */
export async function getKycVerificationsByStatus(status: KycVerification['status']): Promise<KycVerification[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching KYC verifications by status:', error);
    return [];
  }

  return data as KycVerification[];
}

/**
 * Get pending reviews (completed but not yet approved/rejected by admin)
 */
export async function getPendingReviews(): Promise<KycVerification[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('status', 'completed')
    .is('reviewed_by', null)
    .order('completed_at', { ascending: true });

  if (error) {
    console.error('Error fetching pending reviews:', error);
    return [];
  }

  return data as KycVerification[];
}

/**
 * Delete KYC verification (for testing/cleanup)
 */
export async function deleteKycVerification(id: string): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting KYC verification:', error);
    return false;
  }

  return true;
}

/**
 * Get all KYC verifications for a user (history)
 */
export async function getKycVerificationHistory(userId: string): Promise<KycVerification[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching KYC verification history:', error);
    return [];
  }

  return data as KycVerification[];
}
