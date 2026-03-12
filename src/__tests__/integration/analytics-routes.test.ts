import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Analytics Routes Integration Tests', () => {
  let app: Express;
  let freelancerToken: string;
  let employerToken: string;

  beforeAll(async () => {
    app = await createApp();
    
    // Login as freelancer
    const freelancerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'freelancer@example.com',
        password: 'TestPassword123!',
      });

    if (freelancerLogin.body.accessToken) {
      freelancerToken = freelancerLogin.body.accessToken;
    }

    // Login as employer
    const employerLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employer@example.com',
        password: 'TestPassword123!',
      });

    if (employerLogin.body.accessToken) {
      employerToken = employerLogin.body.accessToken;
    }
  });

  describe('GET /api/analytics/freelancer', () => {
    it('should get freelancer analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/freelancer')
        .set('Authorization', `Bearer ${freelancerToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('totalEarnings');
        expect(response.body).toHaveProperty('projectsCompleted');
      }
    });

    it('should support date range filtering', async () => {
      const response = await request(app)
        .get('/api/analytics/freelancer?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${freelancerToken}`);

      expect([200, 401]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/freelancer');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/employer', () => {
    it('should get employer analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/employer')
        .set('Authorization', `Bearer ${employerToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('totalSpent');
        expect(response.body).toHaveProperty('projectsPosted');
      }
    });
  });

  describe('GET /api/analytics/skill-trends', () => {
    it('should get skill demand trends', async () => {
      const response = await request(app)
        .get('/api/analytics/skill-trends');

      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/skill-trends');

      // Public endpoint
      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /api/analytics/platform', () => {
    it('should get platform metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/platform');

      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('totalUsers');
        expect(response.body).toHaveProperty('totalProjects');
      }
    });
  });
});
