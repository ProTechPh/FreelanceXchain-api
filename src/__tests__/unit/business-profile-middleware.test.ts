// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetCompleteness = jest.fn<any>();
const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/services/employer-business-document-service.ts'), () => ({
  getBusinessProfileCompleteness: mockGetCompleteness,
}));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

const { requireCompleteBusinessProfile } = await import('../../middleware/business-profile-middleware.js');

function createRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('requireCompleteBusinessProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated requests', async () => {
    const res = createRes();
    const next = jest.fn();
    await requireCompleteBusinessProfile({ headers: {} } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets admins through without checking', async () => {
    const next = jest.fn();
    await requireCompleteBusinessProfile({ headers: {}, user: { userId: 'a', role: 'admin' } } as any, createRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockGetCompleteness).not.toHaveBeenCalled();
  });

  it('allows employers with a complete business profile', async () => {
    mockGetCompleteness.mockResolvedValueOnce({ success: true, data: { complete: true, missingFields: [], missingDocuments: [] } });
    const next = jest.fn();
    await requireCompleteBusinessProfile({ headers: {}, user: { userId: 'e', role: 'employer' } } as any, createRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 with the missing items when incomplete', async () => {
    mockGetCompleteness.mockResolvedValueOnce({ success: true, data: { complete: false, missingFields: ['tin'], missingDocuments: ['bir_2303'] } });
    const res = createRes();
    const next = jest.fn();
    await requireCompleteBusinessProfile({ headers: {}, user: { userId: 'e', role: 'employer' } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('BUSINESS_PROFILE_INCOMPLETE');
    expect(body.error.details).toEqual({ missingFields: ['tin'], missingDocuments: ['bir_2303'] });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the employer has no profile', async () => {
    mockGetCompleteness.mockResolvedValueOnce({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'x' } });
    const res = createRes();
    await requireCompleteBusinessProfile({ headers: {}, user: { userId: 'e', role: 'employer' } } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error.code).toBe('BUSINESS_PROFILE_INCOMPLETE');
  });

  it('returns 500 when the check throws', async () => {
    mockGetCompleteness.mockRejectedValueOnce(new Error('db down'));
    const res = createRes();
    await requireCompleteBusinessProfile({ headers: {}, user: { userId: 'e', role: 'employer' } } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('BUSINESS_PROFILE_CHECK_FAILED');
  });
});
