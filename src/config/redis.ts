import { Redis } from 'ioredis';
import { config } from './env.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
});

redis.on('error', (err: Error) => {
  console.error('[redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.warn('[redis] connected');
});
