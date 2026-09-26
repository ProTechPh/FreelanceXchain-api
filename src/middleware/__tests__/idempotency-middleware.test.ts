import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Request, Response } from 'express';
import { idempotencyMiddleware, clearIdempotencyCache } from '../idempotency-middleware.js';
import { EventEmitter } from 'events';

function createMockReq(overrides: Partial<Request> = {}): Request {
  const headers: Record<string, string> = {};
  return {
    method: 'POST',
    path: '/api/payments/milestones/m-1/approve',
    baseUrl: '',
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
    headers,
    user: { userId: 'user-123' },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): {
  res: Response;
  sentData: any;
  statusCode: number;
  headers: Record<string, string>;
  emitter: EventEmitter;
  setWritableEnded: (val: boolean) => void;
} {
  const emitter = new EventEmitter();
  let statusCode = 200;
  let sentData: any = null;
  const headers: Record<string, string> = {};
  let writableEnded = false;

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    json(body: any) {
      sentData = body;
      writableEnded = true;
      return this;
    },
    send(body: any) {
      sentData = body;
      writableEnded = true;
      return this;
    },
    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return this;
    },
    emit(event: string, ...args: any[]) {
      return emitter.emit(event, ...args);
    },
    get writableEnded() {
      return writableEnded;
    },
  } as unknown as Response;

  return {
    res,
    get sentData() { return sentData; },
    get statusCode() { return statusCode; },
    headers,
    emitter,
    setWritableEnded: (val: boolean) => { writableEnded = val; },
  };
}

describe('idempotencyMiddleware', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  afterEach(() => {
    clearIdempotencyCache();
  });

  it('should pass through when method is GET or non-mutating', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq({ method: 'GET' });
    const { res } = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should pass through when no idempotency header is provided', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq();
    const { res } = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should return 400 when idempotency key is empty', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq();
    (req.headers as any)['idempotency-key'] = '   ';
    const mockRes = createMockRes();
    const next = jest.fn();

    middleware(req, mockRes.res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(400);
  });

  it('should return 400 when idempotency key exceeds 255 chars', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq();
    (req.headers as any)['idempotency-key'] = 'a'.repeat(256);
    const mockRes = createMockRes();
    const next = jest.fn();

    middleware(req, mockRes.res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(400);
  });

  it('should process request and cache response on success', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq();
    (req.headers as any)['idempotency-key'] = 'tx-key-1';
    const mockRes = createMockRes();
    const next = jest.fn((() => {
      mockRes.res.status(200).json({ success: true, txHash: '0x123' });
    }) as any);

    middleware(req, mockRes.res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRes.headers['X-Idempotency-Key']).toBe('tx-key-1');
    expect(mockRes.sentData).toEqual({ success: true, txHash: '0x123' });
  });

  it('should replay cached response on duplicate request with same key', () => {
    const middleware = idempotencyMiddleware();
    const req1 = createMockReq();
    (req1.headers as any)['idempotency-key'] = 'tx-key-replay';
    const mockRes1 = createMockRes();
    let handlerCalled = 0;
    const next1 = jest.fn((() => {
      handlerCalled++;
      mockRes1.res.status(200).json({ paymentReleased: true, transactionHash: '0xabc' });
    }) as any);

    middleware(req1, mockRes1.res, next1);
    expect(handlerCalled).toBe(1);

    // Second request with same key
    const req2 = createMockReq();
    (req2.headers as any)['idempotency-key'] = 'tx-key-replay';
    const mockRes2 = createMockRes();
    const next2 = jest.fn((() => {
      handlerCalled++;
    }) as any);

    middleware(req2, mockRes2.res, next2);
    // Handler should NOT be called a second time
    expect(next2).not.toHaveBeenCalled();
    expect(handlerCalled).toBe(1);
    expect(mockRes2.headers['Idempotent-Replayed']).toBe('true');
    expect(mockRes2.headers['X-Idempotency-Key']).toBe('tx-key-replay');
    expect(mockRes2.sentData).toEqual({ paymentReleased: true, transactionHash: '0xabc' });
  });

  it('should return 409 Conflict when another request with the same key is in progress', () => {
    const middleware = idempotencyMiddleware();
    const req1 = createMockReq();
    (req1.headers as any)['idempotency-key'] = 'tx-in-flight';
    const mockRes1 = createMockRes();
    // Do not call res.json() yet -> still in progress
    middleware(req1, mockRes1.res, jest.fn());

    // Concurrent duplicate request arrives
    const req2 = createMockReq();
    (req2.headers as any)['idempotency-key'] = 'tx-in-flight';
    const mockRes2 = createMockRes();
    const next2 = jest.fn();

    middleware(req2, mockRes2.res, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(mockRes2.statusCode).toBe(409);
    expect(mockRes2.sentData.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('should not cache 5xx server errors, allowing retries', () => {
    const middleware = idempotencyMiddleware();
    const req1 = createMockReq();
    (req1.headers as any)['idempotency-key'] = 'tx-500-error';
    const mockRes1 = createMockRes();
    middleware(req1, mockRes1.res, () => {
      mockRes1.res.status(500).json({ error: 'Database timeout' });
    });

    // Retry request with same key
    const req2 = createMockReq();
    (req2.headers as any)['idempotency-key'] = 'tx-500-error';
    const mockRes2 = createMockRes();
    let retried = false;
    middleware(req2, mockRes2.res, () => {
      retried = true;
      mockRes2.res.status(200).json({ success: true });
    });

    expect(retried).toBe(true);
    expect(mockRes2.sentData).toEqual({ success: true });
  });

  it('should clean up in-progress key on connection abort before response completes', () => {
    const middleware = idempotencyMiddleware();
    const req1 = createMockReq();
    (req1.headers as any)['idempotency-key'] = 'tx-aborted';
    const mockRes1 = createMockRes();

    middleware(req1, mockRes1.res, jest.fn());

    // Connection aborted
    mockRes1.setWritableEnded(false);
    mockRes1.emitter.emit('close');

    // Should be able to process new request with the same key
    const req2 = createMockReq();
    (req2.headers as any)['idempotency-key'] = 'tx-aborted';
    const mockRes2 = createMockRes();
    let handled = false;
    middleware(req2, mockRes2.res, () => {
      handled = true;
      mockRes2.res.status(200).json({ success: true });
    });

    expect(handled).toBe(true);
  });

  it('should support X-Idempotency-Key header as alternative to Idempotency-Key', () => {
    const middleware = idempotencyMiddleware();
    const req = createMockReq();
    (req.headers as any)['x-idempotency-key'] = 'alt-key-1';
    const mockRes = createMockRes();
    const next = jest.fn((() => {
      mockRes.res.status(200).json({ ok: true });
    }) as any);

    middleware(req, mockRes.res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRes.headers['X-Idempotency-Key']).toBe('alt-key-1');
  });

  it('should support res.send with JSON string and replay it', () => {
    const middleware = idempotencyMiddleware();
    const req1 = createMockReq();
    (req1.headers as any)['idempotency-key'] = 'send-key';
    const mockRes1 = createMockRes();
    middleware(req1, mockRes1.res, () => {
      mockRes1.res.status(200).send(JSON.stringify({ message: 'done' }));
    });

    const req2 = createMockReq();
    (req2.headers as any)['idempotency-key'] = 'send-key';
    const mockRes2 = createMockRes();
    const next2 = jest.fn();
    middleware(req2, mockRes2.res, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(mockRes2.headers['Idempotent-Replayed']).toBe('true');
    expect(mockRes2.sentData).toEqual({ message: 'done' });
  });

  it('should isolate keys between different users', () => {
    const middleware = idempotencyMiddleware();
    const reqUserA = createMockReq({ user: { userId: 'user-A' } as any });
    (reqUserA.headers as any)['idempotency-key'] = 'same-key';
    const mockResA = createMockRes();
    middleware(reqUserA, mockResA.res, () => {
      mockResA.res.status(200).json({ forUser: 'A' });
    });

    const reqUserB = createMockReq({ user: { userId: 'user-B' } as any });
    (reqUserB.headers as any)['idempotency-key'] = 'same-key';
    const mockResB = createMockRes();
    let handledB = false;
    middleware(reqUserB, mockResB.res, () => {
      handledB = true;
      mockResB.res.status(200).json({ forUser: 'B' });
    });

    expect(handledB).toBe(true);
    expect(mockResB.sentData).toEqual({ forUser: 'B' });
  });
});

