import { jest, describe, it, expect } from '@jest/globals';
import { sendValidationError, sendErrorResponse, sendSuccessResponse, getRequestId } from '../../utils/response-helpers.js';

const mockReq = (headers: Record<string, string | null | undefined> | undefined = {}) =>
  ({ headers } as any);

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { status, json } as any;
}

describe('response-helpers', () => {
  describe('sendValidationError', () => {
    it('calls res.status(400) and sends correct JSON shape', () => {
      const res = mockRes();
      const errors = [{ field: 'email', message: 'Invalid email' }];
      sendValidationError(res, errors, 'req-1');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors,
        },
        timestamp: expect.any(String),
        requestId: 'req-1',
      });
    });

    it('defaults requestId to "unknown" when not provided', () => {
      const res = mockRes();
      sendValidationError(res, [{ field: 'name', message: 'Required' }]);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'unknown' })
      );
    });
  });

  describe('sendSuccessResponse', () => {
    it('calls res.status with the given statusCode and sends payload + metadata', () => {
      const res = mockRes();
      sendSuccessResponse(res, 201, { message: 'Created', id: 'item-1' }, 'req-6');

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Created',
        id: 'item-1',
        timestamp: expect.any(String),
        requestId: 'req-6',
      });
    });

    it('defaults requestId to "unknown" when not provided', () => {
      const res = mockRes();
      sendSuccessResponse(res, 200, { message: 'OK' });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'unknown' })
      );
    });

    it('appends a valid ISO 8601 timestamp', () => {
      const res = mockRes();
      sendSuccessResponse(res, 200, { message: 'OK' }, 'req-7');

      const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect(typeof body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
    });

    it('overrides payload timestamp/requestId keys with the appended metadata', () => {
      const res = mockRes();
      sendSuccessResponse(
        res,
        200,
        { message: 'OK', timestamp: 'user-ts', requestId: 'payload-req' },
        'real-req'
      );

      const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect(body.timestamp).not.toBe('user-ts');
      expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
      expect(body.requestId).toBe('real-req');
    });

    it('uses different status codes correctly', () => {
      const res1 = mockRes();
      const res2 = mockRes();
      sendSuccessResponse(res1, 200, { message: 'OK' });
      sendSuccessResponse(res2, 202, { message: 'Accepted' });

      expect(res1.status).toHaveBeenCalledWith(200);
      expect(res2.status).toHaveBeenCalledWith(202);
    });

    it('spreads all payload keys into the response body', () => {
      const res = mockRes();
      const payload = { message: 'Created', id: 'item-1', data: { nested: true } };
      sendSuccessResponse(res, 201, payload, 'req-8');

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining(payload));
    });
  });

  describe('sendErrorResponse', () => {
    it('calls res.status with the given statusCode and sends correct JSON', () => {
      const res = mockRes();
      sendErrorResponse(res, 404, 'NOT_FOUND', 'User not found', { requestId: 'req-2' });

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'User not found' },
        timestamp: expect.any(String),
        requestId: 'req-2',
      });
    });

    it('defaults requestId to "unknown" when not provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Something broke');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'unknown' })
      );
    });

    it('uses different status codes correctly', () => {
      const res1 = mockRes();
      const res2 = mockRes();
      const res3 = mockRes();

      sendErrorResponse(res1, 401, 'UNAUTHORIZED', 'No auth', { requestId: 'r1' });
      sendErrorResponse(res2, 403, 'FORBIDDEN', 'Denied', { requestId: 'r2' });
      sendErrorResponse(res3, 503, 'BLOCKCHAIN_ERROR', 'Down', { requestId: 'r3' });

      expect(res1.status).toHaveBeenCalledWith(401);
      expect(res2.status).toHaveBeenCalledWith(403);
      expect(res3.status).toHaveBeenCalledWith(503);
    });

    it('includes a top-level success flag when provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 400, 'OAUTH_ERROR', 'User denied access', { requestId: 'req-3', success: false });

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { code: 'OAUTH_ERROR', message: 'User denied access' },
        timestamp: expect.any(String),
        requestId: 'req-3',
      });
    });

    it('includes a top-level retryAfter field when provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', { requestId: 'req-4', retryAfter: 30 });

      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
        retryAfter: 30,
        timestamp: expect.any(String),
        requestId: 'req-4',
      });
    });

    it('omits retryAfter when not provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Missing', { requestId: 'req-5' });

      const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect('retryAfter' in body).toBe(false);
    });

    it('includes details inside the error object when provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 422, 'INVALID_INPUT', 'Bad data', { requestId: 'req-9', details: ['email required'] });

      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'INVALID_INPUT', message: 'Bad data', details: ['email required'] },
        timestamp: expect.any(String),
        requestId: 'req-9',
      });
    });

    it('omits the details key from the error object when not provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 400, 'BAD_REQUEST', 'Bad');

      const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect('details' in (body.error as Record<string, unknown>)).toBe(false);
    });

    it('supports a success: true flag', () => {
      const res = mockRes();
      sendErrorResponse(res, 200, 'OAUTH_OK', 'All good', { requestId: 'req-10', success: true });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        error: { code: 'OAUTH_OK', message: 'All good' },
        timestamp: expect.any(String),
        requestId: 'req-10',
      });
    });

    it('omits the success key when not provided', () => {
      const res = mockRes();
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Missing', { requestId: 'req-11' });

      const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
      expect('success' in body).toBe(false);
    });

    it('supports retryAfter as an ISO date string', () => {
      const res = mockRes();
      sendErrorResponse(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', { requestId: 'req-12', retryAfter: '2030-01-01T00:00:00.000Z' });

      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
        retryAfter: '2030-01-01T00:00:00.000Z',
        timestamp: expect.any(String),
        requestId: 'req-12',
      });
    });

    it('combines details, success flag, and retryAfter together', () => {
      const res = mockRes();
      sendErrorResponse(
        res,
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many requests',
        { requestId: 'req-13', details: { limit: 5, window: '1m' }, success: false, retryAfter: 30 }
      );

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: { limit: 5, window: '1m' },
        },
        retryAfter: 30,
        timestamp: expect.any(String),
        requestId: 'req-13',
      });
    });
  });

  describe('getRequestId (re-export)', () => {
    it('is importable from response-helpers and returns the x-request-id header value', () => {
      const req = mockReq({ 'x-request-id': 'req-abc-123' });
      expect(getRequestId(req)).toBe('req-abc-123');
    });

    it('returns "unknown" when the header is missing', () => {
      const req = mockReq({});
      expect(getRequestId(req)).toBe('unknown');
    });

    it('returns "unknown" when the header value is undefined', () => {
      const req = mockReq({ 'x-request-id': undefined });
      expect(getRequestId(req)).toBe('unknown');
    });

    it('returns "unknown" when the header value is null', () => {
      const req = mockReq({ 'x-request-id': null });
      expect(getRequestId(req)).toBe('unknown');
    });

    it('returns "unknown" when the request has no headers object', () => {
      const req = mockReq(undefined);
      expect(getRequestId(req)).toBe('unknown');
    });

    it('preserves an empty-string header value (fallback only fires on null/undefined)', () => {
      const req = mockReq({ 'x-request-id': '' });
      expect(getRequestId(req)).toBe('');
    });
  });
});
