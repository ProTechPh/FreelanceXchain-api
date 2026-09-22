// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

/** In-memory stand-in for the collection, so the service runs for real. */
const store = new Map<string, any>();
let idCounter = 0;

const mockTicketRepo = {
  listByUser: jest.fn<any>(async (userId: string) =>
    [...store.values()]
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  ),
  countActiveByUser: jest.fn<any>(async (userId: string) =>
    [...store.values()].filter(
      t => t.userId === userId && (t.status === 'open' || t.status === 'in_progress')
    ).length
  ),
  fetchAllForQueue: jest.fn<any>(async () =>
    [...store.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  ),
  createTicket: jest.fn<any>(async (entity: any) => {
    idCounter += 1;
    const now = new Date().toISOString();
    const ticket = {
      id: `ticket-${idCounter}`,
      userId: entity.user_id,
      userRole: entity.user_role,
      subject: entity.subject,
      description: entity.description,
      category: entity.category,
      status: entity.status,
      createdAt: now,
      updatedAt: now,
    };
    store.set(ticket.id, ticket);
    return ticket;
  }),
  getTicketById: jest.fn<any>(async (id: string) => store.get(id) ?? null),
  updateTicket: jest.fn<any>(async (id: string, patch: any) => {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      status: patch.status ?? existing.status,
      ...(patch.resolution_note ? { resolutionNote: patch.resolution_note } : {}),
      ...(patch.resolved_by ? { resolvedBy: patch.resolved_by } : {}),
      ...(patch.resolved_at ? { resolvedAt: patch.resolved_at } : {}),
      updatedAt: new Date().toISOString(),
    };
    store.set(id, updated);
    return updated;
  }),
};

const mockUserRepo = {
  getUsersByIds: jest.fn<any>(async (ids: string[]) =>
    ids.map(id => ({ id, name: `User ${id}`, email: `${id}@example.com`, role: 'freelancer' }))
  ),
};

const mockNotify = jest.fn<any>(async () => ({ success: true, data: { id: 'notif-1' } }));
const mockPersistAudit = jest.fn<any>(async () => undefined);

jest.unstable_mockModule(resolveModule('src/repositories/support-ticket-repository.ts'), () => ({
  supportTicketRepository: mockTicketRepo,
  SupportTicketRepository: class {},
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
  UserRepository: class {},
}));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifySupportTicketResolved: mockNotify,
}));

jest.unstable_mockModule(resolveModule('src/utils/admin-audit.ts'), () => ({
  persistAuditEntry: mockPersistAudit,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), security: jest.fn() },
}));

const importService = () => import(resolveModule('src/services/support-ticket-service.ts'));

const baseInput = {
  userId: 'user-1',
  userRole: 'freelancer',
  subject: 'Payout never arrived',
  description: 'My milestone was approved four days ago but the funds have not reached my wallet.',
  category: 'payments',
};

/** Puts a ticket straight into the store, bypassing validation. */
function seed(over: Record<string, unknown> = {}) {
  idCounter += 1;
  const now = new Date().toISOString();
  const ticket = {
    id: `ticket-${idCounter}`,
    userId: 'user-1',
    userRole: 'freelancer',
    subject: 'Seeded ticket',
    description: 'Seeded description long enough to be valid.',
    category: 'other',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
  store.set(ticket.id, ticket);
  return ticket;
}

beforeEach(() => {
  store.clear();
  idCounter = 0;
  jest.clearAllMocks();
});

describe('submitSupportTicket', () => {
  it('creates an open ticket and records the submitter role', async () => {
    const { submitSupportTicket } = await importService();

    const result = await submitSupportTicket(baseInput);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      userId: 'user-1',
      userRole: 'freelancer',
      category: 'payments',
      status: 'open',
    });
  });

  // Freelancers and employers share one flow; only the recorded role differs.
  it('accepts an employer through the identical path', async () => {
    const { submitSupportTicket } = await importService();

    const result = await submitSupportTicket({ ...baseInput, userId: 'user-2', userRole: 'employer' });

    expect(result.success).toBe(true);
    expect(result.data.userRole).toBe('employer');
  });

  it('trims the subject and description before storing them', async () => {
    const { submitSupportTicket } = await importService();

    const result = await submitSupportTicket({
      ...baseInput,
      subject: '   Payout never arrived   ',
      description: `   ${baseInput.description}   `,
    });

    expect(result.data.subject).toBe('Payout never arrived');
    expect(result.data.description).toBe(baseInput.description);
  });

  it('rejects an unknown category', async () => {
    const { submitSupportTicket } = await importService();

    const result = await submitSupportTicket({ ...baseInput, category: 'made_up' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_CATEGORY');
  });

  it.each([['too short', 'hi'], ['too long', 'x'.repeat(121)]])(
    'rejects a subject that is %s',
    async (_label, subject) => {
      const { submitSupportTicket } = await importService();

      const result = await submitSupportTicket({ ...baseInput, subject });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_SUBJECT');
    }
  );

  it.each([['too short', 'broken'], ['too long', 'x'.repeat(4001)]])(
    'rejects a description that is %s',
    async (_label, description) => {
      const { submitSupportTicket } = await importService();

      const result = await submitSupportTicket({ ...baseInput, description });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_DESCRIPTION');
    }
  );

  it('refuses a sixth unanswered ticket', async () => {
    const { submitSupportTicket } = await importService();
    for (let i = 0; i < 5; i++) seed({ status: 'open' });

    const result = await submitSupportTicket(baseInput);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TOO_MANY_OPEN_TICKETS');
  });

  // The cap counts what is still waiting on a reply, not what was ever filed.
  it('lets a user file again once their earlier tickets are terminal', async () => {
    const { submitSupportTicket } = await importService();
    for (let i = 0; i < 5; i++) seed({ status: 'resolved' });

    const result = await submitSupportTicket(baseInput);

    expect(result.success).toBe(true);
  });

  it('counts in_progress against the cap as well as open', async () => {
    const { submitSupportTicket } = await importService();
    for (let i = 0; i < 5; i++) seed({ status: 'in_progress' });

    const result = await submitSupportTicket(baseInput);

    expect(result.error.code).toBe('TOO_MANY_OPEN_TICKETS');
  });

  it('does not count another user’s tickets against this user', async () => {
    const { submitSupportTicket } = await importService();
    for (let i = 0; i < 5; i++) seed({ userId: 'someone-else', status: 'open' });

    const result = await submitSupportTicket(baseInput);

    expect(result.success).toBe(true);
  });

  it('returns SUBMIT_FAILED when the write throws', async () => {
    const { submitSupportTicket } = await importService();
    mockTicketRepo.createTicket.mockRejectedValueOnce(new Error('appwrite down'));

    const result = await submitSupportTicket(baseInput);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('SUBMIT_FAILED');
  });
});

describe('listMySupportTickets', () => {
  it('returns only the caller’s tickets', async () => {
    const { listMySupportTickets } = await importService();
    seed({ userId: 'user-1' });
    seed({ userId: 'other' });

    const result = await listMySupportTickets('user-1');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].userId).toBe('user-1');
  });

  it('returns LIST_FAILED when the read throws', async () => {
    const { listMySupportTickets } = await importService();
    mockTicketRepo.listByUser.mockRejectedValueOnce(new Error('appwrite down'));

    const result = await listMySupportTickets('user-1');

    expect(result.error.code).toBe('LIST_FAILED');
  });
});

describe('listSupportTickets', () => {
  it('reads the queue once and returns rows plus every count', async () => {
    const { listSupportTickets } = await importService();
    seed({ status: 'open' });
    seed({ status: 'open' });
    seed({ status: 'resolved' });

    const result = await listSupportTickets({ status: 'open' });

    expect(result.success).toBe(true);
    expect(result.data.tickets).toHaveLength(2);
    expect(result.data.total).toBe(2);
    // Counts describe the whole queue, not the filtered slice.
    expect(result.data.stats).toEqual({ open: 2, in_progress: 0, resolved: 1, closed: 0 });
    expect(mockTicketRepo.fetchAllForQueue).toHaveBeenCalledTimes(1);
  });

  it('returns every ticket when no filter is given', async () => {
    const { listSupportTickets } = await importService();
    seed({ status: 'open' });
    seed({ status: 'closed' });

    const result = await listSupportTickets();

    expect(result.data.tickets).toHaveLength(2);
  });

  it('filters by category', async () => {
    const { listSupportTickets } = await importService();
    seed({ category: 'payments' });
    seed({ category: 'technical' });

    const result = await listSupportTickets({ category: 'payments' });

    expect(result.data.tickets).toHaveLength(1);
    expect(result.data.tickets[0].category).toBe('payments');
  });

  it('attributes each row to its submitter', async () => {
    const { listSupportTickets } = await importService();
    seed({ userId: 'user-9' });

    const result = await listSupportTickets();

    expect(result.data.tickets[0]).toMatchObject({
      userName: 'User user-9',
      userEmail: 'user-9@example.com',
    });
  });

  // A deleted account still leaves its ticket behind; the row must survive.
  it('labels a ticket whose submitter no longer exists', async () => {
    const { listSupportTickets } = await importService();
    seed({ userId: 'ghost' });
    mockUserRepo.getUsersByIds.mockResolvedValueOnce([]);

    const result = await listSupportTickets();

    expect(result.data.tickets[0]).toMatchObject({
      userName: 'Deleted user',
      userEmail: '—',
    });
  });

  it('returns LIST_FAILED when the read throws', async () => {
    const { listSupportTickets } = await importService();
    mockTicketRepo.fetchAllForQueue.mockRejectedValueOnce(new Error('appwrite down'));

    const result = await listSupportTickets();

    expect(result.error.code).toBe('LIST_FAILED');
  });
});

describe('updateSupportTicketStatus', () => {
  const resolve = (over = {}) => ({
    ticketId: 'ticket-1',
    adminId: 'admin-1',
    status: 'resolved',
    resolutionNote: 'Your payout cleared on the 20th.',
    ...over,
  });

  it('resolves a ticket, stamps the reviewer and notifies the submitter', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Your payout cleared on the 20th.',
      resolvedBy: 'admin-1',
    });
    expect(result.data.resolvedAt).toEqual(expect.any(String));
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', ticketId: 'ticket-1' })
    );
    expect(mockPersistAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_ticket.resolved', actor_id: 'admin-1' })
    );
  });

  it('moves an open ticket to in_progress without notifying anyone', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve({ status: 'in_progress', resolutionNote: undefined }));

    expect(result.data.status).toBe('in_progress');
    expect(result.data.resolvedBy).toBeUndefined();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  // Closing ends a ticket without an answer, so there is nothing to announce.
  it('closes a ticket without notifying the submitter', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve({ status: 'closed', resolutionNote: undefined }));

    expect(result.data.status).toBe('closed');
    expect(result.data.resolvedBy).toBe('admin-1');
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('refuses to resolve without a note the submitter can read', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve({ resolutionNote: '   ' }));

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('RESOLUTION_REQUIRED');
  });

  it('rejects a note over the length limit', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve({ resolutionNote: 'x'.repeat(2001) }));

    expect(result.error.code).toBe('RESOLUTION_TOO_LONG');
  });

  it('rejects an unknown status', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });

    const result = await updateSupportTicketStatus(resolve({ status: 'reopened' }));

    expect(result.error.code).toBe('INVALID_STATUS');
  });

  it('returns TICKET_NOT_FOUND for an id that does not exist', async () => {
    const { updateSupportTicketStatus } = await importService();

    const result = await updateSupportTicketStatus(resolve({ ticketId: 'ghost' }));

    expect(result.error.code).toBe('TICKET_NOT_FOUND');
  });

  it('refuses to reopen a resolved ticket', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'resolved' });

    const result = await updateSupportTicketStatus(resolve({ status: 'in_progress', resolutionNote: undefined }));

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_TRANSITION');
  });

  it('returns UPDATE_FAILED when the write comes back empty', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });
    mockTicketRepo.updateTicket.mockResolvedValueOnce(null);

    const result = await updateSupportTicketStatus(resolve());

    expect(result.error.code).toBe('UPDATE_FAILED');
  });

  it('returns UPDATE_FAILED when the write throws', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });
    mockTicketRepo.updateTicket.mockRejectedValueOnce(new Error('appwrite down'));

    const result = await updateSupportTicketStatus(resolve());

    expect(result.error.code).toBe('UPDATE_FAILED');
  });

  // Both side effects are best-effort: neither may undo a decision already written.
  it('still resolves when the notification fails', async () => {
    const { updateSupportTicketStatus } = await importService();
    seed({ status: 'open' });
    mockNotify.mockResolvedValueOnce({ success: false, error: { code: 'CREATE_FAILED', message: 'nope' } });

    const result = await updateSupportTicketStatus(resolve());

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('resolved');
  });
});
