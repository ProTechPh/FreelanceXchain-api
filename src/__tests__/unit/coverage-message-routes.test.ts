// @ts-nocheck
/**
 * Coverage for message-routes.ts service failure branches.
 * Targets uncovered lines: 45,92-113,132-153,169,205
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

describe('Message Routes - service failure branches', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/messages', router);
  });

  it('GET / returns 400 when getConversations fails (line 45)', async () => {
    mockGetConversations.mockResolvedValue({ success: false, error: { code: 'FAIL', message: 'fail' } });
    const res = await request(app).get('/api/messages/conversations');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FAIL');
  });

  it('POST /send returns 400 when sendMessage fails (line 92)', async () => {
    mockSendMessage.mockResolvedValue({ success: false, error: { code: 'SEND_FAIL', message: 'fail' } });
    const res = await request(app).post('/api/messages/send').send({ receiverId: 'uid-2', content: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SEND_FAIL');
  });

  it('GET /conversations/:id returns 400 when getConversationMessages fails (line 132)', async () => {
    mockGetConversationMessages.mockResolvedValue({ success: false, error: { code: 'FETCH_FAIL', message: 'fail' } });
    const res = await request(app).get('/api/messages/conversations/uuid-1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FETCH_FAIL');
  });

  it('PATCH /conversations/:id/read returns 400 when markConversationAsRead fails (line 169)', async () => {
    mockMarkConversationAsRead.mockResolvedValue({ success: false, error: { code: 'UPDATE_FAIL', message: 'fail' } });
    const res = await request(app).patch('/api/messages/conversations/uuid-1/read');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPDATE_FAIL');
  });

  it('GET /unread-count returns 400 when getUnreadMessageCount fails (line 205)', async () => {
    mockGetUnreadMessageCount.mockResolvedValue({ success: false, error: { code: 'COUNT_FAIL', message: 'fail' } });
    const res = await request(app).get('/api/messages/unread-count');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COUNT_FAIL');
  });
});
