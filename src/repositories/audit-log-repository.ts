import { pool } from '../config/database.js';

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

export type CreateAuditLogEntry = Omit<AuditLogEntry, 'id' | 'created_at'>;

export type BaseEntity = {
  id: string;
  created_at: string;
};

export class AuditLogRepository {
  protected tableName: string = 'audit_log_entries';

  async logAction(entry: Partial<CreateAuditLogEntry>): Promise<AuditLogEntry> {
    const now = new Date().toISOString();
    const logEntry = {
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
    };

    const keys = Object.keys(logEntry);
    const values = Object.values(logEntry);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0] as AuditLogEntry;
    } catch (error: any) {
      throw new Error(`Failed to create audit log: ${error.message}`);
    }
  }

  async getById(id: string): Promise<AuditLogEntry | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] as AuditLogEntry || null;
    } catch (error: any) {
      throw new Error(`Failed to get audit log: ${error.message}`);
    }
  }

  async getByUserId(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    try {
      const result = await pool.query(query, [userId, limit]);
      return result.rows as AuditLogEntry[];
    } catch (error: any) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  async getByAction(action: string, limit = 100): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    try {
      const result = await pool.query(query, [action, limit]);
      return result.rows as AuditLogEntry[];
    } catch (error: any) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  async getByResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE resource_type = $1 AND resource_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `;
    
    try {
      const result = await pool.query(query, [resourceType, resourceId, limit]);
      return result.rows as AuditLogEntry[];
    } catch (error: any) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  async getByDateRange(startDate: Date, endDate: Date, limit = 1000): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
      LIMIT $3
    `;
    
    try {
      const result = await pool.query(query, [startDate.toISOString(), endDate.toISOString(), limit]);
      return result.rows as AuditLogEntry[];
    } catch (error: any) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  async getFailedActions(limit = 100): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'failure'
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    try {
      const result = await pool.query(query, [limit]);
      return result.rows as AuditLogEntry[];
    } catch (error: any) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }
}
