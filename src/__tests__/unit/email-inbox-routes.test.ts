// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockProcessInboundEmail = jest.fn<any>();
const mockVerifyWebhookSignature = jest.fn<any>();
const mockListEmails = jest.fn<any>();
const mockGetEmail = jest.fn<any>();
const mockUpdateEmail = jest.fn<any>();
const mockDeleteEmail = jest.fn<any>();
const mockSendNewEmail = jest.fn<any>();
const mockReplyToEmail = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockRecordInboundDeliveryFailure = jest.fn<any>();
const mockGetRecentDeliveryFailures = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/email-inbox-service.ts'), () => ({
  processInboundEmail: mockProcessInboundEmail,
  verifyWebhookSignature: mockVerifyWebhookSignature,
  recordInboundDeliveryFailure: mockRecordInboundDeliveryFailure,
  getRecentDeliveryFailures: mockGetRecentDeliveryFailures,
  listEmails: mockListEmails,
  getEmail: mockGetEmail,
  updateEmail: mockUpdateEmail,
  deleteEmail: mockDeleteEmail,
  sendNewEmail: mockSendNewEmail,
  replyToEmail: mockReplyToEmail,
  getUnreadCount: mockGetUnreadCount,
  getSenderProfiles: jest.fn(() => []),
}));

jest.unstable_mockModule(resolveModule('src/repositories/email-inbox-repository.ts'), () => ({
  emailInboxRepository: {},
  EmailInboxRepository: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  webhookRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'test-user-id', id: 'test-user-id', email: 'test@test.com', role: 'admin' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const emailInboxRouter = (await import('../../routes/email-inbox-routes.js')).default;

describe('Email Inbox Routes', () => {
  let app: express.Express;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EMAIL_WEBHOOK_SECRET: 'test-secret' };
    app = express();
    app.use(express.json());
    app.use('/api/emails', emailInboxRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /webhook', () => {
    it('should return 500 when webhook secret not configured', async () => {
      delete process.env['EMAIL_WEBHOOK_SECRET'];
      const res = await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'somesig')
        .send({ messageId: 'test' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('CONFIG_ERROR');
    });

    it('should return 401 when signature missing', async () => {
      const res = await request(app)
        .post('/api/emails/webhook')
        .send({ messageId: 'test' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_SIGNATURE');
    });

    it('should return 401 when signature is invalid', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(false);
      const res = await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'invalidsig')
        .send({ messageId: 'test' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_INVALID_SIGNATURE');
    });

    it('should return 401 when verification throws', async () => {
      mockVerifyWebhookSignature.mockImplementationOnce(() => { throw new Error('bad hex'); });
      const res = await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'badhex')
        .send({ messageId: 'test' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_INVALID_SIGNATURE');
    });

    it('should process valid webhook successfully', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'e1' } });
      const res = await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test', from: 'a@b.com', to: 'c@d.com' });
      expect(res.status).toBe(200);
      expect(res.body.emailId).toBe('e1');
    });

    it('should verify signature over req.rawBody when present', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'e1' } });

      // Simulate the express.json verify hook capturing the exact bytes the
      // sender signed: attach rawBody to the request before it reaches the route.
      const rawApp = express();
      rawApp.use(express.json({
        verify: (req: any, _res: any, buf: Buffer) => {
          if (req.path === '/api/emails/webhook') {
            req.rawBody = buf.toString('utf8');
          }
        },
      }));
      rawApp.use('/api/emails', emailInboxRouter);

      const res = await request(rawApp)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test', from: 'a@b.com', to: 'c@d.com' });

      expect(res.status).toBe(200);
      // The route must verify against the raw string (not JSON.stringify(req.body)).
      const payloadArg = mockVerifyWebhookSignature.mock.calls[0]![0];
      expect(payloadArg).toBe('{"messageId":"test","from":"a@b.com","to":"c@d.com"}');
    });

    it('should return 400 when processInboundEmail fails', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: false, error: { code: 'INVALID_RECIPIENT', message: 'Bad' } });
      const res = await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RECIPIENT');
    });

    it('should record a permanent rejection (INVALID_RECIPIENT) for ops visibility', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: false, error: { code: 'INVALID_RECIPIENT', message: 'Recipient not on platform domain: x@other.com' } });
      await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test', from: 'a@b.com', to: 'x@other.com', subject: 'Hi' });
      expect(mockRecordInboundDeliveryFailure).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'test', from: 'a@b.com', to: 'x@other.com', subject: 'Hi' }),
        'INVALID_RECIPIENT',
        'Recipient not on platform domain: x@other.com'
      );
    });

    it('should record a permanent rejection (USER_NOT_FOUND)', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: false, error: { code: 'USER_NOT_FOUND', message: 'No user found' } });
      await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test' });
      expect(mockRecordInboundDeliveryFailure).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'test' }),
        'USER_NOT_FOUND',
        'No user found'
      );
    });

    it('should NOT record transient/internal failures (INBOUND_EMAIL_FAILED)', async () => {
      mockVerifyWebhookSignature.mockReturnValueOnce(true);
      mockProcessInboundEmail.mockResolvedValueOnce({ success: false, error: { code: 'INBOUND_EMAIL_FAILED', message: 'DB error' } });
      await request(app)
        .post('/api/emails/webhook')
        .set('x-webhook-signature', 'validsig')
        .send({ messageId: 'test' });
      expect(mockRecordInboundDeliveryFailure).not.toHaveBeenCalled();
    });
  });

  describe('GET / (list emails)', () => {
    it('should list emails with default params', async () => {
      mockListEmails.mockResolvedValueOnce({ success: true, data: { data: [], total: 0 } });
      const res = await request(app).get('/api/emails');
      expect(res.status).toBe(200);
      expect(mockListEmails).toHaveBeenCalledWith('test-user-id', { folder: 'inbox', limit: 20, offset: 0 });
    });

    it('should pass query params', async () => {
      mockListEmails.mockResolvedValueOnce({ success: true, data: { data: [], total: 0 } });
      const res = await request(app).get('/api/emails?folder=sent&limit=10&offset=5&isRead=true');
      expect(res.status).toBe(200);
      expect(mockListEmails).toHaveBeenCalledWith('test-user-id', { folder: 'sent', limit: 10, offset: 5, isRead: true });
    });

    it('should cap limit at 100', async () => {
      mockListEmails.mockResolvedValueOnce({ success: true, data: { data: [], total: 0 } });
      const res = await request(app).get('/api/emails?limit=500');
      expect(res.status).toBe(200);
      expect(mockListEmails).toHaveBeenCalledWith('test-user-id', { folder: 'inbox', limit: 100, offset: 0 });
    });

    it('should parse isRead=false', async () => {
      mockListEmails.mockResolvedValueOnce({ success: true, data: { data: [], total: 0 } });
      const res = await request(app).get('/api/emails?isRead=false');
      expect(res.status).toBe(200);
      expect(mockListEmails).toHaveBeenCalledWith('test-user-id', { folder: 'inbox', limit: 20, offset: 0, isRead: false });
    });

    it('should return 400 on service failure', async () => {
      mockListEmails.mockResolvedValueOnce({ success: false, error: { code: 'LIST_EMAILS_FAILED', message: 'err' } });
      const res = await request(app).get('/api/emails');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /unread-count', () => {
    it('should return unread count', async () => {
      mockGetUnreadCount.mockResolvedValueOnce({ success: true, data: { count: 5 } });
      const res = await request(app).get('/api/emails/unread-count');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it('should pass folder param', async () => {
      mockGetUnreadCount.mockResolvedValueOnce({ success: true, data: { count: 2 } });
      const res = await request(app).get('/api/emails/unread-count?folder=sent');
      expect(res.status).toBe(200);
      expect(mockGetUnreadCount).toHaveBeenCalledWith('test-user-id', 'sent');
    });

    it('should return 400 on failure', async () => {
      mockGetUnreadCount.mockResolvedValueOnce({ success: false, error: { code: 'UNREAD_COUNT_FAILED', message: 'err' } });
      const res = await request(app).get('/api/emails/unread-count');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /profiles', () => {
    it('should return sender profiles without falling into /:id', async () => {
      const res = await request(app).get('/api/emails/profiles');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('profiles');
    });
  });

  describe('GET /delivery-failures', () => {
    it('should return recent delivery failures', async () => {
      mockGetRecentDeliveryFailures.mockResolvedValueOnce([{ id: 'f1', failure_code: 'USER_NOT_FOUND' }]);
      const res = await request(app).get('/api/emails/delivery-failures');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(mockGetRecentDeliveryFailures).toHaveBeenCalledWith(50);
    });

    it('should return empty list when no failures recorded', async () => {
      mockGetRecentDeliveryFailures.mockResolvedValueOnce([]);
      const res = await request(app).get('/api/emails/delivery-failures');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /:id', () => {
    it('should return email', async () => {
      mockGetEmail.mockResolvedValueOnce({ success: true, data: { id: 'e1', subject: 'Test' } });
      const res = await request(app).get('/api/emails/e1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('e1');
    });

    it('should return 404 when not found', async () => {
      mockGetEmail.mockResolvedValueOnce({ success: false, error: { code: 'EMAIL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get('/api/emails/e1');
      expect(res.status).toBe(404);
    });

    it('should return 400 for other errors', async () => {
      mockGetEmail.mockResolvedValueOnce({ success: false, error: { code: 'GET_EMAIL_FAILED', message: 'err' } });
      const res = await request(app).get('/api/emails/e1');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id', () => {
    it('should update email', async () => {
      mockUpdateEmail.mockResolvedValueOnce({ success: true, data: { id: 'e1', is_read: true } });
      const res = await request(app).patch('/api/emails/e1').send({ is_read: true });
      expect(res.status).toBe(200);
      expect(res.body.is_read).toBe(true);
    });

    it('should pass is_starred and folder', async () => {
      mockUpdateEmail.mockResolvedValueOnce({ success: true, data: { id: 'e1', is_starred: true, folder: 'trash' } });
      const res = await request(app).patch('/api/emails/e1').send({ is_starred: true, folder: 'trash' });
      expect(res.status).toBe(200);
      expect(mockUpdateEmail).toHaveBeenCalledWith('test-user-id', 'e1', { is_starred: true, folder: 'trash' });
    });

    it('should return 404 when not found', async () => {
      mockUpdateEmail.mockResolvedValueOnce({ success: false, error: { code: 'EMAIL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).patch('/api/emails/e1').send({ is_read: true });
      expect(res.status).toBe(404);
    });

    it('should return 400 for other errors', async () => {
      mockUpdateEmail.mockResolvedValueOnce({ success: false, error: { code: 'UPDATE_FAILED', message: 'err' } });
      const res = await request(app).patch('/api/emails/e1').send({ is_read: true });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:id', () => {
    it('should delete email', async () => {
      mockDeleteEmail.mockResolvedValueOnce({ success: true, data: { deleted: true } });
      const res = await request(app).delete('/api/emails/e1');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('should return 404 when not found', async () => {
      mockDeleteEmail.mockResolvedValueOnce({ success: false, error: { code: 'EMAIL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).delete('/api/emails/e1');
      expect(res.status).toBe(404);
    });

    it('should return 400 for other errors', async () => {
      mockDeleteEmail.mockResolvedValueOnce({ success: false, error: { code: 'DELETE_EMAIL_FAILED', message: 'err' } });
      const res = await request(app).delete('/api/emails/e1');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /send', () => {
    it('should send email successfully', async () => {
      mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-1' } });
      const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' });
      expect(res.status).toBe(201);
      expect(res.body.emailId).toBe('sent-1');
    });

    it('should return 400 when to is missing', async () => {
      const res = await request(app).post('/api/emails/send').send({ subject: 'Hi' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when subject is missing', async () => {
      const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should use text as fallback for html', async () => {
      mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-1' } });
      const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', text: 'Hello' });
      expect(res.status).toBe(201);
      expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Hi', textBody: 'Hello', htmlBody: 'Hello' });
    });

    it('should use empty string when text is missing', async () => {
      mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-1' } });
      const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>' });
      expect(res.status).toBe(201);
      expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Hi', textBody: '', htmlBody: '<p>Hi</p>' });
    });

    it('should return 400 on service failure', async () => {
      mockSendNewEmail.mockResolvedValueOnce({ success: false, error: { code: 'EMAIL_SEND_FAILED', message: 'err' } });
      const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', text: 'Hello' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:id/reply', () => {
    it('should reply successfully', async () => {
      mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-1' } });
      const res = await request(app).post('/api/emails/e1/reply').send({ text: 'Reply', html: '<p>Reply</p>' });
      expect(res.status).toBe(201);
      expect(res.body.emailId).toBe('reply-1');
    });

    it('should return 400 when both text and html are missing', async () => {
      const res = await request(app).post('/api/emails/e1/reply').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should use text as fallback for html', async () => {
      mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-1' } });
      const res = await request(app).post('/api/emails/e1/reply').send({ text: 'Reply' });
      expect(res.status).toBe(201);
      expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e1', 'Reply', 'Reply');
    });

    it('should allow html only', async () => {
      mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-1' } });
      const res = await request(app).post('/api/emails/e1/reply').send({ html: '<p>Reply</p>' });
      expect(res.status).toBe(201);
      expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e1', '', '<p>Reply</p>');
    });

    it('should return 404 when original email not found', async () => {
      mockReplyToEmail.mockResolvedValueOnce({ success: false, error: { code: 'EMAIL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/emails/e1/reply').send({ text: 'Reply' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for other errors', async () => {
      mockReplyToEmail.mockResolvedValueOnce({ success: false, error: { code: 'REPLY_EMAIL_FAILED', message: 'err' } });
      const res = await request(app).post('/api/emails/e1/reply').send({ text: 'Reply' });
      expect(res.status).toBe(400);
    });
  });

  describe('Auth', () => {
    it('routes require admin role (mocked to pass through in test)', async () => {
      mockListEmails.mockResolvedValueOnce({ success: true, data: { data: [], total: 0 } });
      const res = await request(app).get('/api/emails');
      expect(res.status).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// sendNewEmail and replyToEmail service call verification
// ═══════════════════════════════════════════════════════════════

describe('email-inbox-routes - send and reply service calls', () => {
  let app: express.Express;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EMAIL_WEBHOOK_SECRET: 'test-secret' };
    app = express();
    app.use(express.json());
    app.use('/api/emails', emailInboxRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('L204: POST /send calls sendNewEmail with correct args when only text provided', async () => {
    mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-2' } });
    const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Sub', text: 'Body text' });
    expect(res.status).toBe(201);
    expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Sub', textBody: 'Body text', htmlBody: 'Body text' });
  });

  it('L204: POST /send calls sendNewEmail with empty text when neither text nor html provided', async () => {
    mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-3' } });
    const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Sub', html: '<p>Hi</p>' });
    expect(res.status).toBe(201);
    expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Sub', textBody: '', htmlBody: '<p>Hi</p>' });
  });

  it('L234: POST /:id/reply calls replyToEmail with correct args', async () => {
    mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-2' } });
    const res = await request(app).post('/api/emails/e2/reply').send({ text: 'Reply body', html: '<p>Reply</p>' });
    expect(res.status).toBe(201);
    expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e2', 'Reply body', '<p>Reply</p>');
  });

  it('L234: POST /:id/reply calls replyToEmail with fallback html from text', async () => {
    mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-3' } });
    const res = await request(app).post('/api/emails/e3/reply').send({ text: 'Plain reply' });
    expect(res.status).toBe(201);
    expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e3', 'Plain reply', 'Plain reply');
  });

  it('L204: POST /send with neither text nor html uses empty strings', async () => {
    mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-4' } });
    const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Sub' });
    expect(res.status).toBe(201);
    expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Sub', textBody: '', htmlBody: '' });
  });

  it('L234: POST /:id/reply with both text and html passes both directly', async () => {
    mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-4' } });
    const res = await request(app).post('/api/emails/e4/reply').send({ text: 'Plain', html: '<p>Rich</p>' });
    expect(res.status).toBe(201);
    expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e4', 'Plain', '<p>Rich</p>');
  });
});

describe('email-inbox-routes - additional branch coverage for || operators', () => {
  let app: express.Express;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EMAIL_WEBHOOK_SECRET: 'test-secret' };
    app = express();
    app.use(express.json());
    app.use('/api/emails', emailInboxRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('POST /send with text as empty string and html provided (text || \'\' branch)', async () => {
    mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-5' } });
    const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', text: '', html: '<p>Hi</p>' });
    expect(res.status).toBe(201);
    // text is '' (falsy) so text || '' => '', html is truthy so html || text || '' => '<p>Hi</p>'
    expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Hi', textBody: '', htmlBody: '<p>Hi</p>' });
  });

  it('POST /:id/reply with text as empty string and html provided (text || \'\' branch)', async () => {
    mockReplyToEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'reply-5' } });
    const res = await request(app).post('/api/emails/e5/reply').send({ text: '', html: '<p>Reply</p>' });
    expect(res.status).toBe(201);
    // text is '' (falsy) so text || '' => '', html is truthy so html || text || '' => '<p>Reply</p>'
    expect(mockReplyToEmail).toHaveBeenCalledWith('test-user-id', 'e5', '', '<p>Reply</p>');
  });

  it('POST /:id/reply with text as empty string and no html passes validation (html || text || \'\' branch)', async () => {
    // text: '' is falsy, html: undefined is falsy
    // Validation: !text && !html => true && true => true => 400
    const res = await request(app).post('/api/emails/e5/reply').send({ text: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /send with text as empty string and no html (html || text || \'\' fallback to text then \'\')', async () => {
    mockSendNewEmail.mockResolvedValueOnce({ success: true, data: { emailId: 'sent-6' } });
    const res = await request(app).post('/api/emails/send').send({ to: 'a@b.com', subject: 'Hi', text: '' });
    expect(res.status).toBe(201);
    // text is '' (falsy) so text || '' => ''
    // html is undefined (falsy), text is '' (falsy), so html || text || '' => ''
    expect(mockSendNewEmail).toHaveBeenCalledWith({ userId: 'test-user-id', to: 'a@b.com', subject: 'Hi', textBody: '', htmlBody: '' });
  });
});
