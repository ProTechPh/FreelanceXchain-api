import { jest, describe, it, expect } from '@jest/globals';
import { getRequestId, sendError, sendServiceError, asyncHandler, extractBearerToken, sendValidationError, sendAuthError, sendSuccess } from '../../utils/route-helpers.js';
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

  describe('asyncHandler', () => {
    it('catches rejected promises and calls next', async () => {
      const fn = jest.fn<any>().mockRejectedValue(new Error('boom'));
      const wrapped = asyncHandler(fn);
      const next = jest.fn();
      await wrapped(mockReq({}), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('does not call next on success', async () => {
      const fn = jest.fn<any>().mockResolvedValue(undefined);
      const wrapped = asyncHandler(fn);
      const next = jest.fn();
      await wrapped(mockReq({}), mockRes(), next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from Bearer header', () => {
      const res = mockRes();
      const token = extractBearerToken(mockReq({ authorization: 'Bearer mytoken' }), res);
      expect(token).toBe('mytoken');
    });

    it('returns null and sends 401 when no authorization header', () => {
      const res = mockRes();
      const token = extractBearerToken(mockReq({}), res);
      expect(token).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('handles non-Bearer auth header', () => {
      const res = mockRes();
      const token = extractBearerToken(mockReq({ authorization: 'Basic abc' }), res);
      expect(token).toBe('abc');
    });
  });

  describe('sendValidationError', () => {
    it('sends 400 with validation error structure', () => {
      const res = mockRes();
      const errors = [{ field: 'email', message: 'Invalid email' }];
      sendValidationError(res, errors, 'req-1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', details: errors }),
        requestId: 'req-1',
      }));
    });

    it('defaults requestId to unknown', () => {
      const res = mockRes();
      sendValidationError(res, []);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'unknown' }));
    });
  });

  describe('sendAuthError', () => {
    it('maps DUPLICATE_EMAIL to 409', () => {
      const res = mockRes();
      sendAuthError(res, { code: 'DUPLICATE_EMAIL', message: 'dup' });
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('maps AUTH_INVALID_CREDENTIALS to 401', () => {
      const res = mockRes();
      sendAuthError(res, { code: 'AUTH_INVALID_CREDENTIALS', message: 'bad' });
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('maps NOT_FOUND to 404', () => {
      const res = mockRes();
      sendAuthError(res, { code: 'NOT_FOUND', message: 'gone' });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('defaults unknown code to 400', () => {
      const res = mockRes();
      sendAuthError(res, { code: 'SOMETHING_ELSE', message: 'huh' });
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('sendSuccess', () => {
    it('sends 200 by default', () => {
      const res = mockRes();
      sendSuccess(res, { ok: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('sends custom status code', () => {
      const res = mockRes();
      sendSuccess(res, { created: true }, 201);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});