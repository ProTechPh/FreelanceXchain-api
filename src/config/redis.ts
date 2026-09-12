import { Redis } from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

// lazyConnect is intentionally omitted so ioredis establishes the connection
// immediately on module load — before any HTTP request (and therefore any
// rate-limiter call) can arrive.  With enableOfflineQueue:false a lazyConnect
// client that hasn't connected yet throws "Stream isn't writeable", which is
// the startup-race we observed in production.
const isRemoteHost = config?.redis?.host && !['localhost', '127.0.0.1', '::1'].includes(config.redis.host);
if (isRemoteHost && !config?.redis?.tls && config?.server?.nodeEnv === 'production') {
  logger.warn('[SECURITY WARNING] Connecting to remote Redis host without TLS in production. Set REDIS_TLS=true to encrypt traffic in transit (PCI-DSS 4.1, CWE-319).');
}

export const redis = new Redis({
  host: config?.redis?.host || '127.0.0.1',
  port: config?.redis?.port || 6379,
  password: config?.redis?.password || undefined,
  tls: config?.redis?.tls ? {} : undefined,
  enableOfflineQueue: false,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 1000, 5000)),
});

redis.on('error', (err: Error) => {
  if (config?.server?.nodeEnv !== 'test') {
    logger.error('[redis] connection error', err);
  }
});

redis.on('connect', () => {
  if (config?.server?.nodeEnv !== 'test') {
    logger.info('[redis] connected');
  }
});

redis.on('ready', () => {
  if (config?.server?.nodeEnv !== 'test') {
    logger.info('[redis] ready');
  }
});
