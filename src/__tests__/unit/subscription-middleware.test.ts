// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockIsPro = jest.fn<any>();
const mockIsDevProGrantActive = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({
  isPro: mockIsPro,
  isDevProGrantActive: mockIsDevProGrantActive,
}));

const { requirePro, PLAN_UPGRADE_REQUIRED } = await import('../../middleware/subscription-middleware.js');

function createRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requirePro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDevProGrantActive.mockReturnValue(false);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {} } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockIsPro).not.toHaveBeenCalled();
  });

  it('lets an admin through without reading the entitlement at all', async () => {
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {}, user: { userId: 'admin-1', role: 'admin' } } as any, res, next);

    expect(next).toHaveBeenCalled();
    // The admin bypass must short-circuit before any I/O.
    expect(mockIsPro).not.toHaveBeenCalled();
  });

  it('lets a Pro user through', async () => {
    mockIsPro.mockResolvedValue(true);
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {}, user: { userId: 'u1', role: 'freelancer' } } as any, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks a free user with 403 PLAN_UPGRADE_REQUIRED', async () => {
    mockIsPro.mockResolvedValue(false);
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {}, user: { userId: 'u1', role: 'freelancer' }, path: '/x', method: 'GET' } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: PLAN_UPGRADE_REQUIRED }) })
    );
  });

  it('answers 503, NOT 403, when the entitlement cannot be read', async () => {
    // A paying customer must never see a paywall because the datastore blipped.
    mockIsPro.mockRejectedValue(new Error('appwrite down'));
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {}, user: { userId: 'u1', role: 'employer' }, path: '/x', method: 'GET' } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('lets everyone through when the dev grant is active', async () => {
    mockIsDevProGrantActive.mockReturnValue(true);
    const res = createRes();
    const next = jest.fn();

    await requirePro({ headers: {}, user: { userId: 'u1', role: 'freelancer' } } as any, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockIsPro).not.toHaveBeenCalled();
  });
});
