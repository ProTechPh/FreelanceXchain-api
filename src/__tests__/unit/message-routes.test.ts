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
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const messageRouter = (await import('../../routes/message-routes.js')).default;

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
