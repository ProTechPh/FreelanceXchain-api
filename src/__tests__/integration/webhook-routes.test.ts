import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import path from 'node:path';
import crypto from 'crypto';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Webhook Routes Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    jest.unstable_mockModule(resolveModule('src/services/didit-client.ts'), () => ({
      verifyWebhookSignature: jest.fn(() => true),
      createVerificationSession: jest.fn(),
      getVerificationDecision: jest.fn(),
      getVerificationSession: jest.fn(),
      verifyIdDocument: jest.fn(),
      checkPassiveLiveness: jest.fn(),
      matchFaces: jest.fn(),
      screenAml: jest.fn(),
    }));

    jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
      processWebhook: jest.fn(async () => ({
        success: true,
        data: { status: 'processed' },
      })),
      initiateKycVerification: jest.fn(),
      getKycStatus: jest.fn(),
      getKycById: jest.fn(),
      refreshVerificationStatus: jest.fn(),
      getProfileDataFromKyc: jest.fn(),
      adminReviewVerification: jest.fn(),
      getPendingAdminReviews: jest.fn(),
      getVerificationsByStatus: jest.fn(),
      getUserVerificationHistory: jest.fn(),
      isUserVerified: jest.fn(() => true),
      manualKycVerification: jest.fn(),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('POST /api/kyc/webhook', () => {
    it('should process a valid Didit webhook', async () => {
      const response = await request(app)
        .post('/api/kyc/webhook')
        .set('x-signature-v2', 'valid-signature')
        .set('x-timestamp', '1234567890')
        .send({
          event_id: 'evt-123',
          webhook_type: 'status.updated',
          session_id: 'session-123',
          status: 'Approved',
          timestamp: 1234567890,
          created_at: 1234567890,
          decision: {},
          vendor_data: 'user-123',
          metadata: {},
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Webhook processed');
    });

    it('should reject invalid signature', async () => {
      const { verifyWebhookSignature } = await import('../../services/didit-client.js');
      (verifyWebhookSignature as jest.Mock).mockReturnValueOnce(false);

      const response = await request(app)
        .post('/api/kyc/webhook')
        .set('x-signature-v2', 'invalid-signature')
        .set('x-timestamp', '1234567890')
        .send({
          event_id: 'evt-456',
          webhook_type: 'status.updated',
          session_id: 'session-123',
          status: 'Approved',
          timestamp: 1234567890,
          created_at: 1234567890,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .post('/api/kyc/webhook')
        .set('x-signature-v2', 'valid-signature')
        .set('x-timestamp', '1234567890')
        .send({
          event_id: 'evt-789',
          webhook_type: 'status.updated',
          session_id: 'session-123',
          status: 'Approved',
          timestamp: 1234567890,
          created_at: 1234567890,
        });

      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/webhooks/blockchain', () => {
    beforeAll(() => {
      process.env['BLOCKCHAIN_WEBHOOK_SECRET'] = 'test-blockchain-secret';
    });

    const hmacSignature = (payload: string) =>
      crypto.createHmac('sha256', process.env['BLOCKCHAIN_WEBHOOK_SECRET']!)
        .update(payload)
        .digest('hex');

    it('should acknowledge duplicate events without re-processing', async () => {
      const payload = { event: 'payment.released', data: { transactionHash: '0xdup1', amount: '100' } };
      const body = JSON.stringify(payload);
      const signature = hmacSignature(body);

      const first = await request(app)
        .post('/api/webhooks/blockchain')
        .set('x-blockchain-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(first.status).toBe(200);
      expect(first.body).toEqual({ received: true });

      const duplicate = await request(app)
        .post('/api/webhooks/blockchain')
        .set('x-blockchain-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(duplicate.status).toBe(200);
      expect(duplicate.body).toEqual({ received: true, duplicate: true });
    });

    it('should reject missing signature', async () => {
      const response = await request(app)
        .post('/api/webhooks/blockchain')
        .send({ event: 'payment.released', data: {} });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Missing signature');
    });

    it('should reject invalid signature', async () => {
      const response = await request(app)
        .post('/api/webhooks/blockchain')
        .set('x-blockchain-signature', 'invalid-signature')
        .send({ event: 'payment.released', data: {} });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid signature');
    });

    it('should reject invalid signature', async () => {
      const response = await request(app)
        .post('/api/webhooks/blockchain')
        .set('x-blockchain-signature', 'any-signature')
        .send({ event: 'test', data: {} });

      expect(response.status).toBe(401);
    });
  });
});
