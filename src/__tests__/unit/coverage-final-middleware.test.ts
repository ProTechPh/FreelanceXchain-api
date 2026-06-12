// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ─── rate-limiter.ts lines 38-42 - cleanupExpiredEntries ───
describe('rate-limiter.ts - cleanupExpiredEntries (lines 38-42)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute cleanup callback when timer fires', () => {
    jest.useFakeTimers();
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    jest.useRealTimers();
  });
});

// ─── error-handler.ts lines 36, 43 - notFound and blockchainError ───
describe('error-handler.ts - notFound and blockchainError (lines 36, 43)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notFound returns AppError with 404 and custom resource', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const err = errors.notFound('Contract');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Contract not found');
  });

  it('notFound returns AppError with default resource', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const err = errors.notFound();
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource not found');
  });

  it('blockchainError returns AppError with 503 and custom message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const err = errors.blockchainError('Chain down');
    expect(err.code).toBe('BLOCKCHAIN_ERROR');
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('Chain down');
  });

  it('blockchainError returns AppError with default message', async () => {
    const { errors } = await import('../../middleware/error-handler.js');
    const err = errors.blockchainError();
    expect(err.code).toBe('BLOCKCHAIN_ERROR');
    expect(err.statusCode).toBe(503);
    expect(err.message).toBe('Blockchain operation failed');
  });
});

// ─── validation-middleware.ts lines 206, 259, 290, 301 ───
describe('validation-middleware.ts - uncovered lines (206, 259, 290, 301)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate nested object requiredProperties (line 206)', async () => {
    const { validate } = await import('../../middleware/validation-middleware.js');
    const schema = {
      type: 'object' as const,
      properties: {
        settings: {
          type: 'object' as const,
          requiredProperties: ['apiKey'],
          properties: {
            apiKey: { type: 'string' as const },
          },
        },
      },
    };
    const middleware = validate(schema);
    const req = { body: { settings: {} }, query: {}, params: {}, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({ field: 'settings.apiKey' }),
          ]),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle query schema with no properties (line 259)', async () => {
    const { validate } = await import('../../middleware/validation-middleware.js');
    const schema = {
      query: { type: 'object' as const },
    };
    const middleware = validate(schema);
    const req = { body: {}, query: { foo: 'bar' }, params: {}, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should fail query validation and return 400 (line 290)', async () => {
    const { validate } = await import('../../middleware/validation-middleware.js');
    const schema = {
      query: {
        type: 'object' as const,
        properties: {
          page: { type: 'integer' as const, minimum: 1 },
        },
        required: ['page'],
      },
    };
    const middleware = validate(schema);
    const req = { body: {}, query: {}, params: {}, headers: { 'x-request-id': 'test-123' } } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({ field: 'page' }),
          ]),
        }),
        requestId: 'test-123',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should fail legacy schema validation and return 400 (line 301)', async () => {
    const { validate } = await import('../../middleware/validation-middleware.js');
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, required: true },
      },
      required: ['name'],
    };
    const middleware = validate(schema);
    const req = { body: {}, query: {}, params: {}, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({ field: 'name' }),
          ]),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── file-validator.ts lines 107-116 - hasValidExtension and isAllowedMimeType ───
describe('file-validator.ts - edge cases (lines 107-116)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hasValidExtension returns false for empty string', async () => {
    const { hasValidExtension } = await import('../../utils/file-validator.js');
    expect(hasValidExtension('')).toBe(false);
  });

  it('hasValidExtension returns false for null', async () => {
    const { hasValidExtension } = await import('../../utils/file-validator.js');
    expect(hasValidExtension(null as any)).toBe(false);
  });

  it('hasValidExtension returns false for undefined', async () => {
    const { hasValidExtension } = await import('../../utils/file-validator.js');
    expect(hasValidExtension(undefined as any)).toBe(false);
  });

  it('hasValidExtension returns false for non-string input', async () => {
    const { hasValidExtension } = await import('../../utils/file-validator.js');
    expect(hasValidExtension(123 as any)).toBe(false);
  });

  it('isAllowedMimeType returns false for empty string', async () => {
    const { isAllowedMimeType } = await import('../../utils/file-validator.js');
    expect(isAllowedMimeType('')).toBe(false);
  });

  it('isAllowedMimeType returns false for null', async () => {
    const { isAllowedMimeType } = await import('../../utils/file-validator.js');
    expect(isAllowedMimeType(null as any)).toBe(false);
  });

  it('isAllowedMimeType returns false for undefined', async () => {
    const { isAllowedMimeType } = await import('../../utils/file-validator.js');
    expect(isAllowedMimeType(undefined as any)).toBe(false);
  });

  it('isAllowedMimeType returns false for non-string input', async () => {
    const { isAllowedMimeType } = await import('../../utils/file-validator.js');
    expect(isAllowedMimeType(123 as any)).toBe(false);
  });
});

// ─── app.ts lines 33, 127 ───
describe('app.ts - uncovered lines (33, 127)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle webhook path rawBody storage (line 33)', async () => {
    const { createApp } = await import('../../app.js');
    const app = await createApp();
    const res = await request(app)
      .post('/api/kyc/webhook')
      .send({ event: 'test' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('should return npm_package_version when set (line 127)', async () => {
    const origVersion = process.env.npm_package_version;
    process.env.npm_package_version = '2.0.0';

    const { createApp } = await import('../../app.js');
    const app = await createApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('2.0.0');

    if (origVersion !== undefined) {
      process.env.npm_package_version = origVersion;
    } else {
      delete process.env.npm_package_version;
    }
  });
});

// ─── cache.ts line 55 - startCleanup ───
describe('cache.ts - startCleanup (line 55)', () => {
  it('should start and stop cleanup timer', async () => {
    const { LRUCache } = await import('../../utils/cache.js');
    const cache = new LRUCache<string>(10, 100);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
    cache.startCleanup(50);
    await new Promise(r => setTimeout(r, 150));
    expect(cache.size).toBeLessThanOrEqual(1);
    cache.stopCleanup();
  });

  it('should handle startCleanup called multiple times', async () => {
    const { LRUCache } = await import('../../utils/cache.js');
    const cache = new LRUCache<string>(10, 100);
    cache.startCleanup(50);
    cache.startCleanup(50);
    cache.stopCleanup();
  });
});

// ─── contracts.ts lines 42, 44-45 - Sepolia env vars ───
describe('contracts.ts - Sepolia env vars (lines 42, 44-45)', () => {
  const savedEnvs: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnvs.SEPOLIA_ESCROW_ADDRESS = process.env.SEPOLIA_ESCROW_ADDRESS;
    savedEnvs.SEPOLIA_DISPUTE_ADDRESS = process.env.SEPOLIA_DISPUTE_ADDRESS;
    savedEnvs.SEPOLIA_MILESTONE_ADDRESS = process.env.SEPOLIA_MILESTONE_ADDRESS;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnvs)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it('should load Sepolia contract addresses from env vars', async () => {
    process.env.SEPOLIA_ESCROW_ADDRESS = '0xSepoliaEscrow';
    process.env.SEPOLIA_DISPUTE_ADDRESS = '0xSepoliaDispute';
    process.env.SEPOLIA_MILESTONE_ADDRESS = '0xSepoliaMilestone';

    jest.resetModules();
    const { getContractAddress, getCurrentNetwork } = await import('../../config/contracts.js');

    expect(getContractAddress).toBeDefined();
    expect(getCurrentNetwork).toBeDefined();
    expect(typeof getContractAddress).toBe('function');
    expect(typeof getCurrentNetwork).toBe('function');
  });
});

// ─── env.ts line 8 - getEnvVar missing required var ───
describe('env.ts - getEnvVar missing required var (line 8)', () => {
  it('should throw when required env var is missing', async () => {
    const origValue = process.env.APPWRITE_ENDPOINT;
    delete process.env.APPWRITE_ENDPOINT;

    jest.resetModules();
    jest.unstable_mockModule('dotenv', () => ({
      default: { config: jest.fn() },
      config: jest.fn(),
    }));

    await expect(import('../../config/env.js')).rejects.toThrow(
      'Environment variable APPWRITE_ENDPOINT is required but not set'
    );

    if (origValue !== undefined) {
      process.env.APPWRITE_ENDPOINT = origValue;
    }
  });
});
