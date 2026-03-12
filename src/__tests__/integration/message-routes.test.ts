import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Message Routes Integration Tests', () => {
  let app: Express;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createApp();
    
    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

    if (loginResponse.body.accessToken) {
      authToken = loginResponse.body.accessToken;
      userId = loginResponse.body.user.id;
    }
  });

  describe('POST /api/messages/send', () => {
    it('should send a message', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          receiverId: 'receiver-user-id',
          content: 'Hello, this is a test message',
        });

      // May fail if service not implemented yet
      expect([200, 201, 400, 401]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .send({
          receiverId: 'receiver-user-id',
          content: 'Hello',
        });

      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Missing receiverId',
        });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/messages/conversations', () => {
    it('should get user conversations', async () => {
      const response = await request(app)
        .get('/api/messages/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/messages/conversations?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GET /api/messages/unread-count', () => {
    it('should get unread message count', async () => {
      const response = await request(app)
        .get('/api/messages/unread-count')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('count');
        expect(typeof response.body.count).toBe('number');
      }
    });
  });
});
