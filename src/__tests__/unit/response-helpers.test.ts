import { jest, describe, it, expect } from '@jest/globals';
import { sendValidationError, sendErrorResponse } from '../../utils/response-helpers.js';

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

  describe('sendErrorResponse', () => {
    it('calls res.status with the given statusCode and sends correct JSON', () => {
      const res = mockRes();
      sendErrorResponse(res, 404, 'NOT_FOUND', 'User not found', 'req-2');

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

      sendErrorResponse(res1, 401, 'UNAUTHORIZED', 'No auth', 'r1');
      sendErrorResponse(res2, 403, 'FORBIDDEN', 'Denied', 'r2');
      sendErrorResponse(res3, 503, 'BLOCKCHAIN_ERROR', 'Down', 'r3');

      expect(res1.status).toHaveBeenCalledWith(401);
      expect(res2.status).toHaveBeenCalledWith(403);
      expect(res3.status).toHaveBeenCalledWith(503);
    });
  });
});
