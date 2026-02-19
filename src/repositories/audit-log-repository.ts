import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient, TableName } from '../config/supabase.js';

export type AuditLogStatus = 'success' | 'failure' | 'pending';

export interface AuditLogEntry extends BaseEntity {
  user_id: string | null;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: AuditLogStatus;
  error_message: string | null;
}

export type CreateAuditLogEntry = Omit<AuditLogEntry, 'id' | 'created_at' | 'updated_at'>;

export type BaseEntity = {
  id: string;
  created_at: string;
  updated_at: string;
};

export class AuditLogRepository {
  protected tableName: TableName;
  protected client: SupabaseClient;

  constructor() {
    this.tableName = 'audit_log_entries' as TableName;
    // Use service role client to bypass RLS for audit logs
    // We still filter by user_id in queries for security
    this.client = getSupabaseServiceClient();
  }

  async logAction(entry: Partial<CreateAuditLogEntry>): Promise<AuditLogEntry> {
    const now = new Date().toISOString();
    const logEntry: CreateAuditLogEntry & { created_at: string; updated_at: string } = {
      user_id: entry.user_id || null,
      actor_id: entry.actor_id || null,
      action: entry.action || 'unknown_action',
      resource_type: entry.resource_type || 'unknown',
      resource_id: entry.resource_id || null,
      payload: entry.payload || {},
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
      status: entry.status || 'success',
      error_message: entry.error_message || null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from(this.tableName)
      .insert(logEntry)
      .select()
      .single();

    if (error) throw new Error(`Failed to create audit log: ${error.message}`);
    return data as AuditLogEntry;
  }

  async getById(id: string): Promise<AuditLogEntry | null> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get audit log: ${error.message}`);
    }
    return data as AuditLogEntry;
  }

  async getByUserId(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
    return (data ?? []) as AuditLogEntry[];
  }

  async getByAction(action: string, limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('action', action)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
    return (data ?? []) as AuditLogEntry[];
  }

  async getByResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
    return (data ?? []) as AuditLogEntry[];
  }

  async getByDateRange(startDate: Date, endDate: Date, limit = 1000): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
    return (data ?? []) as AuditLogEntry[];
  }

  async getFailedActions(limit = 100): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('status', 'failure')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
    return (data ?? []) as AuditLogEntry[];
  }
}
