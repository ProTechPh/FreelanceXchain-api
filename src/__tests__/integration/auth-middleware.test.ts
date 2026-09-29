import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import type { Request, Response } from 'express';

// Mocks are handled by jest.setup.ts

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

/** Mocked Didit KYC lookup used by requireVerifiedKyc / requireTieredKyc. */
const mockIsUserVerified = jest.fn<any>(async () => false);

jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  isUserVerified: mockIsUserVerified,
}));

// Imported dynamically so the didit-kyc-service mock above is applied.
const { authMiddleware, requireTieredKyc } = await import('../../middleware/auth-middleware.js');

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

describe('requireTieredKyc Integration', () => {
  let app: express.Express;

  /** Reads the ETH amount off the JSON body; used as the tiered-KYC extractor. */
  const getAmount = (req: Request) => req.body?.amount as number | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsUserVerified.mockResolvedValue(false);

    app = express();
    app.use(express.json());

    // Authenticated tiered-KYC route (default 0.1 ETH threshold)
    app.post(
      '/tiered-kyc',
      authMiddleware,
      requireTieredKyc(getAmount, 0.1),
      (req: Request, res: Response) => {
        res.status(200).json({ ok: true, user: req.user });
      }
    );

    // Same guard WITHOUT authMiddleware, to cover its own !req.user branch
    app.post(
      '/tiered-kyc-unauthenticated',
      requireTieredKyc(getAmount, 0.1),
      (req: Request, res: Response) => {
        res.status(200).json({ ok: true, user: req.user });
      }
    );
  });

  it('should allow access for admin users regardless of amount or KYC status', async () => {
    (globalThis as any).__mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'admin-user-id', email: 'admin@test.com', role: 'admin', is_suspended: false, permissions: ['*'],
    });

    const response = await request(app)
      .post('/tiered-kyc')
      .set('Authorization', 'Bearer test-session-secret')
      .send({ amount: 5 });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
    // Admins bypass the KYC check entirely
    expect(mockIsUserVerified).not.toHaveBeenCalled();
  });

  it('should allow micro-transaction amounts below the threshold without full KYC', async () => {
    (globalThis as any).__mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: false,
    });

    const response = await request(app)
      .post('/tiered-kyc')
      .set('Authorization', 'Bearer test-session-secret')
      .send({ amount: 0.05 });

    expect(response.status).toBe(200);
    // Micro-contract exemption short-circuits before the Didit lookup
    expect(mockIsUserVerified).not.toHaveBeenCalled();
  });

  it('should enforce full KYC for amounts at or above the threshold', async () => {
    (globalThis as any).__mockDatabases.getDocument.mockResolvedValue({
      $id: 'test-user-id', email: 'test@test.com', role: 'freelancer', is_suspended: false,
    });

    // At the threshold (0.1 ETH) with no KYC on file -> blocked
    mockIsUserVerified.mockResolvedValueOnce(false);
    const blocked = await request(app)
      .post('/tiered-kyc')
      .set('Authorization', 'Bearer test-session-secret')
      .send({ amount: 0.1 });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('KYC_REQUIRED');
    expect(mockIsUserVerified).toHaveBeenCalledWith('test-user-id');

    // Above the threshold but KYC verified -> allowed through
    mockIsUserVerified.mockResolvedValueOnce(true);
    const allowed = await request(app)
      .post('/tiered-kyc')
      .set('Authorization', 'Bearer test-session-secret')
      .send({ amount: 1.5 });

    expect(allowed.status).toBe(200);
    expect(mockIsUserVerified).toHaveBeenCalledTimes(2);
  });

  it('should reject unauthenticated requests', async () => {
    // authMiddleware rejects first when mounted before the tiered guard
    const withAuth = await request(app)
      .post('/tiered-kyc')
      .send({ amount: 0.05 });
    expect(withAuth.status).toBe(401);
    expect(withAuth.body.error.code).toBe('AUTH_MISSING_TOKEN');

    // Without authMiddleware, requireTieredKyc itself rejects the request
    const withoutAuth = await request(app)
      .post('/tiered-kyc-unauthenticated')
      .send({ amount: 0.05 });
    expect(withoutAuth.status).toBe(401);
    expect(withoutAuth.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(mockIsUserVerified).not.toHaveBeenCalled();
  });
});