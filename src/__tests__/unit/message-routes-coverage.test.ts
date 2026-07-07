// @ts-nocheck
/**
 * Coverage for message-routes.ts ternary operators and ?? fallbacks.
 * Targets uncovered branches: query ternaries, error fallbacks
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
}));

const mockGetConversations = jest.fn<any>();
const mockSendMessage = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>();
const mockMarkConversationAsRead = jest.fn<any>();
const mockGetUnreadMessageCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
  getConversations: mockGetConversations,
  sendMessage: mockSendMessage,
  getConversationMessages: mockGetConversationMessages,
  markConversationAsRead: mockMarkConversationAsRead,
  getUnreadMessageCount: mockGetUnreadMessageCount,
}));

const router = (await import('../../routes/message-routes.js')).default;

describe('Message Routes - ternary and ?? fallback coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/messages', router);
  });

  describe('GET /conversations - query parameter ternaries', () => {
    it('should use default page=1 when page query is missing', async () => {
      mockGetConversations.mockResolvedValue({ success: true, data: [] });
      await request(app).get('/api/messages/conversations');
      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 1, limit: expect.any(Number) });
    });

    it('should parse page from query when provided', async () => {
      mockGetConversations.mockResolvedValue({ success: true, data: [] });
      await request(app).get('/api/messages/conversations?page=5');
      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 5, limit: expect.any(Number) });
    });

    it('should use default limit when limit query is missing', async () => {
      mockGetConversations.mockResolvedValue({ success: true, data: [] });
      await request(app).get('/api/messages/conversations');
      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 1, limit: 20 });
    });

    it('should parse limit from query when provided', async () => {
      mockGetConversations.mockResolvedValue({ success: true, data: [] });
      await request(app).get('/api/messages/conversations?limit=50');
      expect(mockGetConversations).toHaveBeenCalledWith('user-1', { page: 1, limit: 50 });
    });

    it('should fallback error code and message when error is undefined', async () => {
      mockGetConversations.mockResolvedValue({ success: false, error: undefined });
      const res = await request(app).get('/api/messages/conversations');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN');
      expect(res.body.error.message).toBe('An error occurred');
    });
  });

  describe('POST /send - error fallback', () => {
    it('should fallback error code and message when error is undefined', async () => {
      mockSendMessage.mockResolvedValue({ success: false, error: undefined });
      const res = await request(app).post('/api/messages/send').send({ receiverId: 'uid-2', content: 'hi' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN');
      expect(res.body.error.message).toBe('An error occurred');
    });
  });

  describe('GET /conversations/:conversationId - query parameter ternaries and error fallbacks', () => {
    const convId = '550e8400-e29b-41d4-a716-446655440000';

    it('should use default page=1 when page query is missing', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: true, data: [] });
      await request(app).get(`/api/messages/conversations/${convId}`);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 1, limit: expect.any(Number) });
    });

    it('should parse page from query when provided', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: true, data: [] });
      await request(app).get(`/api/messages/conversations/${convId}?page=3`);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 3, limit: expect.any(Number) });
    });

    it('should use default limit when limit query is missing', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: true, data: [] });
      await request(app).get(`/api/messages/conversations/${convId}`);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 1, limit: 20 });
    });

    it('should parse limit from query when provided', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: true, data: [] });
      await request(app).get(`/api/messages/conversations/${convId}?limit=25`);
      expect(mockGetConversationMessages).toHaveBeenCalledWith(convId, 'user-1', { page: 1, limit: 25 });
    });

    it('should return 404 when error code is NOT_FOUND', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).get(`/api/messages/conversations/${convId}`);
      expect(res.status).toBe(404);
    });

    it('should return 403 when error code is UNAUTHORIZED', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
      const res = await request(app).get(`/api/messages/conversations/${convId}`);
      expect(res.status).toBe(403);
    });

    it('should return 400 for other error codes', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: false, error: { code: 'OTHER', message: 'Other error' } });
      const res = await request(app).get(`/api/messages/conversations/${convId}`);
      expect(res.status).toBe(400);
    });

    it('should fallback error code and message when error is undefined', async () => {
      mockGetConversationMessages.mockResolvedValue({ success: false, error: undefined });
      const res = await request(app).get(`/api/messages/conversations/${convId}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN');
      expect(res.body.error.message).toBe('An error occurred');
    });
  });

  describe('PATCH /conversations/:conversationId/read - error fallback', () => {
    const convId = '550e8400-e29b-41d4-a716-446655440000';

    it('should fallback error code and message when error is undefined', async () => {
      mockMarkConversationAsRead.mockResolvedValue({ success: false, error: undefined });
      const res = await request(app).patch(`/api/messages/conversations/${convId}/read`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN');
      expect(res.body.error.message).toBe('An error occurred');
    });
  });

  describe('GET /unread-count - error fallback', () => {
    it('should fallback error code and message when error is undefined', async () => {
      mockGetUnreadMessageCount.mockResolvedValue({ success: false, error: undefined });
      const res = await request(app).get('/api/messages/unread-count');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN');
      expect(res.body.error.message).toBe('An error occurred');
    });
  });
});
