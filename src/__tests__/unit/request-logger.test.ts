import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

const { requestLogger } = await import('../../middleware/request-logger.js');

describe('Request Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockRequest(overrides: any = {}): any {
    return {
      headers: {},
      method: 'GET',
      path: '/test',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'Mozilla/5.0';
        return undefined;
      }),
      ip: '127.0.0.1',
      ...overrides,
    };
  }

  function createMockResponse(statusCode = 200): any {
    const listeners: Record<string, Array<() => void>> = {};
    return {
      statusCode,
      on: jest.fn((event: string, callback: () => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      }),
      trigger: (event: string) => {
        listeners[event]?.forEach(cb => cb());
      },
    };
  }

  it('should log incoming request details', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    requestLogger(req, res, () => {});

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        type: 'request',
        method: 'GET',
        path: '/test',
      }),
    );
  });

  it('should log error for status >= 500', () => {
    const req = createMockRequest();
    const res = createMockResponse(500);

    requestLogger(req, res, () => {});
    res.trigger('finish');

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Request completed with error',
      undefined,
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('should log warn for status 400-499', () => {
    const req = createMockRequest();
    const res = createMockResponse(404);

    requestLogger(req, res, () => {});
    res.trigger('finish');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Request completed with client error',
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('should log info for status 200-399', () => {
    const req = createMockRequest();
    const res = createMockResponse(200);

    requestLogger(req, res, () => {});
    res.trigger('finish');

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({ statusCode: 200 }),
    );
  });

  it('should generate requestId if not provided', () => {
    const req = createMockRequest({ headers: {} });
    const res = createMockResponse();

    requestLogger(req, res, () => {});

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        requestId: expect.any(String),
      }),
    );
  });

  it('should use existing requestId from header', () => {
    const req = createMockRequest({ headers: { 'x-request-id': 'req-123' } });
    const res = createMockResponse();

    requestLogger(req, res, () => {});

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Incoming request',
      expect.objectContaining({
        requestId: 'req-123',
      }),
    );
  });
});
