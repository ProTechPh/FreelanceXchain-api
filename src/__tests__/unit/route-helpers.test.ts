import { jest, describe, it, expect } from '@jest/globals';
import { getRequestId, sendError, sendServiceError } from '../../utils/route-helpers.js';
import type { ServiceResult } from '../../types/service-result.js';

const mockReq = (headers: Record<string, string | undefined> = {}) =>
  ({ headers } as any);

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { status, json } as any;
}

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
    it('calls res.status with the given statusCode', () => {
      const res = mockRes();
      sendError(res, 422, { code: 'INVALID', message: 'bad' }, 'rid-1');
      expect(res.status).toHaveBeenCalledWith(422);
    });

    it('calls res.json with correct shape including error, timestamp, requestId', () => {
      const res = mockRes();
      sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'Invalid input' }, 'rid-2');
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
        timestamp: expect.any(String),
        requestId: 'rid-2',
      });
    });

    it('includes details field when provided', () => {
      const res = mockRes();
      sendError(res, 422, { code: 'INVALID_INPUT', message: 'Bad data', details: ['email required'] }, 'rid-3');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ details: ['email required'] }),
        })
      );
    });

    it('uses different status codes correctly', () => {
      const res = mockRes();
      sendError(res, 500, { code: 'INTERNAL', message: 'oops' }, 'rid-4');
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('defaults requestId to unknown when not provided', () => {
      const res = mockRes();
      sendError(res, 400, { code: 'ERR', message: 'msg' });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'unknown' })
      );
    });
  });

  describe('sendServiceError', () => {
    it('does nothing when result is successful', () => {
      const res = mockRes();
      const result: ServiceResult<never> = { success: true, data: 'ok' as never };
      sendServiceError(res, result, 'rid-0');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('defaults to 400 when no statusMap is provided', () => {
      const res = mockRes();
      const result: ServiceResult<never> = {
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong' },
      };
      sendServiceError(res, result, 'rid-1');
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('defaults to 400 when statusMap does not contain the error code', () => {
      const res = mockRes();
      const result: ServiceResult<never> = {
        success: false,
        error: { code: 'CUSTOM_ERROR', message: 'No access' },
      };
      sendServiceError(res, result, 'rid-2', { NOT_FOUND: 404 });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('uses mapped status code when statusMap contains the error code', () => {
      const res = mockRes();
      const result: ServiceResult<never> = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' },
      };
      sendServiceError(res, result, 'rid-3', { NOT_FOUND: 404, FORBIDDEN: 403 });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sends json with error structure including code, message, details, timestamp, requestId', () => {
      const res = mockRes();
      const result: ServiceResult<never> = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: ['name required'] },
      };
      sendServiceError(res, result, 'rid-4');
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          details: ['name required'],
        },
        timestamp: expect.any(String),
        requestId: 'rid-4',
      });
    });

    it('sends json without details when error has no details', () => {
      const res = mockRes();
      const result: ServiceResult<never> = {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Crash' },
      };
      sendServiceError(res, result, 'rid-5');
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'SERVER_ERROR',
          message: 'Crash',
          details: undefined,
        },
        timestamp: expect.any(String),
        requestId: 'rid-5',
      });
    });

    it('maps multiple error codes correctly', () => {
      const res1 = mockRes();
      const res2 = mockRes();
      const statusMap = { NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401 };

      const resultNotFound: ServiceResult<never> = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Missing' },
      };
      sendServiceError(res1, resultNotFound, 'r1', statusMap);
      expect(res1.status).toHaveBeenCalledWith(404);

      const resultForbidden: ServiceResult<never> = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Denied' },
      };
      sendServiceError(res2, resultForbidden, 'r2', statusMap);
      expect(res2.status).toHaveBeenCalledWith(403);
    });
  });
});