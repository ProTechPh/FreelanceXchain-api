import { Redis } from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

// lazyConnect is intentionally omitted so ioredis establishes the connection
// immediately on module load — before any HTTP request (and therefore any
// rate-limiter call) can arrive.  With enableOfflineQueue:false a lazyConnect
// client that hasn't connected yet throws "Stream isn't writeable", which is
// the startup-race we observed in production.
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  tls: config.redis.tls ? {} : undefined,
  enableOfflineQueue: false,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 1000, 5000)),
});

redis.on('error', (err: Error) => {
  logger.error('[redis] connection error', err);
});

redis.on('connect', () => {
  logger.info('[redis] connected');
});

redis.on('ready', () => {
  logger.info('[redis] ready');
});
