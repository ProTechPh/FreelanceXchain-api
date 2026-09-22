import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { SupportTicketRepository } = await import('../../repositories/support-ticket-repository.js');

const doc = (over: Record<string, unknown> = {}) => ({
  $id: 'ticket-1',
  user_id: 'user-1',
  user_role: 'freelancer',
  subject: 'Payout never arrived',
  description: 'My milestone was approved four days ago but the funds have not reached my wallet.',
  category: 'payments',
  status: 'open',
  $createdAt: '2026-09-20T10:00:00.000Z',
  $updatedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

describe('SupportTicketRepository', () => {
  let repository: InstanceType<typeof SupportTicketRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new SupportTicketRepository();
  });

  describe('listByUser', () => {
    it('maps every row to the domain model', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        total: 2,
        documents: [doc(), doc({ $id: 'ticket-2', status: 'resolved', resolution_note: 'Sorted.' })],
      });

      const result = await repository.listByUser('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'ticket-1',
        userId: 'user-1',
        userRole: 'freelancer',
        category: 'payments',
        status: 'open',
      });
      // The admin's reply is what the submitter comes back to read.
      expect(result[1]).toMatchObject({ id: 'ticket-2', status: 'resolved', resolutionNote: 'Sorted.' });
    });

    it('returns an empty list when the user has never filed one', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      expect(await repository.listByUser('nobody')).toEqual([]);
    });

    it('scopes the query to the caller', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      await repository.listByUser('user-9');

      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries).toEqual(expect.arrayContaining([expect.stringContaining('user_id')]));
    });
  });

  describe('countActiveByUser', () => {
    it('reports how many tickets are still awaiting a reply', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 3, documents: [] });

      expect(await repository.countActiveByUser('user-1')).toBe(3);
    });

    // Only open and in_progress count against the cap; terminal tickets do not.
    it('asks only for the statuses that still count against the cap', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      await repository.countActiveByUser('user-1');

      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries.some((q: string) => q.includes('open') && q.includes('in_progress'))).toBe(true);
    });
  });

  describe('fetchAllForQueue', () => {
    it('maps every ticket in the queue', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        total: 2,
        documents: [doc(), doc({ $id: 'ticket-2', status: 'closed' })],
      });

      const result = await repository.fetchAllForQueue();

      expect(result).toHaveLength(2);
      expect(result.map(t => t.status)).toEqual(['open', 'closed']);
    });

    it('returns an empty queue rather than throwing', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      expect(await repository.fetchAllForQueue()).toEqual([]);
    });
  });

  describe('createTicket', () => {
    it('returns the stored ticket as a domain model', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce(doc());

      const result = await repository.createTicket({
        user_id: 'user-1',
        user_role: 'freelancer',
        subject: 'Payout never arrived',
        description: 'My milestone was approved four days ago but the funds have not reached my wallet.',
        category: 'payments',
        status: 'open',
      });

      expect(result).toMatchObject({ id: 'ticket-1', status: 'open', userId: 'user-1' });
    });
  });

  describe('getTicketById', () => {
    it('maps the ticket when it exists', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce(doc());

      expect(await repository.getTicketById('ticket-1')).toMatchObject({ id: 'ticket-1' });
    });

    it('returns null when it does not', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));

      expect(await repository.getTicketById('ghost')).toBeNull();
    });
  });

  describe('updateTicket', () => {
    it('maps the updated ticket, carrying the reviewer stamps', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce(
        doc({
          status: 'resolved',
          resolution_note: 'Your payout cleared on the 20th.',
          resolved_by: 'admin-1',
          resolved_at: '2026-09-21T09:00:00.000Z',
        })
      );

      const result = await repository.updateTicket('ticket-1', { status: 'resolved' });

      expect(result).toMatchObject({
        status: 'resolved',
        resolutionNote: 'Your payout cleared on the 20th.',
        resolvedBy: 'admin-1',
        resolvedAt: '2026-09-21T09:00:00.000Z',
      });
    });

    it('returns null when the row is gone', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));

      expect(await repository.updateTicket('ghost', { status: 'closed' })).toBeNull();
    });
  });
});
