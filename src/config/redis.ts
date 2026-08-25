import { Redis } from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  tls: config.redis.tls ? {} : undefined,
  lazyConnect: true,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 1000, 5000)),
});

redis.on('error', (err: Error) => {
  logger.error('[redis] connection error', err);
});

redis.on('connect', () => {
  logger.warn('[redis] connected');
});

