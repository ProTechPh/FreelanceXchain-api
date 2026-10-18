// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const negotiationMocks = {
  getNegotiation: jest.fn<any>(),
  createOffer: jest.fn<any>(),
  acceptOffer: jest.fn<any>(),
  declineOffer: jest.fn<any>(),
  withdrawOffer: jest.fn<any>(),
  reopenNegotiation: jest.fn<any>(),
};
const signatureMocks = {
  getSigningPayload: jest.fn<any>(),
  listSignatures: jest.fn<any>(),
  submitSignature: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/services/contract-negotiation-service.ts'), () => negotiationMocks);
jest.unstable_mockModule(resolveModule('src/services/contract-signature-service.ts'), () => signatureMocks);

let currentUser: any = { userId: 'user-1', role: 'employer' };
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = currentUser ?? undefined; next(); },
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  walletRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), async () => {
  const real = await import('../../middleware/validation-core.js');
  return { ...real, validateAppwriteDocumentId: jest.fn(() => (_req: any, _res: any, next: any) => next()) };
});

const router = (await import('../../routes/contract-negotiation-routes.js')).default;

const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message = 'nope', details?: string[]) => ({ success: false, error: { code, message, ...(details ? { details } : {}) } });

const validOffer = {
  baseAmount: 2,
  isRush: false,
  deadline: '2099-01-01',
  milestones: [{ title: 'All', amount: 2, dueDate: '2098-12-01' }],
};
const validSignature = {
  termsHash: `0x${'a'.repeat(64)}`,
  signatureType: 'typed',
  typedName: 'Fred',
  walletAddress: `0x${'b'.repeat(40)}`,
  walletSignature: `0x${'c'.repeat(130)}`,
  consent: true,
};

describe('Contract negotiation routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { userId: 'user-1', role: 'employer' };
    app = express();
    app.use(express.json());
    app.use('/api/contracts', router);
  });

  it('returns the negotiation state', async () => {
    negotiationMocks.getNegotiation.mockResolvedValue(ok({ role: 'employer' }));
    const res = await request(app).get('/api/contracts/c1/negotiation');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'employer' });
    expect(negotiationMocks.getNegotiation).toHaveBeenCalledWith('c1', 'user-1', 'employer');
  });

  it('maps service errors to HTTP statuses', async () => {
    const cases: Array<[string, number]> = [
      ['NOT_FOUND', 404], ['UNAUTHORIZED', 403], ['OFFER_NOT_OPEN', 409], ['UPDATE_FAILED', 500], ['FLOOR_VIOLATION', 400],
    ];
    for (const [code, status] of cases) {
      negotiationMocks.getNegotiation.mockResolvedValueOnce(fail(code));
      const res = await request(app).get('/api/contracts/c1/negotiation');
      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
    }
    negotiationMocks.createOffer.mockResolvedValueOnce(fail('AMOUNT_MISMATCH', 'sum', ['milestones: Must sum to 2']));
    const res = await request(app).post('/api/contracts/c1/offers').send(validOffer);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(['milestones: Must sum to 2']);
  });

  it('rejects unauthenticated requests', async () => {
    currentUser = null;
    const res = await request(app).get('/api/contracts/c1/negotiation');
    expect(res.status).toBe(401);
  });

  it('creates offers after schema validation', async () => {
    negotiationMocks.createOffer.mockResolvedValue(ok({ id: 'o1' }));
    const res = await request(app).post('/api/contracts/c1/offers').send(validOffer);
    expect(res.status).toBe(201);
    expect(negotiationMocks.createOffer).toHaveBeenCalledWith('c1', 'user-1', validOffer);

    const bad = await request(app).post('/api/contracts/c1/offers').send({ ...validOffer, milestones: [] });
    expect(bad.status).toBe(400);
    const extra = await request(app).post('/api/contracts/c1/offers').send({ ...validOffer, totalAmount: 99 });
    expect(extra.status).toBe(400);
  });

  it('accepts, declines, withdraws and reopens', async () => {
    negotiationMocks.acceptOffer.mockResolvedValue(ok({ status: 'awaiting_signatures' }));
    negotiationMocks.declineOffer.mockResolvedValue(ok({ contractCancelled: true }));
    negotiationMocks.withdrawOffer.mockResolvedValue(ok({ status: 'withdrawn' }));
    negotiationMocks.reopenNegotiation.mockResolvedValue(ok({ status: 'negotiating' }));

    expect((await request(app).post('/api/contracts/c1/offers/o1/accept').send({})).body.status).toBe('awaiting_signatures');
    expect(negotiationMocks.acceptOffer).toHaveBeenCalledWith('c1', 'o1', 'user-1');

    const declined = await request(app).post('/api/contracts/c1/offers/o1/decline').send({ reason: 'low', endNegotiation: true });
    expect(declined.body.contractCancelled).toBe(true);
    expect(negotiationMocks.declineOffer).toHaveBeenCalledWith('c1', 'o1', 'user-1', { reason: 'low', endNegotiation: true });
    await request(app).post('/api/contracts/c1/offers/o1/decline').send({});
    expect(negotiationMocks.declineOffer).toHaveBeenLastCalledWith('c1', 'o1', 'user-1', { reason: null, endNegotiation: false });

    expect((await request(app).post('/api/contracts/c1/offers/o1/withdraw').send({})).body.status).toBe('withdrawn');
    expect((await request(app).post('/api/contracts/c1/negotiation/reopen').send({})).body.status).toBe('negotiating');

    for (const [mock, url] of [
      [negotiationMocks.acceptOffer, '/api/contracts/c1/offers/o1/accept'],
      [negotiationMocks.declineOffer, '/api/contracts/c1/offers/o1/decline'],
      [negotiationMocks.withdrawOffer, '/api/contracts/c1/offers/o1/withdraw'],
      [negotiationMocks.reopenNegotiation, '/api/contracts/c1/negotiation/reopen'],
    ] as const) {
      mock.mockResolvedValueOnce(fail('INVALID_STATUS'));
      expect((await request(app).post(url).send({})).status).toBe(409);
    }
  });

  it('serves the signing payload and signatures', async () => {
    signatureMocks.getSigningPayload.mockResolvedValue(ok({ termsHash: '0x1' }));
    signatureMocks.listSignatures.mockResolvedValue(ok([{ id: 's1' }]));
    expect((await request(app).get('/api/contracts/c1/signing-payload')).body.termsHash).toBe('0x1');
    expect((await request(app).get('/api/contracts/c1/signatures')).body).toEqual([{ id: 's1' }]);
    signatureMocks.getSigningPayload.mockResolvedValueOnce(fail('TERMS_NOT_LOCKED'));
    expect((await request(app).get('/api/contracts/c1/signing-payload')).status).toBe(409);
    signatureMocks.listSignatures.mockResolvedValueOnce(fail('NOT_FOUND'));
    expect((await request(app).get('/api/contracts/c1/signatures')).status).toBe(404);
  });

  it('submits signatures with request metadata', async () => {
    signatureMocks.submitSignature.mockResolvedValue(ok({ contract: { status: 'awaiting_funding' } }));
    const res = await request(app).post('/api/contracts/c1/signatures').set('User-Agent', 'jest-agent').send(validSignature);
    expect(res.status).toBe(201);
    expect(signatureMocks.submitSignature).toHaveBeenCalledWith('c1', 'user-1', validSignature, expect.objectContaining({ userAgent: 'jest-agent' }));

    const badHash = await request(app).post('/api/contracts/c1/signatures').send({ ...validSignature, termsHash: '0x12' });
    expect(badHash.status).toBe(400);

    signatureMocks.submitSignature.mockResolvedValueOnce(fail('FREELANCER_SIGNATURE_REQUIRED'));
    expect((await request(app).post('/api/contracts/c1/signatures').send(validSignature)).status).toBe(409);
  });
});
