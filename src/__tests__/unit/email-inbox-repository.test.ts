// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockListDocuments = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
    contains: jest.fn((...args: any[]) => ({ type: 'contains', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { EmailInboxRepository } = await import('../../repositories/email-inbox-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('EmailInboxRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new EmailInboxRepository();
  });

  describe('create', () => {
    it('should create and return an email', async () => {
      const email = { id: 'email-1', message_id: '<msg1>', user_id: 'u1', from_address: 'a@b.com', to_address: 'c@d.com', subject: 'Test', text_body: 'hi', html_body: '<p>hi</p>', attachments: '[]', is_read: false, is_starred: false, folder: 'inbox', in_reply_to: null, references: null, received_at: '2025-01-01T00:00:00Z' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.create(email);
      expect(result.id).toBe('email-1');
      expect(result.message_id).toBe('<msg1>');
    });
  });

  describe('getById', () => {
    it('should return an email by id', async () => {
      const email = { id: 'email-1', user_id: 'u1', folder: 'inbox' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.getById('email-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('email-1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('email-1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return an email', async () => {
      const email = { id: 'email-1', is_read: true };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.update('email-1', { is_read: true });
      expect(result).not.toBeNull();
      expect(result!.is_read).toBe(true);
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('email-1', { is_read: true });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an email', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('email-1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('email-1');
      expect(result).toBe(false);
    });
  });

  describe('findByMessageId', () => {
    it('should return an email matching message_id', async () => {
      const email = { id: 'email-1', message_id: '<msg1>', user_id: 'u1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(email)], total: 1 });
      const result = await repo.findByMessageId('<msg1>');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('email-1');
    });

    it('should return null when no match', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findByMessageId('<msg1>');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByMessageId('<msg1>');
      expect(result).toBeNull();
    });
  });

  describe('listByUserFolder', () => {
    it('should return paginated emails for user/folder', async () => {
      const emails = [
        toAppwriteDoc({ id: 'e1', user_id: 'u1', folder: 'inbox', text_body: 'hi', html_body: '<p>hi</p>' }),
        toAppwriteDoc({ id: 'e2', user_id: 'u1', folder: 'inbox', text_body: 'yo', html_body: '<p>yo</p>' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: emails, total: 2 });
      const result = await repo.listByUserFolder('u1', 'inbox', 20, 0);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by isRead when provided', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.listByUserFolder('u1', 'inbox', 20, 0, false);
      expect(result.items).toHaveLength(0);
    });

    it('should use default limit and offset', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.listByUserFolder('u1', 'inbox');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getFullEmail', () => {
    it('should return email when user matches', async () => {
      const email = { id: 'email-1', user_id: 'u1', folder: 'inbox' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.getFullEmail('email-1', 'u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('email-1');
    });

    it('should return null when user does not match', async () => {
      const email = { id: 'email-1', user_id: 'u2', folder: 'inbox' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.getFullEmail('email-1', 'u1');
      expect(result).toBeNull();
    });

    it('should return null when email not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getFullEmail('email-1', 'u1');
      expect(result).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('should mark email as read', async () => {
      const email = { id: 'email-1', is_read: true };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.markAsRead('email-1');
      expect(result).not.toBeNull();
      expect(result!.is_read).toBe(true);
    });

    it('should return null on failure', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.markAsRead('email-1');
      expect(result).toBeNull();
    });
  });

  describe('toggleStar', () => {
    it('should toggle star on', async () => {
      const email = { id: 'email-1', is_starred: true };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.toggleStar('email-1', true);
      expect(result).not.toBeNull();
      expect(result!.is_starred).toBe(true);
    });

    it('should toggle star off', async () => {
      const email = { id: 'email-1', is_starred: false };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.toggleStar('email-1', false);
      expect(result).not.toBeNull();
      expect(result!.is_starred).toBe(false);
    });

    it('should return null on failure', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.toggleStar('email-1', true);
      expect(result).toBeNull();
    });
  });

  describe('moveToFolder', () => {
    it('should move email to trash', async () => {
      const email = { id: 'email-1', folder: 'trash' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(email));
      const result = await repo.moveToFolder('email-1', 'trash');
      expect(result).not.toBeNull();
      expect(result!.folder).toBe('trash');
    });

    it('should return null on failure', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.moveToFolder('email-1', 'trash');
      expect(result).toBeNull();
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread emails', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
      const result = await repo.getUnreadCount('u1', 'inbox');
      expect(result).toBe(5);
    });

    it('should use default folder inbox', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 3 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(3);
    });
  });

  describe('findByThread', () => {
    it('should return emails matching thread references', async () => {
      const emails = [
        toAppwriteDoc({ id: 'e1', user_id: 'u1', references: '<msg1>' }),
        toAppwriteDoc({ id: 'e2', user_id: 'u1', references: '<msg1> <msg2>' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: emails, total: 2 });
      const result = await repo.findByThread('u1', '<msg1>');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('e1');
    });

    it('should return empty array when no matches', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findByThread('u1', '<msg1>');
      expect(result).toHaveLength(0);
    });
  });
});
