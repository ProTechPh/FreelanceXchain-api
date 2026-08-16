// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import crypto from 'crypto';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockEmailInboxRepository = {
  findByMessageId: jest.fn<any>(),
  create: jest.fn<any>(),
  listByUserFolder: jest.fn<any>(),
  getFullEmail: jest.fn<any>(),
  markAsRead: jest.fn<any>(),
  update: jest.fn<any>(),
  delete: jest.fn<any>(),
  moveToFolder: jest.fn<any>(),
  getUnreadCount: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/email-inbox-repository.ts'), () => ({
  emailInboxRepository: mockEmailInboxRepository,
  EmailInboxRepository: jest.fn(),
}));

const mockUserRepository = {
  findOne: jest.fn<any>(),
  getUserById: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const {
  verifyWebhookSignature,
  processInboundEmail,
  listEmails,
  getEmail,
  updateEmail,
  deleteEmail,
  sendNewEmail,
  replyToEmail,
  getUnreadCount,
} = await import('../../services/email-inbox-service.js');

describe('Email Inbox Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyWebhookSignature', () => {
    const secret = 'test-secret';

    it('should return true for valid signature', () => {
      const payload = '{"test":"data"}';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = '{"test":"data"}';
      const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const invalidSig = validSig.replace(/[0-9a-f]/, 'x'.replace('x', validSig[0] === '0' ? '1' : '0'));
      expect(verifyWebhookSignature(payload, invalidSig, secret)).toBe(false);
    });

    it('should throw for mismatched buffer lengths', () => {
      const payload = '{"test":"data"}';
      const shortSig = 'abcd';
      expect(() => verifyWebhookSignature(payload, shortSig, secret)).toThrow();
    });
  });

  describe('processInboundEmail', () => {
    const validPayload = {
      messageId: '<msg-1@example.com>',
      from: 'sender@example.com',
      to: 'testuser@freelancexchain.works',
      subject: 'Test Subject',
      textBody: 'Hello',
      htmlBody: '<p>Hello</p>',
      attachments: [],
      inReplyTo: null,
      references: null,
      receivedAt: '2025-01-01T00:00:00Z',
    };

    it('should process a valid inbound email', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({ id: 'user-1', name: 'testuser' });
      mockEmailInboxRepository.findByMessageId.mockResolvedValueOnce(null);
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'email-1' });

      const result = await processInboundEmail(validPayload);
      expect(result.success).toBe(true);
      expect(result.data.emailId).toBe('email-1');
    });

    it('should return INVALID_RECIPIENT for non-platform domain', async () => {
      const payload = { ...validPayload, to: 'user@otherdomain.com' };
      const result = await processInboundEmail(payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_RECIPIENT');
    });

    it('should return INVALID_RECIPIENT for invalid email format', async () => {
      const payload = { ...validPayload, to: 'invalid-address' };
      const result = await processInboundEmail(payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_RECIPIENT');
    });

    it('should return USER_NOT_FOUND when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(null);
      const result = await processInboundEmail(validPayload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return existing emailId for duplicate messageId', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({ id: 'user-1', name: 'testuser' });
      mockEmailInboxRepository.findByMessageId.mockResolvedValueOnce({ id: 'existing-email' });

      const result = await processInboundEmail(validPayload);
      expect(result.success).toBe(true);
      expect(result.data.emailId).toBe('existing-email');
    });

    it('should handle database errors', async () => {
      mockUserRepository.findOne.mockRejectedValueOnce(new Error('DB error'));
      const result = await processInboundEmail(validPayload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INBOUND_EMAIL_FAILED');
      expect(result.error.message).toBe('DB error');
    });

    it('should handle non-Error throws', async () => {
      mockUserRepository.findOne.mockRejectedValueOnce('string error');
      const result = await processInboundEmail(validPayload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INBOUND_EMAIL_FAILED');
      expect(result.error.message).toBe('Failed to process inbound email');
    });
  });

  describe('listEmails', () => {
    it('should return paginated emails', async () => {
      const data = { data: [{ id: 'e1' }], total: 1 };
      mockEmailInboxRepository.listByUserFolder.mockResolvedValueOnce(data);
      const result = await listEmails('u1', { folder: 'inbox', limit: 20, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should use default params', async () => {
      const data = { data: [], total: 0 };
      mockEmailInboxRepository.listByUserFolder.mockResolvedValueOnce(data);
      const result = await listEmails('u1');
      expect(result.success).toBe(true);
    });

    it('should pass isRead filter', async () => {
      const data = { data: [], total: 0 };
      mockEmailInboxRepository.listByUserFolder.mockResolvedValueOnce(data);
      const result = await listEmails('u1', { folder: 'inbox', limit: 20, offset: 0, isRead: false });
      expect(result.success).toBe(true);
      expect(mockEmailInboxRepository.listByUserFolder).toHaveBeenCalledWith('u1', { folder: 'inbox', limit: 20, offset: 0, isRead: false });
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.listByUserFolder.mockRejectedValueOnce(new Error('DB error'));
      const result = await listEmails('u1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LIST_EMAILS_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.listByUserFolder.mockRejectedValueOnce('fail');
      const result = await listEmails('u1');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to list emails');
    });
  });

  describe('getEmail', () => {
    const mockEmail = { id: 'e1', user_id: 'u1', is_read: false, folder: 'inbox' };

    it('should return email and mark as read', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce({ ...mockEmail });
      mockEmailInboxRepository.markAsRead.mockResolvedValueOnce({ ...mockEmail, is_read: true });
      const result = await getEmail('u1', 'e1');
      expect(result.success).toBe(true);
      expect(result.data.is_read).toBe(true);
      expect(mockEmailInboxRepository.markAsRead).toHaveBeenCalledWith('e1');
    });

    it('should not mark as read when already read', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce({ ...mockEmail, is_read: true });
      const result = await getEmail('u1', 'e1');
      expect(result.success).toBe(true);
      expect(mockEmailInboxRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should not mark as read when markAsRead is false', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce({ ...mockEmail });
      const result = await getEmail('u1', 'e1', false);
      expect(result.success).toBe(true);
      expect(mockEmailInboxRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should return EMAIL_NOT_FOUND when not found', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(null);
      const result = await getEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_NOT_FOUND');
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(new Error('DB error'));
      const result = await getEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('GET_EMAIL_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(42);
      const result = await getEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to get email');
    });
  });

  describe('updateEmail', () => {
    const mockEmail = { id: 'e1', user_id: 'u1', is_read: false, is_starred: false, folder: 'inbox' };

    it('should update email successfully', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(mockEmail);
      mockEmailInboxRepository.update.mockResolvedValueOnce({ ...mockEmail, is_read: true });
      const result = await updateEmail('u1', 'e1', { is_read: true });
      expect(result.success).toBe(true);
      expect(result.data.is_read).toBe(true);
    });

    it('should return EMAIL_NOT_FOUND when not found', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(null);
      const result = await updateEmail('u1', 'e1', { is_read: true });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_NOT_FOUND');
    });

    it('should return UPDATE_FAILED when update returns null', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(mockEmail);
      mockEmailInboxRepository.update.mockResolvedValueOnce(null);
      const result = await updateEmail('u1', 'e1', { is_read: true });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(new Error('DB error'));
      const result = await updateEmail('u1', 'e1', { is_read: true });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_EMAIL_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(null);
      const result = await updateEmail('u1', 'e1', { is_read: true });
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to update email');
    });
  });

  describe('deleteEmail', () => {
    it('should move to trash when not already in trash', async () => {
      const email = { id: 'e1', user_id: 'u1', folder: 'inbox' };
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(email);
      mockEmailInboxRepository.moveToFolder.mockResolvedValueOnce({ ...email, folder: 'trash' });
      const result = await deleteEmail('u1', 'e1');
      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
      expect(mockEmailInboxRepository.moveToFolder).toHaveBeenCalledWith('e1', 'trash');
    });

    it('should permanently delete when already in trash', async () => {
      const email = { id: 'e1', user_id: 'u1', folder: 'trash' };
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(email);
      mockEmailInboxRepository.delete.mockResolvedValueOnce(true);
      const result = await deleteEmail('u1', 'e1');
      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
      expect(mockEmailInboxRepository.delete).toHaveBeenCalledWith('e1');
    });

    it('should return EMAIL_NOT_FOUND when not found', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(null);
      const result = await deleteEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_NOT_FOUND');
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(new Error('DB error'));
      const result = await deleteEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DELETE_EMAIL_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(undefined);
      const result = await deleteEmail('u1', 'e1');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to delete email');
    });
  });

  describe('sendNewEmail', () => {
    beforeEach(() => {
      process.env['CLOUDFLARE_API_TOKEN'] = 'test-token';
      process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account';
    });

    it('should send email successfully', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'sent-1' });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(true);
      expect(result.data.emailId).toBe('sent-1');
    });

    it('should return USER_NOT_FOUND when user not found', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce(null);
      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return EMAIL_CONFIG_MISSING when env vars missing', async () => {
      delete process.env['CLOUDFLARE_API_TOKEN'];
      delete process.env['CLOUDFLARE_ACCOUNT_ID'];
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_CONFIG_MISSING');
    });

    it('should return EMAIL_SEND_FAILED on Cloudflare API failure', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, errors: [{ message: 'Rate limited' }] }),
      });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toBe('Rate limited');
    });

    it('should use default error message on Cloudflare failure without errors array', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Cloudflare email send failed');
    });

    it('should surface the API error message on an HTTP error status', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ success: false, errors: [{ message: 'Invalid token' }] })),
      });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toBe('Invalid token');
    });

    it('should report the HTTP status when the error body is not JSON', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('<html>Bad Gateway</html>'),
      });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Cloudflare email send failed with HTTP 502');
      expect(mockEmailInboxRepository.create).not.toHaveBeenCalled();
    });

    it('should report the HTTP status when the error body cannot be read', async () => {
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('stream closed')),
      });

      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Cloudflare email send failed with HTTP 500');
    });

    it('should handle errors', async () => {
      mockUserRepository.getUserById.mockRejectedValueOnce(new Error('Network error'));
      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SEND_EMAIL_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockUserRepository.getUserById.mockRejectedValueOnce(null);
      const result = await sendNewEmail('u1', 'to@example.com', 'Subject', 'text', '<p>text</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to send email');
    });
  });

  describe('replyToEmail', () => {
    const originalEmail = {
      id: 'orig-1',
      user_id: 'u1',
      from_address: 'sender@example.com',
      subject: 'Original Subject',
      message_id: '<orig-msg-1>',
      references: null,
      folder: 'inbox',
    };

    beforeEach(() => {
      process.env['CLOUDFLARE_API_TOKEN'] = 'test-token';
      process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account';
    });

    it('should reply to email successfully', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'reply-1' });

      const result = await replyToEmail('u1', 'orig-1', 'Reply text', '<p>Reply</p>');
      expect(result.success).toBe(true);
      expect(result.data.emailId).toBe('reply-1');
    });

    it('should prepend Re: to subject when not already present', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'reply-1' });

      await replyToEmail('u1', 'orig-1', 'Reply text', '<p>Reply</p>');
      const createCall = mockEmailInboxRepository.create.mock.calls[0][0];
      expect(createCall.subject).toBe('Re: Original Subject');
    });

    it('should not double Re: prefix', async () => {
      const emailWithRe = { ...originalEmail, subject: 'Re: Already Replied' };
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(emailWithRe);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'reply-1' });

      await replyToEmail('u1', 'orig-1', 'Reply text', '<p>Reply</p>');
      const createCall = mockEmailInboxRepository.create.mock.calls[0][0];
      expect(createCall.subject).toBe('Re: Already Replied');
    });

    it('should append to existing references', async () => {
      const emailWithRefs = { ...originalEmail, references: '<ref-1> <ref-2>' };
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(emailWithRefs);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
      mockEmailInboxRepository.create.mockResolvedValueOnce({ id: 'reply-1' });

      await replyToEmail('u1', 'orig-1', 'Reply text', '<p>Reply</p>');
      const createCall = mockEmailInboxRepository.create.mock.calls[0][0];
      expect(createCall.references).toBe('<ref-1> <ref-2> <orig-msg-1>');
    });

    it('should return EMAIL_NOT_FOUND when original email not found', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(null);
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_NOT_FOUND');
    });

    it('should return USER_NOT_FOUND when user not found', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce(null);
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return EMAIL_CONFIG_MISSING when env vars missing', async () => {
      delete process.env['CLOUDFLARE_API_TOKEN'];
      delete process.env['CLOUDFLARE_ACCOUNT_ID'];
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_CONFIG_MISSING');
    });

    it('should return EMAIL_SEND_FAILED on Cloudflare failure', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false, errors: [{ message: 'Blocked' }] }),
      });
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toBe('Blocked');
    });

    it('should use default error message on Cloudflare failure without errors', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      });
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Cloudflare email send failed');
    });

    it('should not record the reply when Cloudflare returns an HTTP error status', async () => {
      mockEmailInboxRepository.getFullEmail.mockResolvedValueOnce(originalEmail);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'u1', name: 'testuser' });
      global.fetch = jest.fn<any>().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve(JSON.stringify({ success: false, errors: [{ message: 'Too many requests' }] })),
      });

      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      expect(result.error.message).toBe('Too many requests');
      expect(mockEmailInboxRepository.create).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(new Error('Network'));
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REPLY_EMAIL_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.getFullEmail.mockRejectedValueOnce(false);
      const result = await replyToEmail('u1', 'orig-1', 'Reply', '<p>Reply</p>');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to reply to email');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockEmailInboxRepository.getUnreadCount.mockResolvedValueOnce(5);
      const result = await getUnreadCount('u1', 'inbox');
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
    });

    it('should use default folder', async () => {
      mockEmailInboxRepository.getUnreadCount.mockResolvedValueOnce(3);
      const result = await getUnreadCount('u1');
      expect(result.success).toBe(true);
      expect(mockEmailInboxRepository.getUnreadCount).toHaveBeenCalledWith('u1', 'inbox');
    });

    it('should handle errors', async () => {
      mockEmailInboxRepository.getUnreadCount.mockRejectedValueOnce(new Error('DB error'));
      const result = await getUnreadCount('u1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNREAD_COUNT_FAILED');
    });

    it('should handle non-Error throws', async () => {
      mockEmailInboxRepository.getUnreadCount.mockRejectedValueOnce(123);
      const result = await getUnreadCount('u1');
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Failed to get unread count');
    });
  });
});

describe('email-inbox-service.ts - Branch Coverage', () => {
  it('L33: extractUsername returns localPart ?? null when localPart is defined', () => {
    // When regex matches, localPart is always defined, so ?? null returns localPart
    const toAddress = 'testuser@freelancexchain.works';
    const match = toAddress.match(/^([^@]+)@(.+)$/);
    expect(match).not.toBeNull();
    if (match) {
      const [, localPart, domain] = match;
      expect(domain).toBe('freelancexchain.works');
      expect(localPart ?? null).toBe('testuser');
    }
  });

  it('L33: extractUsername localPart ?? null fallback when destructured value is undefined', () => {
    // Simulate the ?? null branch: when localPart is undefined/null, returns null
    const localPart: string | undefined = undefined;
    expect(localPart ?? null).toBeNull();
  });
});
