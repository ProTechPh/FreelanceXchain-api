import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env.js';

let supabaseClient: SupabaseClient | null = null;
let supabaseServiceClient: SupabaseClient | null = null;

export const TABLES = {
  USERS: 'users',
  FREELANCER_PROFILES: 'freelancer_profiles',
  EMPLOYER_PROFILES: 'employer_profiles',
  PROJECTS: 'projects',
  PROPOSALS: 'proposals',
  CONTRACTS: 'contracts',
  DISPUTES: 'disputes',
  SKILLS: 'skills',
  SKILL_CATEGORIES: 'skill_categories',
  NOTIFICATIONS: 'notifications',
  KYC_VERIFICATIONS: 'kyc_verifications',
  REVIEWS: 'reviews',
  MESSAGES: 'messages',
  PAYMENTS: 'payments',
  AUDIT_LOG_ENTRIES: 'audit_log_entries',
} as const;

export const STORAGE_BUCKETS = {
  PROPOSAL_ATTACHMENTS: 'proposal-attachments',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];
export type StorageBucketName = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new Error('Supabase configuration is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    }
    supabaseClient = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return supabaseClient;
}

export function getSupabaseServiceClient(): SupabaseClient {
  if (!supabaseServiceClient) {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error('Supabase service role configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }
    supabaseServiceClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseServiceClient;
}

export async function initializeDatabase(): Promise<void> {
  const client = getSupabaseClient();
  // Test connection by querying a simple table
  const { error } = await client.from(TABLES.USERS).select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which is fine
    throw new Error(`Failed to connect to Supabase: ${error.message}`);
  }
  console.log('Supabase connection verified');
}
