// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSendMessage = jest.fn() as any;
const mockGetConversations = jest.fn() as any;
const mockGetConversationMessages = jest.fn() as any;
const mockMarkConversationAsRead = jest.fn() as any;
const mockGetUnreadMessageCount = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
  sendMessage: mockSendMessage,
  getConversations: mockGetConversations,
  getConversationMessages: mockGetConversationMessages,
  markConversationAsRead: mockMarkConversationAsRead,
  getUnreadMessageCount: mockGetUnreadMessageCount,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const messageRouter = (await import('../../routes/message-routes.js')).default;

function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockMessageService = { sendMessage: mockSendMessage, getConversations: mockGetConversations, getConversationMessages: mockGetConversationMessages, markConversationAsRead: mockMarkConversationAsRead, getUnreadMessageCount: mockGetUnreadMessageCount };

describe('Message Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/messages', messageRouter);
  });

  describe('GET /conversations - Get User Conversations', () => {
    it('should return user conversations', async () => {
      mockGetConversations.mockResolvedValue({
        success: true,
        data: [{ id: 'conv-1', participants: ['user-1', 'user-2'] }],
      });

      const res = await request(app).get('/api/messages/conversations');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 1, limit: expect.any(Number) });
    });

    it('should pass pagination parameters', async () => {
      mockGetConversations.mockResolvedValue({ success: true, data: [] });

      await request(app).get('/api/messages/conversations?page=2&limit=10');

      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 2, limit: 10 });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/messages/conversations');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetConversations.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/messages/conversations');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('POST /send - Send Message', () => {
    it('should send a message successfully', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { id: 'msg-1', senderId: 'user-1', receiverId: 'user-2', content: 'Hello' },
      });

      const res = await request(app)
        .post('/api/messages/send')
        .send({ receiverId: 'user-2', content: 'Hello' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('msg-1');
      expect(mockSendMessage).toHaveBeenCalledWith({
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'Hello',
        attachments: undefined,
      });
    });

    it('should send a message with attachments', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { id: 'msg-1', senderId: 'user-1', receiverId: 'user-2', content: 'See attached', attachments: ['file-1'] },
      });

      const res = await request(app)
        .post('/api/messages/send')
        .send({ receiverId: 'user-2', content: 'See attached', attachments: ['file-1'] });

      expect(res.status).toBe(201);
      expect(mockSendMessage).toHaveBeenCalledWith({
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'See attached',
        attachments: ['file-1'],
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/messages/send')
        .send({ receiverId: 'user-2', content: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when receiverId is missing', async () => {
      const res = await request(app)
        .post('/api/messages/send')
        .send({ content: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/messages/send')
        .send({ receiverId: 'user-2' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns failure', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: { code: 'BLOCKED', message: 'User is blocked' },
      });

      const res = await request(app)
        .post('/api/messages/send')
        .send({ receiverId: 'user-2', content: 'Hello' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BLOCKED');
    });
  });

  describe('GET /conversations/:conversationId - Get Conversation Messages', () => {
    const convId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return conversation messages', async () => {
      mockGetConversationMessages.mockResolvedValue({
        success: true,
        data: [{ id: 'msg-1', content: 'Hello' }],
      });

      const res = await request(app).get(`/api/messages/conversations/${convId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 1, limit: expect.any(Number) });
    });

    it('should pass pagination parameters', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: true, data: [] });

      await request(app).get(`/api/messages/conversations/${convId}?page=3&limit=20`);

      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 3, limit: 20 });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get(`/api/messages/conversations/${convId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when conversation not found', async () => {
      mockGetConversationMessages.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });

      const res = await request(app).get(`/api/messages/conversations/${convId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is unauthorized', async () => {
      mockGetConversationMessages.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not a participant' },
      });

      const res = await request(app).get(`/api/messages/conversations/${convId}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockGetConversationMessages.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/messages/conversations/${convId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('PATCH /conversations/:conversationId/read - Mark Conversation as Read', () => {
    const convId = '550e8400-e29b-41d4-a716-446655440000';

    it('should mark conversation as read', async () => {
      mockMarkConversationAsRead.mockResolvedValue({ success: true });

      const res = await request(app).patch(`/api/messages/conversations/${convId}/read`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Conversation marked as read');
      expect(mockMarkConversationAsRead).toHaveBeenCalledWith(convId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).patch(`/api/messages/conversations/${convId}/read`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockMarkConversationAsRead.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Conversation not found' },
      });

      const res = await request(app).patch(`/api/messages/conversations/${convId}/read`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /unread-count - Get Unread Message Count', () => {
    it('should return unread message count', async () => {
      mockGetUnreadMessageCount.mockResolvedValue({ success: true, data: 5 });

      const res = await request(app).get('/api/messages/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
      expect(mockGetUnreadMessageCount).toHaveBeenCalledWith('user-1');
    });

    it('should return 0 when no unread messages', async () => {
      mockGetUnreadMessageCount.mockResolvedValue({ success: true, data: 0 });

      const res = await request(app).get('/api/messages/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/messages/unread-count');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetUnreadMessageCount.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/messages/unread-count');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('message-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/messages', messageRouter);
  });

  it('GET /conversations with limit and page', async () => {
    mockMessageService.getConversations.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/messages/conversations?limit=5&page=2');
    expect(res.status).toBe(200);
  });

  it('GET /conversations without limit/page (fallback)', async () => {
    mockMessageService.getConversations.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(200);
  });

  it('GET /conversations error without code', async () => {
    mockMessageService.getConversations.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(400);
  });

  it('POST /send success', async () => {
    mockMessageService.sendMessage.mockResolvedValue(ok({ id: 'm1' }));
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'u2', content: 'Hello' });
    expect(res.status).toBe(201);
  });

  it('POST /send missing fields', async () => {
    const res = await request(app).post('/api/messages/send').send({});
    expect(res.status).toBe(400);
  });

  it('POST /send error without code', async () => {
    mockMessageService.sendMessage.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'u2', content: 'Hello' });
    expect(res.status).toBe(400);
  });

  it('GET /conversations/:conversationId NOT_FOUND returns 404', async () => {
    mockMessageService.getConversationMessages.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(404);
  });

  it('GET /conversations/:conversationId UNAUTHORIZED returns 403', async () => {
    mockMessageService.getConversationMessages.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(403);
  });

  it('GET /conversations/:conversationId other error returns 400', async () => {
    mockMessageService.getConversationMessages.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(400);
  });

  it('PATCH /conversations/:conversationId/read error without code', async () => {
    mockMessageService.markConversationAsRead.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).patch('/api/messages/conversations/c1/read');
    expect(res.status).toBe(400);
  });

  it('GET /unread-count error without code', async () => {
    mockMessageService.getUnreadMessageCount.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).get('/api/messages/unread-count');
    expect(res.status).toBe(400);
  });
});

describe('message-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockGetConversationMessages = jest.fn<any>();
  const mockMarkConversationAsRead = jest.fn<any>();
  const mockSendMessage2 = jest.fn<any>();
  const mockGetConversations2 = jest.fn<any>();
  const mockGetUnreadMessageCount2 = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
      sendMessage: mockSendMessage2,
      getConversations: mockGetConversations2,
      getConversationMessages: mockGetConversationMessages,
      markConversationAsRead: mockMarkConversationAsRead,
      getUnreadMessageCount: mockGetUnreadMessageCount2,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/message-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/messages', router);
    jest.clearAllMocks();
  });

  it('L113: GET conversation messages', async () => {
    mockGetConversationMessages.mockResolvedValueOnce({ success: true, data: { messages: [], total: 0 } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(200);
  });

  it('L153: PATCH mark as read', async () => {
    mockMarkConversationAsRead.mockResolvedValueOnce({ success: true });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/messages/conversations/c1/read');
    expect(res.status).toBe(200);
  });

  // Error branch tests
  it('L45: GET /conversations returns 400 on failure', async () => {
    mockGetConversations2.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });

  it('L92: POST /send returns 400 on failure', async () => {
    mockSendMessage2.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'u2', content: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });

  it('L132: GET /conversations/:id NOT_FOUND returns 404', async () => {
    mockGetConversationMessages.mockResolvedValueOnce({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('L132: GET /conversations/:id UNAUTHORIZED returns 403', async () => {
    mockGetConversationMessages.mockResolvedValueOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('L132: GET /conversations/:id generic error returns 400', async () => {
    mockGetConversationMessages.mockResolvedValueOnce({ success: false, error: { code: 'DB_ERROR', message: 'Database error' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
  });

  it('L169: PATCH /conversations/:id/read returns 400 on failure', async () => {
    mockMarkConversationAsRead.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/messages/conversations/c1/read');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });

  it('L205: GET /unread-count returns 400 on failure', async () => {
    mockGetUnreadMessageCount2.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/unread-count');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });
});

describe('message-routes - additional branch coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/messages', messageRouter);
  });

  it('GET /conversations with no error property', async () => {
    mockGetConversations.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /conversations with code but no message', async () => {
    mockGetConversations.mockResolvedValue({ success: false, error: { code: 'DB_ERROR' } });
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('POST /send with no error property', async () => {
    mockSendMessage.mockResolvedValue({ success: false });
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'user-2', content: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('POST /send with code but no message', async () => {
    mockSendMessage.mockResolvedValue({ success: false, error: { code: 'BLOCKED' } });
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'user-2', content: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BLOCKED');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /conversations/:conversationId with no error property', async () => {
    mockGetConversationMessages.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /conversations/:conversationId with code but no message', async () => {
    mockGetConversationMessages.mockResolvedValue({ success: false, error: { code: 'DB_ERROR' } });
    const res = await request(app).get('/api/messages/conversations/c1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('PATCH /conversations/:conversationId/read with no error property', async () => {
    mockMarkConversationAsRead.mockResolvedValue({ success: false });
    const res = await request(app).patch('/api/messages/conversations/c1/read');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('PATCH /conversations/:conversationId/read with code but no message', async () => {
    mockMarkConversationAsRead.mockResolvedValue({ success: false, error: { code: 'DB_ERROR' } });
    const res = await request(app).patch('/api/messages/conversations/c1/read');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /unread-count with no error property', async () => {
    mockGetUnreadMessageCount.mockResolvedValue({ success: false });
    const res = await request(app).get('/api/messages/unread-count');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /unread-count with code but no message', async () => {
    mockGetUnreadMessageCount.mockResolvedValue({ success: false, error: { code: 'DB_ERROR' } });
    const res = await request(app).get('/api/messages/unread-count');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
    expect(res.body.error.message).toBe('An error occurred');
  });
});

describe('message-routes - ?? "" param fallback coverage', () => {
  let app: any;
  const mockGetConversationMessages = jest.fn<any>();
  const mockMarkConversationAsRead = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
      sendMessage: jest.fn(),
      getConversations: jest.fn(),
      getConversationMessages: mockGetConversationMessages,
      markConversationAsRead: mockMarkConversationAsRead,
      getUnreadMessageCount: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', id: 'user-1', email: 'test@test.com', role: 'freelancer' };
        delete req.params.conversationId;
        next();
      },
      requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
      requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (_req: any, _res: any, next: any) => next(),
      fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
      validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/message-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/messages', router);
    jest.clearAllMocks();
  });

  it('L113: GET /conversations/:conversationId uses ?? "" fallback when conversationId is nullish', async () => {
    mockGetConversationMessages.mockResolvedValueOnce({ success: true, data: { messages: [], total: 0 } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/messages/conversations/any-id');
    expect(res.status).toBe(200);
    expect(mockGetConversationMessages).toHaveBeenCalledWith('', 'user-1', expect.any(Object));
  });

  it('L153: PATCH /conversations/:conversationId/read uses ?? "" fallback', async () => {
    mockMarkConversationAsRead.mockResolvedValueOnce({ success: true });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/messages/conversations/any-id/read');
    expect(res.status).toBe(200);
    expect(mockMarkConversationAsRead).toHaveBeenCalledWith('', 'user-1');
  });
});
