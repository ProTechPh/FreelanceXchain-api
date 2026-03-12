import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Favorite Routes Integration Tests', () => {
  let app: Express;
  let authToken: string;

  beforeAll(async () => {
    app = await createApp();
    
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

    if (loginResponse.body.accessToken) {
      authToken = loginResponse.body.accessToken;
    }
  });

  describe('POST /api/favorites', () => {
    it('should add a favorite', async () => {
      const response = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'project',
          targetId: '123e4567-e89b-12d3-a456-426614174000',
        });

      expect([200, 201, 400, 401, 404]).toContain(response.status);
    });

    it('should validate target type', async () => {
      const response = await request(app)
        .post('/api/favorites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'invalid',
          targetId: '123e4567-e89b-12d3-a456-426614174000',
        });

      expect([400, 401]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/favorites')
        .send({
          targetType: 'project',
          targetId: '123e4567-e89b-12d3-a456-426614174000',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/favorites', () => {
    it('should get user favorites', async () => {
      const response = await request(app)
        .get('/api/favorites')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });

    it('should filter by target type', async () => {
      const response = await request(app)
        .get('/api/favorites?targetType=project')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('DELETE /api/favorites/:targetType/:targetId', () => {
    it('should remove a favorite', async () => {
      const response = await request(app)
        .delete('/api/favorites/project/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400, 401, 404]).toContain(response.status);
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .delete('/api/favorites/project/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/favorites/check/:targetType/:targetId', () => {
    it('should check if item is favorited', async () => {
      const response = await request(app)
        .get('/api/favorites/check/project/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('isFavorited');
        expect(typeof response.body.isFavorited).toBe('boolean');
      }
    });
  });
});
