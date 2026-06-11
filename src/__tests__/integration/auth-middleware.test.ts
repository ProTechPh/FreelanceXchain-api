import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../../middleware/auth-middleware.js';

// Mocks are handled by jest.setup.ts

describe('Auth Middleware Integration', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    
    // Protected test route
    app.get('/protected', authMiddleware, (req, res) => {
      res.status(200).json({ user: req.user });
    });
  });

  it('should allow access with valid token', async () => {
    // Mock Appwrite databases.getDocument to return a valid user
    (globalThis as any).__mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: false,
    });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer test-session-secret');

    expect(response.status).toBe(200);
    expect(response.body.user.userId).toBe('test-user-id');
  });

  it('should deny access without token', async () => {
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_MISSING_TOKEN');
  });

  it('should deny access for suspended user', async () => {
    // Mock Appwrite databases.getDocument to return a suspended user
    (globalThis as any).__mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: true, suspension_reason: 'banned',
    });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer test-session-secret');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN'); // Currently validateToken returns INVALID_TOKEN for suspended
  });
});
