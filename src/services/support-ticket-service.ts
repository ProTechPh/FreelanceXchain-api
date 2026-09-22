/**
 * Customer support tickets.
 *
 * Separate from dispute-service.ts, which arbitrates between two users over
 * escrowed money, and from app-rating-service.ts, which collects one-way
 * feedback nobody answers. Here a user asks the platform a question and an
 * admin answers it.
 */

import {
  supportTicketRepository,
  type SupportTicketFilters,
} from '../repositories/support-ticket-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { notifySupportTicketResolved } from './notification-service.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { logger } from '../config/logger.js';
import { withLock } from '../utils/async-lock.js';
import { successResult, errorResult, type ServiceResult } from '../types/service-result.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_OPEN_TICKETS_PER_USER,
  MAX_RESOLUTION_LENGTH,
  MAX_SUBJECT_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_SUBJECT_LENGTH,
  canTransition,
  countByStatus,
  isSupportTicketCategory,
  isSupportTicketStatus,
  type AdminSupportTicket,
  type SubmitSupportTicketInput,
  type SupportTicket,
  type SupportTicketEntity,
  type SupportTicketStats,
  type UpdateSupportTicketStatusInput,
} from '../models/support-ticket.js';

export async function submitSupportTicket(
  input: SubmitSupportTicketInput
): Promise<ServiceResult<SupportTicket>> {
  const { userId, userRole, category } = input;

  if (!isSupportTicketCategory(category)) {
    return errorResult('INVALID_CATEGORY', 'Unknown ticket category.');
  }

  const subject = input.subject.trim();
  if (subject.length < MIN_SUBJECT_LENGTH || subject.length > MAX_SUBJECT_LENGTH) {
    return errorResult(
      'INVALID_SUBJECT',
      `Subject must be between ${MIN_SUBJECT_LENGTH} and ${MAX_SUBJECT_LENGTH} characters.`
    );
  }

  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return errorResult(
      'INVALID_DESCRIPTION',
      `Description must be between ${MIN_DESCRIPTION_LENGTH} and ${MAX_DESCRIPTION_LENGTH} characters.`
    );
  }

  // Serialize per user so two rapid submissions cannot both pass the open-ticket
  // check. Same pattern as the cooldown guard in app-rating-service.
  return withLock(`support-ticket:${userId}`, async () => {
    try {
      const active = await supportTicketRepository.countActiveByUser(userId);
      if (active >= MAX_OPEN_TICKETS_PER_USER) {
        return errorResult(
          'TOO_MANY_OPEN_TICKETS',
          `You already have ${MAX_OPEN_TICKETS_PER_USER} tickets awaiting a reply. Please wait for one to be answered before opening another.`
        );
      }

      const created = await supportTicketRepository.createTicket({
        user_id: userId,
        user_role: userRole,
        subject,
        description,
        category,
        status: 'open',
      });

      logger.info('Support ticket submitted', { userId, ticketId: created.id, category });
      return successResult(created);
    } catch (error) {
      logger.error('Failed to submit support ticket', { error, userId, category });
      return errorResult('SUBMIT_FAILED', 'Could not submit your ticket. Please try again.');
    }
  });
}

/** The submitter's own tickets, newest first. */
export async function listMySupportTickets(userId: string): Promise<ServiceResult<SupportTicket[]>> {
  try {
    return successResult(await supportTicketRepository.listByUser(userId));
  } catch (error) {
    logger.error('Failed to list own support tickets', { error, userId });
    return errorResult('LIST_FAILED', 'Could not load your support tickets.');
  }
}

/**
 * The admin queue: rows for the chosen filter, plus the counts for every filter.
 *
 * One Appwrite read serves both. The queue previously spent six round trips on
 * this — a filtered page, a user join, and four separate counts — which is what
 * made it feel slow: each round trip to Appwrite Cloud costs ~100ms at best, and
 * bursts of them occasionally stall for seconds on a cold connection.
 */
export async function listSupportTickets(
  filters: SupportTicketFilters = {}
): Promise<ServiceResult<{ tickets: AdminSupportTicket[]; total: number; stats: SupportTicketStats }>> {
  try {
    const all = await supportTicketRepository.fetchAllForQueue();

    // Counts describe the whole queue, so they are taken before filtering —
    // otherwise every card would read as the count of the selected card.
    const stats = countByStatus(all);

    const matching = all.filter(ticket => {
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.category && ticket.category !== filters.category) return false;
      return true;
    });

    // Only the visible rows need a submitter, and it is one batched read.
    const userIds = [...new Set(matching.map(t => t.userId))];
    const users = await userRepository.getUsersByIds(userIds);
    const byId = new Map(users.map(u => [u.id, u]));

    return successResult({
      stats,
      total: matching.length,
      tickets: matching.map(ticket => {
        const user = byId.get(ticket.userId);
        // A deleted account still leaves its ticket behind; label it rather
        // than dropping the row.
        return {
          ...ticket,
          userName: user?.name ?? 'Deleted user',
          userEmail: user?.email ?? '—',
        };
      }),
    });
  } catch (error) {
    logger.error('Failed to list support tickets', { error });
    return errorResult('LIST_FAILED', 'Could not load support tickets.');
  }
}

export async function updateSupportTicketStatus(
  input: UpdateSupportTicketStatusInput
): Promise<ServiceResult<SupportTicket>> {
  const { ticketId, adminId, status } = input;

  if (!isSupportTicketStatus(status)) {
    return errorResult('INVALID_STATUS', 'Unknown ticket status.');
  }

  const resolutionNote = input.resolutionNote?.trim();
  if (resolutionNote && resolutionNote.length > MAX_RESOLUTION_LENGTH) {
    return errorResult(
      'RESOLUTION_TOO_LONG',
      `Resolution note must be ${MAX_RESOLUTION_LENGTH} characters or fewer.`
    );
  }

  // A resolution the submitter cannot read is not a resolution. Enforced here
  // rather than only in the UI, since the route is reachable directly.
  if (status === 'resolved' && !resolutionNote) {
    return errorResult('RESOLUTION_REQUIRED', 'A resolution note is required when resolving a ticket.');
  }

  // Serialize per ticket so two admins acting at once cannot both pass the
  // transition check and clobber each other's decision.
  return withLock(`support-ticket-status:${ticketId}`, async () => {
    try {
      const ticket = await supportTicketRepository.getTicketById(ticketId);
      if (!ticket) {
        return errorResult('TICKET_NOT_FOUND', 'Support ticket not found.');
      }

      if (!canTransition(ticket.status, status)) {
        return errorResult(
          'INVALID_TRANSITION',
          `A ${ticket.status.replace('_', ' ')} ticket cannot be moved to ${status.replace('_', ' ')}.`
        );
      }

      const isTerminal = status === 'resolved' || status === 'closed';
      const patch: Partial<SupportTicketEntity> = {
        status,
        ...(resolutionNote ? { resolution_note: resolutionNote } : {}),
        ...(isTerminal ? { resolved_by: adminId, resolved_at: new Date().toISOString() } : {}),
      };

      const updated = await supportTicketRepository.updateTicket(ticketId, patch);
      if (!updated) {
        return errorResult('UPDATE_FAILED', 'Could not update the ticket. Please try again.');
      }

      // Both side effects below are best-effort: neither may undo a decision
      // that is already written.
      if (status === 'resolved') {
        const notified = await notifySupportTicketResolved({
          userId: updated.userId,
          ticketId: updated.id,
          subject: updated.subject,
        });
        if (!notified.success) {
          logger.error('Failed to notify support ticket resolution', {
            ticketId,
            error: notified.error,
          });
        }
      }

      await persistAuditEntry({
        user_id: updated.userId,
        actor_id: adminId,
        action: `support_ticket.${status}`,
        resource_type: 'support_ticket',
        resource_id: ticketId,
        payload: { status, ...(resolutionNote ? { resolutionNote } : {}) },
        ip_address: null,
        user_agent: null,
        status: 'success',
        error_message: null,
      });

      logger.info('Support ticket status updated', { ticketId, adminId, status });
      return successResult(updated);
    } catch (error) {
      logger.error('Failed to update support ticket status', { error, ticketId, status });
      return errorResult('UPDATE_FAILED', 'Could not update the ticket. Please try again.');
    }
  });
}
