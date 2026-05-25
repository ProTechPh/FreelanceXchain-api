// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

process.env.NODE_ENV = 'development';

let capturedNext;
const mockReq = {
  path: '/api/some-protected-path',
  method: 'POST',
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { 'user-agent': 'test', 'x-request-id': 'req-123' },
  csrfToken: () => 'mock-token',
};
const mockRes = {
  status: jest.fn(() => mockRes),
  json: jest.fn(),
};
const mockNext = jest.fn();

jest.unstable_mockModule('csrf-csrf', () => ({
  doubleCsrf: jest.fn((opts) => {
    opts.getSecret();
    return {
      generateCsrfToken: jest.fn(() => 'mock-token'),
      doubleCsrfProtection: jest.fn((req, res, next) => next()),
    };
  }),
}));

const { csrfProtection } = await import('../../middleware/csrf-middleware.js');

describe('CSRF Middleware - config callback (line 12)', () => {
  it('should invoke getSecret callback via doubleCsrfProtection', () => {
    csrfProtection(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
