/**
 * Shared best-effort audit persistence for privileged/system actions (BLF-12.2).
 *
 * A failed audit write is logged and swallowed — auditing must never break the
 * action it records. Entry semantics:
 * - `user_id`   — the user the action targeted (null for system-level actions)
 * - `actor_id`  — the admin/system account that performed the action
 * - `resource_type` / `resource_id` — the affected entity (e.g. kyc_verification, dispute)
 */

import { auditLogRepository, CreateAuditLogEntry } from '../repositories/audit-log-repository.js';
import { logger } from '../config/logger.js';

export async function persistAuditEntry(entry: CreateAuditLogEntry): Promise<void> {
  try {
    await auditLogRepository.create(entry);
  } catch (error) {
    logger.error('Failed to persist audit log entry', { error, entry });
  }
}
