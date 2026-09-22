/**
 * Customer support tickets — a user reporting a problem they need answered.
 *
 * Deliberately separate from `AppRating` in ./app-rating.ts, which is one-way
 * feedback about the platform that nobody replies to, and from `Dispute` in
 * ./dispute.ts, which is a disagreement between two users over money on a
 * contract. A ticket has exactly one submitter and one responder: the admin.
 *
 * Freelancers and employers use the identical flow — `user_role` is recorded so
 * the admin queue can show who filed it, never to gate behaviour.
 */

/** What the ticket is about. Chosen by the submitter, used to route attention. */
export const SUPPORT_TICKET_CATEGORIES = [
  'account',
  'verification',
  'payments',
  'contracts',
  'disputes',
  'technical',
  'other',
] as const;

export type SupportTicketCategory = typeof SUPPORT_TICKET_CATEGORIES[number];

export function isSupportTicketCategory(value: unknown): value is SupportTicketCategory {
  return typeof value === 'string' && (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Ticket lifecycle.
 *
 * `resolved` means an admin answered it; `closed` means it was ended without an
 * answer (duplicate, withdrawn, not actionable). Both are terminal, and the
 * distinction matters to the submitter — one comes with a note to read.
 */
export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === 'string' && (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}

/** Statuses that still count against the submitter's open-ticket allowance. */
export const ACTIVE_SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = ['open', 'in_progress'];

export const MIN_SUBJECT_LENGTH = 5;
export const MAX_SUBJECT_LENGTH = 120;
export const MIN_DESCRIPTION_LENGTH = 20;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_RESOLUTION_LENGTH = 2000;

/**
 * How many unanswered tickets one user may have at a time.
 *
 * Not a punishment — it stops a single frustrated user burying the queue for
 * everyone else, and someone with five open reports needs a reply more than
 * they need a sixth form.
 */
export const MAX_OPEN_TICKETS_PER_USER = 5;

/**
 * Whether a status change is allowed.
 *
 * Forward only: open -> in_progress -> resolved. Anything still active may be
 * closed. Terminal states never reopen — a user with a new problem files a new
 * ticket, which keeps the admin queue's counts honest.
 *
 * Pure, so the rule can be unit-tested without Appwrite.
 */
export function canTransition(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  if (from === to) return false;
  if (from === 'resolved' || from === 'closed') return false;
  if (to === 'open') return false;
  if (to === 'closed') return true;
  if (from === 'open') return to === 'in_progress' || to === 'resolved';
  // from === 'in_progress'
  return to === 'resolved';
}

/**
 * Tally tickets per status, for the admin queue's filter cards.
 *
 * Always returns every status, so a bucket with nothing in it renders "0"
 * rather than "undefined". Pure, so the admin queue can derive its counts from
 * one read instead of spending a database round trip per card.
 */
export function countByStatus(tickets: readonly { status: SupportTicketStatus }[]): SupportTicketStats {
  const stats = SUPPORT_TICKET_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as SupportTicketStats
  );
  for (const ticket of tickets) {
    if (ticket.status in stats) stats[ticket.status] += 1;
  }
  return stats;
}

export type SupportTicket = {
  id: string;
  userId: string;
  userRole: string;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  /** The admin's answer. Present once resolved; the submitter reads this. */
  resolutionNote?: string | undefined;
  resolvedBy?: string | undefined;
  resolvedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketEntity = {
  id: string;
  user_id: string;
  user_role: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  resolution_note?: string | undefined;
  resolved_by?: string | undefined;
  resolved_at?: string | undefined;
  created_at: string;
  updated_at: string;
};

/** A row as the admin queue shows it: the ticket plus who filed it. */
export type AdminSupportTicket = SupportTicket & {
  userName: string;
  userEmail: string;
};

/** Counts per status, for the admin queue's filter cards. */
export type SupportTicketStats = Record<SupportTicketStatus, number>;

export type SubmitSupportTicketInput = {
  userId: string;
  userRole: string;
  subject: string;
  description: string;
  category: SupportTicketCategory;
};

export type UpdateSupportTicketStatusInput = {
  ticketId: string;
  adminId: string;
  status: SupportTicketStatus;
  resolutionNote?: string | undefined;
};
