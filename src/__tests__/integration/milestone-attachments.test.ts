import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Milestone Attachments Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('Milestone File Upload Endpoints', () => {
    it('should have milestone upload endpoint available', async () => {
      const response = await request(app)
        .post('/api/milestones/test-id/upload-deliverables')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    it('should have milestone submit with files endpoint available', async () => {
      const response = await request(app)
        .post('/api/milestones/test-id/submit-with-files')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    it('should have regular milestone submit endpoint available', async () => {
      const response = await request(app)
        .post('/api/milestones/test-id/submit')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });
  });
});