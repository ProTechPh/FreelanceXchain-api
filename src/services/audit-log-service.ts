import {
  AuditLogRepository,
  AuditLogEntry,
  AuditLogSearchFilters,
  AuditLogSearchResult,
} from '../repositories/audit-log-repository.js';

export class AuditLogService {
  private auditLogRepo: AuditLogRepository;

  constructor() {
    this.auditLogRepo = new AuditLogRepository();
  }

  async getUserAuditLogs(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogRepo.getByUserId(userId, limit);
  }

  async getResourceAuditLogs(resourceType: string, resourceId: string): Promise<AuditLogEntry[]> {
    return this.auditLogRepo.getByResource(resourceType, resourceId);
  }

  async getAuditLogsByAction(action: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogRepo.getByAction(action, limit);
  }

  async getAuditLogsByDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    return this.auditLogRepo.getByDateRange(startDate, endDate);
  }

  async getFailedActions(limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogRepo.getFailedActions(limit);
  }

  async getAuditLogById(id: string): Promise<AuditLogEntry | null> {
    return this.auditLogRepo.getById(id);
  }

  async searchAuditLogs(filters: AuditLogSearchFilters = {}): Promise<AuditLogSearchResult> {
    return this.auditLogRepo.search(filters);
  }

  /**
   * Aggregate audit entries into a per-admin, per-day activity summary for
   * compliance reporting. Each row: { actor_id, date (YYYY-MM-DD), actions
   * { action: count }, total }.
   */
  async getAdminActivitySummary(startDate: Date, endDate: Date): Promise<{
    items: Array<{
      actor_id: string;
      date: string;
      actions: Record<string, number>;
      total: number;
    }>;
    totalActions: number;
    activeAdmins: number;
  }> {
    const logs = await this.auditLogRepo.listForRange(startDate, endDate);

    const buckets = new Map<string, { actor_id: string; date: string; actions: Record<string, number>; total: number }>();
    let totalActions = 0;
    const activeAdmins = new Set<string>();

    for (const log of logs) {
      if (!log.actor_id) continue; // system-level entries have no actor
      totalActions += 1;
      activeAdmins.add(log.actor_id);
      const day = (log.created_at ?? '').slice(0, 10) || 'unknown';
      const key = `${log.actor_id}|${day}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { actor_id: log.actor_id, date: day, actions: {}, total: 0 };
        buckets.set(key, bucket);
      }
      bucket.total += 1;
      bucket.actions[log.action] = (bucket.actions[log.action] ?? 0) + 1;
    }

    const items = [...buckets.values()]
      .sort((a, b) => (a.date === b.date ? a.actor_id.localeCompare(b.actor_id) : a.date.localeCompare(b.date)));

    return {
      items,
      totalActions,
      activeAdmins: activeAdmins.size,
    };
  }

  // Generate audit report for a specific user
  async generateUserAuditReport(userId: string, startDate: Date, endDate: Date): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    actionBreakdown: Record<string, number>;
    logs: AuditLogEntry[];
  }> {
    const logs = await this.auditLogRepo.getByDateRange(startDate, endDate);
    const userLogs = logs.filter(log => log.user_id === userId);

    const actionBreakdown: Record<string, number> = {};
    let successfulActions = 0;
    let failedActions = 0;

    userLogs.forEach(log => {
      // Count by action
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;

      // Count by status
      if (log.status === 'success') {
        successfulActions++;
      } else if (log.status === 'failure') {
        failedActions++;
      }
    });

    return {
      totalActions: userLogs.length,
      successfulActions,
      failedActions,
      actionBreakdown,
      logs: userLogs,
    };
  }

  // Generate system-wide audit report
  async generateSystemAuditReport(startDate: Date, endDate: Date): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    actionBreakdown: Record<string, number>;
    resourceBreakdown: Record<string, number>;
    topUsers: Array<{ userId: string; count: number }>;
  }> {
    const logs = await this.auditLogRepo.getByDateRange(startDate, endDate);

    const actionBreakdown: Record<string, number> = {};
    const resourceBreakdown: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    let successfulActions = 0;
    let failedActions = 0;

    logs.forEach(log => {
      // Count by action
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;

      // Count by resource type
      resourceBreakdown[log.resource_type] = (resourceBreakdown[log.resource_type] || 0) + 1;

      // Count by user
      if (log.user_id) {
        userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
      }

      // Count by status
      if (log.status === 'success') {
        successfulActions++;
      } else if (log.status === 'failure') {
        failedActions++;
      }
    });

    // Get top 10 users by activity
    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalActions: logs.length,
      successfulActions,
      failedActions,
      actionBreakdown,
      resourceBreakdown,
      topUsers,
    };
  }
}
