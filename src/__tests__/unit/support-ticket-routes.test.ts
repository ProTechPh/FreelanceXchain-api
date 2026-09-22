// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitSupportTicket = jest.fn() as any;
const mockListMySupportTickets = jest.fn() as any;
const mockListSupportTickets = jest.fn() as any;
const mockUpdateSupportTicketStatus = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/support-ticket-service.ts'), () => ({
  submitSupportTicket: mockSubmitSupportTicket,
  listMySupportTickets: mockListMySupportTickets,
  listSupportTickets: mockListSupportTickets,
  updateSupportTicketStatus: mockUpdateSupportTicketStatus,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

// Mirrors the real middleware closely enough to prove the admin routes are
// actually gated: a non-admin caller is rejected before the handler runs.
const mockRequireRole = jest.fn((...roles: string[]) => (req: any, res: any, next: any) => {
  if (!roles.includes(req.user?.role)) {
    res.status(403).json({ error: { code: 'AUTH_FORBIDDEN' } });
    return;
  }
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: mockRequireRole,
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const supportTicketRouter = (await import('../../routes/support-ticket-routes.js')).default;
const { canTransition, countByStatus } = await import('../../models/support-ticket.js');

const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });

const EMPTY_STATS = { open: 0, in_progress: 0, resolved: 0, closed: 0 };

const VALID_TICKET = {
  subject: 'Payout never arrived',
  description: 'My milestone was approved four days ago but the funds have not reached my wallet.',
  category: 'payments',
};

/** Signs the next request in as the given role. */
function signInAs(role: string, userId = 'user-1') {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    req.user = { id: userId, userId, email: `${userId}@example.com`, role };
    next();
  });
}

/**
 * Lets a request through without populating `req.user`.
 *
 * The real `authMiddleware` never does this — it sends a 401 itself — so this
 * exercises the handlers' own defensive guard, which is what stops a future
 * middleware change from silently handing an anonymous request to the service.
 */
function signInAsNobody(user?: Record<string, unknown>) {
  mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
    if (user) req.user = user;
    next();
  });
}

describe('Support Ticket Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    signInAs('freelancer');
    app = express();
    app.use(express.json());
    app.use('/api/support-tickets', supportTicketRouter);
  });

  describe('POST /', () => {
    it('creates a ticket and echoes the submitter role', async () => {
      mockSubmitSupportTicket.mockResolvedValue(ok({ id: 'ticket-1', status: 'open' }));

      const res = await request(app).post('/api/support-tickets').send(VALID_TICKET);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'ticket-1', status: 'open' });
      expect(mockSubmitSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', userRole: 'freelancer', category: 'payments' })
      );
    });

    // Employers and freelancers share one flow; the only difference that reaches
    // the service is the role recorded on the ticket.
    it('accepts a ticket from an employer on the same route', async () => {
      signInAs('employer', 'user-2');
      mockSubmitSupportTicket.mockResolvedValue(ok({ id: 'ticket-2', status: 'open' }));

      const res = await request(app).post('/api/support-tickets').send(VALID_TICKET);

      expect(res.status).toBe(201);
      expect(mockSubmitSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2', userRole: 'employer' })
      );
    });

    it('rejects an unknown category before reaching the service', async () => {
      const res = await request(app)
        .post('/api/support-tickets')
        .send({ ...VALID_TICKET, category: 'nonsense' });

      expect(res.status).toBe(400);
      expect(mockSubmitSupportTicket).not.toHaveBeenCalled();
    });

    it('rejects a description that is too short to act on', async () => {
      const res = await request(app)
        .post('/api/support-tickets')
        .send({ ...VALID_TICKET, description: 'broken' });

      expect(res.status).toBe(400);
      expect(mockSubmitSupportTicket).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller rather than reaching the service', async () => {
      signInAsNobody();

      const res = await request(app).post('/api/support-tickets').send(VALID_TICKET);

      expect(res.status).toBe(401);
      expect(mockSubmitSupportTicket).not.toHaveBeenCalled();
    });

    // The role is only ever recorded on the ticket, so a session without one
    // still files successfully rather than being turned away.
    it('records an unknown role when the session carries none', async () => {
      signInAsNobody({ userId: 'user-7' });
      mockSubmitSupportTicket.mockResolvedValue(ok({ id: 'ticket-7' }));

      const res = await request(app).post('/api/support-tickets').send(VALID_TICKET);

      expect(res.status).toBe(201);
      expect(mockSubmitSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-7', userRole: 'unknown' })
      );
    });

    it('returns 429 once the open-ticket allowance is used up', async () => {
      mockSubmitSupportTicket.mockResolvedValue(
        fail('TOO_MANY_OPEN_TICKETS', 'You already have 5 tickets awaiting a reply.')
      );

      const res = await request(app).post('/api/support-tickets').send(VALID_TICKET);

      expect(res.status).toBe(429);
    });
  });

  describe('GET /me', () => {
    it('returns only the caller’s own tickets', async () => {
      mockListMySupportTickets.mockResolvedValue(ok([{ id: 'ticket-1' }]));

      const res = await request(app).get('/api/support-tickets/me');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'ticket-1' }]);
      expect(mockListMySupportTickets).toHaveBeenCalledWith('user-1');
    });

    it('refuses an unauthenticated caller', async () => {
      signInAsNobody();

      const res = await request(app).get('/api/support-tickets/me');

      expect(res.status).toBe(401);
      expect(mockListMySupportTickets).not.toHaveBeenCalled();
    });

    it('surfaces a read failure as a 500', async () => {
      mockListMySupportTickets.mockResolvedValue(
        fail('LIST_FAILED', 'Could not load your support tickets.')
      );

      const res = await request(app).get('/api/support-tickets/me');

      expect(res.status).toBe(500);
    });
  });

  describe('admin routes', () => {
    it('refuses the queue to a non-admin', async () => {
      const res = await request(app).get('/api/support-tickets/admin');

      expect(res.status).toBe(403);
      expect(mockListSupportTickets).not.toHaveBeenCalled();
    });

    it('refuses a status change to a non-admin', async () => {
      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'resolved', resolutionNote: 'Sorted.' });

      expect(res.status).toBe(403);
      expect(mockUpdateSupportTicketStatus).not.toHaveBeenCalled();
    });

    it('passes status and category filters through for an admin', async () => {
      signInAs('admin');
      mockListSupportTickets.mockResolvedValue(ok({ tickets: [], total: 0, stats: EMPTY_STATS }));

      const res = await request(app)
        .get('/api/support-tickets/admin')
        .query({ status: 'open', category: 'payments' });

      expect(res.status).toBe(200);
      expect(mockListSupportTickets).toHaveBeenCalledWith({ status: 'open', category: 'payments' });
    });

    // Rows and counts arrive together so the page renders from one round trip.
    it('returns the rows and every filter’s count in one response', async () => {
      signInAs('admin');
      mockListSupportTickets.mockResolvedValue(
        ok({
          tickets: [{ id: 'ticket-1' }],
          total: 1,
          stats: { open: 3, in_progress: 1, resolved: 12, closed: 2 },
        })
      );

      const res = await request(app).get('/api/support-tickets/admin').query({ status: 'open' });

      expect(res.status).toBe(200);
      expect(res.body.tickets).toHaveLength(1);
      expect(res.body.stats.open).toBe(3);
      expect(res.body.stats.resolved).toBe(12);
    });

    it('passes no filters through when the query is empty', async () => {
      signInAs('admin');
      mockListSupportTickets.mockResolvedValue(ok({ tickets: [], total: 0, stats: EMPTY_STATS }));

      const res = await request(app).get('/api/support-tickets/admin');

      expect(res.status).toBe(200);
      expect(mockListSupportTickets).toHaveBeenCalledWith({});
    });

    it('surfaces a queue read failure as a 500', async () => {
      signInAs('admin');
      mockListSupportTickets.mockResolvedValue(fail('LIST_FAILED', 'Could not load support tickets.'));

      const res = await request(app).get('/api/support-tickets/admin');

      expect(res.status).toBe(500);
    });

    // requireRole passes on the role alone, so the handler checks the id too.
    it('refuses a session that carries a role but no user id', async () => {
      signInAsNobody({ role: 'admin' });

      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'closed' });

      expect(res.status).toBe(401);
      expect(mockUpdateSupportTicketStatus).not.toHaveBeenCalled();
    });

    it('resolves a ticket with a note', async () => {
      signInAs('admin', 'admin-1');
      mockUpdateSupportTicketStatus.mockResolvedValue(ok({ id: 'ticket-1', status: 'resolved' }));

      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'resolved', resolutionNote: 'Your payout cleared on the 20th.' });

      expect(res.status).toBe(200);
      expect(mockUpdateSupportTicketStatus).toHaveBeenCalledWith({
        ticketId: 'ticket-1',
        adminId: 'admin-1',
        status: 'resolved',
        resolutionNote: 'Your payout cleared on the 20th.',
      });
    });

    it('surfaces a missing resolution note as a 400', async () => {
      signInAs('admin');
      mockUpdateSupportTicketStatus.mockResolvedValue(
        fail('RESOLUTION_REQUIRED', 'A resolution note is required when resolving a ticket.')
      );

      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'resolved' });

      expect(res.status).toBe(400);
    });

    it('surfaces an illegal transition as a 400', async () => {
      signInAs('admin');
      mockUpdateSupportTicketStatus.mockResolvedValue(
        fail('INVALID_TRANSITION', 'A resolved ticket cannot be moved to in progress.')
      );

      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
    });

    it('rejects an unknown status before reaching the service', async () => {
      signInAs('admin');

      const res = await request(app)
        .patch('/api/support-tickets/admin/ticket-1/status')
        .send({ status: 'reopened' });

      expect(res.status).toBe(400);
      expect(mockUpdateSupportTicketStatus).not.toHaveBeenCalled();
    });

    it('surfaces a missing ticket as a 404', async () => {
      signInAs('admin');
      mockUpdateSupportTicketStatus.mockResolvedValue(
        fail('TICKET_NOT_FOUND', 'Support ticket not found.')
      );

      const res = await request(app)
        .patch('/api/support-tickets/admin/ghost/status')
        .send({ status: 'closed' });

      expect(res.status).toBe(404);
    });
  });
});

describe('canTransition', () => {
  it('walks a ticket forward through the lifecycle', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'resolved')).toBe(true);
    // Skipping the middle is allowed: a one-line answer needs no "start work".
    expect(canTransition('open', 'resolved')).toBe(true);
  });

  it('lets anything still active be closed', () => {
    expect(canTransition('open', 'closed')).toBe(true);
    expect(canTransition('in_progress', 'closed')).toBe(true);
  });

  it('never reopens a terminal ticket', () => {
    expect(canTransition('resolved', 'open')).toBe(false);
    expect(canTransition('resolved', 'in_progress')).toBe(false);
    expect(canTransition('closed', 'open')).toBe(false);
    expect(canTransition('closed', 'resolved')).toBe(false);
  });

  it('never moves backwards or to itself', () => {
    expect(canTransition('in_progress', 'open')).toBe(false);
    expect(canTransition('open', 'open')).toBe(false);
    expect(canTransition('resolved', 'resolved')).toBe(false);
  });
});

describe('countByStatus', () => {
  it('tallies every status and reports zero for the empty ones', () => {
    expect(
      countByStatus([
        { status: 'open' },
        { status: 'open' },
        { status: 'resolved' },
        { status: 'in_progress' },
      ])
    ).toEqual({ open: 2, in_progress: 1, resolved: 1, closed: 0 });
  });

  it('returns all zeroes for an empty queue rather than an empty object', () => {
    // The stat cards read these keys directly, so a missing one would render
    // "undefined" instead of "0".
    expect(countByStatus([])).toEqual({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  });
});
