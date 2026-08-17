import { jest, describe, it, expect } from '@jest/globals';
import { getRequestId, sendError, sendServiceError } from '../../utils/route-helpers.js';
import type { ServiceResult } from '../../types/service-result.js';

const mockReq = (headers: Record<string, string | undefined> = {}) =>
  ({ headers } as any);

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as any;
};

describe('route-helpers', () => {
  describe('getRequestId', () => {
    it('returns x-request-id header value when present', () => {
      const req = mockReq({ 'x-request-id': 'req-abc-123' });
      expect(getRequestId(req)).toBe('req-abc-123');
    });

    it('returns "unknown" when header is missing', () => {
      const req = mockReq({});
      expect(getRequestId(req)).toBe('unknown');
    });

    it('returns "unknown" when header is undefined', () => {
      const req = mockReq({ 'x-request-id': undefined });
      expect(getRequestId(req)).toBe('unknown');
    });
  });

  describe('sendError', () => {
    it('sends the error response with requestId and details', () => {
      const res = mockRes();
      sendError(res, 404, { code: 'NOT_FOUND', message: 'Missing', details: { id: 1 } }, 'req-1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: { code: 'NOT_FOUND', message: 'Missing', details: { id: 1 } },
        requestId: 'req-1',
      }));
    });

    it('omits requestId and details when not provided', () => {
      const res = mockRes();
      sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'Bad' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: { code: 'VALIDATION_ERROR', message: 'Bad' },
        requestId: 'unknown',
      }));
    });
  });

  describe('sendServiceError', () => {
    const err = (code: string): ServiceResult<never> => ({
      success: false,
      error: { code, message: 'msg' },
    });

    it('does nothing when the result is successful', () => {
      const res = mockRes();
      const ok: ServiceResult<unknown> = { success: true, data: {} };
      sendServiceError(res, ok);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('maps known error codes to their default status', () => {
      const res = mockRes();
      sendServiceError(res, err('NOT_FOUND'));
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: { code: 'NOT_FOUND', message: 'msg' },
      }));
    });

    it('falls back to 400 for unmapped codes', () => {
      const res = mockRes();
      sendServiceError(res, err('SOMETHING_ELSE'));
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('lets a provided statusMap override the default', () => {
      const res = mockRes();
      sendServiceError(res, err('NOT_FOUND'), undefined, { NOT_FOUND: 410 });
      expect(res.status).toHaveBeenCalledWith(410);
    });

    it('passes the requestId through to sendError', () => {
      const res = mockRes();
      sendServiceError(res, err('INTERNAL_ERROR'), 'req-9');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-9' }));
    });
  });
});