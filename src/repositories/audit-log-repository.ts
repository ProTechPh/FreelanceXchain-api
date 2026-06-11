import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';

export type AuditLogStatus = 'success' | 'failure' | 'pending';

export type BaseEntity = {
  id: string;
  created_at: string;
};

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

const COLLECTION_ID = 'audit_log_entries';

function mapAuditLog(doc: Record<string, any>): AuditLogEntry {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  };
  if (typeof result.payload === 'string') {
    result.payload = JSON.parse(result.payload);
  }
  return result as AuditLogEntry;
}

export class AuditLogRepository {
  private collectionId: string = COLLECTION_ID;

  async getById(id: string): Promise<AuditLogEntry | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, this.collectionId, id);
      return mapAuditLog(doc);
    } catch {
      return null;
    }
  }

  async getByUserId(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('user_id', userId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByAction(action: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('action', action),
          Query.orderDesc('created_at'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('resource_type', resourceType),
          Query.equal('resource_id', resourceId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByDateRange(startDate: Date, endDate: Date, limit = 1000): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.orderDesc('created_at'),
          Query.limit(limit),
        ]
      );
      const start = startDate.toISOString();
      const end = endDate.toISOString();
      return response.documents
        .map(mapAuditLog)
        .filter(entry => entry.created_at >= start && entry.created_at <= end);
    } catch {
      return [];
    }
  }

  async getFailedActions(limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('status', 'failure'),
          Query.orderDesc('created_at'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }
}

export const auditLogRepository = new AuditLogRepository();
