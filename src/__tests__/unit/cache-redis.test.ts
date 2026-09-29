// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const handlers = new Map<string, Array<() => void>>();
const mockGet = jest.fn<any>();
const mockSetex = jest.fn<any>();
const mockDel = jest.fn<any>();
const mockScan = jest.fn<any>();
const mockMget = jest.fn<any>();
const mockPipelineDel = jest.fn<any>();
const mockPipelineExec = jest.fn<any>();
const mockPipeline = jest.fn(() => ({
  del: mockPipelineDel,
  exec: mockPipelineExec,
}));
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const redis = {
  on: jest.fn((event: string, handler: () => void) => {
    const eventHandlers = handlers.get(event) ?? [];
    eventHandlers.push(handler);
    handlers.set(event, eventHandlers);
    return redis;
  }),
  get: mockGet,
  setex: mockSetex,
  del: mockDel,
  scan: mockScan,
  mget: mockMget,
  pipeline: mockPipeline,
};

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({ redis }));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger: mockLogger }));

const previousRedisUrl = process.env['REDIS_URL'];
const previousNodeEnv = process.env['NODE_ENV'];
process.env['REDIS_URL'] = 'redis://cache.test:6379';
process.env['NODE_ENV'] = 'production';

const cacheModule = await import('../../utils/cache.js');
const { RedisCache, skillCache, warmAllCaches, stopAllCacheCleanups } = cacheModule;

const emit = (event: string) => {
  for (const handler of handlers.get(event) ?? []) handler();
};

const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('RedisCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue('OK');
    mockDel.mockResolvedValue(1);
    mockScan.mockResolvedValue(['0', []]);
    mockMget.mockResolvedValue([]);
    mockPipelineExec.mockResolvedValue([]);
    emit('ready');
  });

  afterAll(() => {
    stopAllCacheCleanups();
    if (previousRedisUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = previousRedisUrl;
    if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousNodeEnv;
  });

  it('selects the Redis implementation in production when REDIS_URL is configured', () => {
    expect(skillCache).toBeInstanceOf(RedisCache);
  });

  it('reads JSON from Redis and returns null for a cache miss', async () => {
    const cache = new RedisCache<{ enabled: boolean }>('flags');
    mockGet.mockResolvedValueOnce('{"enabled":true}').mockResolvedValueOnce(null);

    await expect(cache.getAsync('checkout')).resolves.toEqual({ enabled: true });
    await expect(cache.getAsync('missing')).resolves.toBeNull();
    expect(mockGet).toHaveBeenNthCalledWith(1, 'flags:checkout');
  });

  it('serves the in-memory value while Redis is unavailable and resumes after ready', async () => {
    const cache = new RedisCache<string>('sessions');
    cache.set('user-1', 'local-session');
    await flushPromises();
    jest.clearAllMocks();

    emit('error');
    emit('error');
    await expect(cache.getAsync('user-1')).resolves.toBe('local-session');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:sessions] Redis unavailable, using in-memory fallback',
    );

    emit('ready');
    mockGet.mockResolvedValueOnce('"shared-session"');
    await expect(cache.getAsync('user-1')).resolves.toBe('shared-session');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[cache:sessions] Redis reconnected, resuming Redis cache',
    );
  });

  it('falls back to memory when a Redis read rejects', async () => {
    const cache = new RedisCache<string>('profiles');
    cache.set('user-1', 'cached-profile');
    await flushPromises();
    mockGet.mockRejectedValueOnce(new Error('read failed'));

    await expect(cache.getAsync('user-1')).resolves.toBe('cached-profile');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:profiles] Redis get error: Error: read failed',
    );
  });

  it('writes through synchronously and asynchronously using whole-second TTLs', async () => {
    const cache = new RedisCache<string>('quotes', 10, 4_500);

    cache.set('one', 'first');
    await flushPromises();
    expect(cache.get('one')).toBe('first');
    expect(mockSetex).toHaveBeenCalledWith('quotes:one', 4, '"first"');

    await cache.setAsync('two', 'second', 2_900);
    expect(cache.get('two')).toBe('second');
    expect(mockSetex).toHaveBeenCalledWith('quotes:two', 2, '"second"');
    expect(cache.size).toBe(2);
  });

  it('keeps local writes available when Redis writes reject or Redis is down', async () => {
    const cache = new RedisCache<string>('drafts');
    mockSetex.mockRejectedValue(new Error('write failed'));

    cache.set('sync', 'saved');
    await flushPromises();
    await expect(cache.setAsync('async', 'also-saved')).resolves.toBeUndefined();
    expect(cache.get('sync')).toBe('saved');
    expect(cache.get('async')).toBe('also-saved');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:drafts] Redis set error: Error: write failed',
    );

    emit('error');
    jest.clearAllMocks();
    await cache.setAsync('offline', 'local-only');
    expect(cache.get('offline')).toBe('local-only');
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('deletes locally and remotely, tolerating remote failures and outages', async () => {
    const cache = new RedisCache<string>('tokens');
    cache.set('sync', 'one');
    cache.set('async', 'two');
    await flushPromises();
    jest.clearAllMocks();

    expect(cache.delete('sync')).toBe(true);
    await flushPromises();
    expect(mockDel).toHaveBeenCalledWith('tokens:sync');

    mockDel.mockRejectedValueOnce(new Error('delete failed'));
    await expect(cache.deleteAsync('async')).resolves.toBeUndefined();
    expect(cache.get('async')).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:tokens] Redis delete error: Error: delete failed',
    );

    emit('error');
    jest.clearAllMocks();
    await expect(cache.deleteAsync('offline')).resolves.toBeUndefined();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('keeps synchronous deletion successful when the background Redis delete rejects', async () => {
    const cache = new RedisCache<string>('tokens');
    cache.set('sync', 'one');
    await flushPromises();
    jest.clearAllMocks();
    mockDel.mockRejectedValueOnce(new Error('background delete failed'));

    expect(cache.delete('sync')).toBe(true);
    await flushPromises();

    expect(cache.get('sync')).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:tokens] Redis delete error: Error: background delete failed',
    );
  });

  it('scans all pages and deletes only keys accepted by the predicate', async () => {
    const cache = new RedisCache<string>('projects');
    mockScan
      .mockResolvedValueOnce(['7', ['projects:keep', 'projects:drop-1', 'foreign-key']])
      .mockResolvedValueOnce(['0', ['projects:drop-2']]);

    cache.deleteMatching((key) => key.startsWith('drop'));
    await flushPromises();

    expect(mockScan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'projects:*', 'COUNT', 100);
    expect(mockScan).toHaveBeenNthCalledWith(2, '7', 'MATCH', 'projects:*', 'COUNT', 100);
    expect(mockPipelineDel.mock.calls.map(([key]) => key)).toEqual([
      'projects:drop-1',
      'projects:drop-2',
    ]);
    expect(mockPipelineExec).toHaveBeenCalledTimes(1);
  });

  it('does not create a pipeline when no scanned keys match', async () => {
    const cache = new RedisCache<string>('projects');
    mockScan.mockResolvedValueOnce(['0', ['projects:keep']]);

    cache.deleteMatching(() => false);
    await flushPromises();

    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('warns if scanning for matching keys fails', async () => {
    const cache = new RedisCache<string>('projects');
    mockScan.mockRejectedValueOnce(new Error('scan failed'));

    cache.deleteMatching(() => true);
    await flushPromises();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:projects] Redis deleteMatching error: Error: scan failed',
    );
  });

  it('clears local values and every remotely scanned key', async () => {
    const cache = new RedisCache<string>('metrics');
    cache.set('local', 'value');
    await flushPromises();
    jest.clearAllMocks();
    mockScan
      .mockResolvedValueOnce(['2', ['metrics:a']])
      .mockResolvedValueOnce(['0', ['metrics:b']]);

    cache.clear();
    await flushPromises();

    expect(cache.size).toBe(0);
    expect(mockPipelineDel.mock.calls.map(([key]) => key)).toEqual(['metrics:a', 'metrics:b']);
    expect(mockPipelineExec).toHaveBeenCalledTimes(1);
  });

  it('skips the clear pipeline for an empty scan and warns on scan failure', async () => {
    const cache = new RedisCache<string>('metrics');
    cache.clear();
    await flushPromises();
    expect(mockPipeline).not.toHaveBeenCalled();

    mockScan.mockRejectedValueOnce(new Error('clear failed'));
    cache.clear();
    await flushPromises();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:metrics] Redis clear error: Error: clear failed',
    );
  });

  it('warms valid JSON across scan pages while skipping malformed and empty entries', async () => {
    const cache = new RedisCache<{ score: number }>('ranking');
    mockScan
      .mockResolvedValueOnce(['4', ['ranking:alice', 'ranking:broken']])
      .mockResolvedValueOnce(['0', ['ranking:bob', 'ranking:empty']]);
    mockMget
      .mockResolvedValueOnce(['{"score":10}', 'not-json'])
      .mockResolvedValueOnce(['{"score":7}', null]);

    await cache.warmCache();

    expect(cache.get('alice')).toEqual({ score: 10 });
    expect(cache.get('bob')).toEqual({ score: 7 });
    expect(cache.get('broken')).toBeUndefined();
    expect(cache.get('empty')).toBeUndefined();
    expect(mockLogger.info).toHaveBeenCalledWith('[cache:ranking] Warmed cache with 2 entries');
  });

  it('returns early when warming offline and warns when warming fails', async () => {
    const cache = new RedisCache<string>('ranking');
    emit('error');
    jest.clearAllMocks();
    await cache.warmCache();
    expect(mockScan).not.toHaveBeenCalled();

    emit('ready');
    mockScan.mockRejectedValueOnce(new Error('warm failed'));
    await cache.warmCache();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[cache:ranking] Failed to warm cache: Error: warm failed',
    );
  });

  it('warms all configured Redis caches', async () => {
    mockScan.mockResolvedValue(['0', []]);

    await warmAllCaches();

    expect(mockScan).toHaveBeenCalledTimes(18);
  });

  it('delegates cleanup timer lifecycle to the in-memory fallback', () => {
    jest.useFakeTimers();
    const cache = new RedisCache<string>('temporary', 10, 10);
    cache.set('expired', 'value', 10);

    cache.startCleanup(20);
    jest.advanceTimersByTime(40);
    expect(cache.get('expired')).toBeUndefined();
    cache.stopCleanup();
    jest.useRealTimers();
  });
});
