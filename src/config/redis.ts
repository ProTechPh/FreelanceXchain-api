import { Redis, type RedisOptions } from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

function isPrivateNetworkHost(host: string): boolean {
  if (!host) return false;
  const lower = host.toLowerCase().trim();
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(lower)) return true;
  if (lower.startsWith('red-') || lower.endsWith('.render.internal')) return true;
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(lower)) return true;
  return false;
}

const baseOptions: RedisOptions = {
  enableOfflineQueue: false,
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 1000, 5000)),
};

const redisUrl = config?.redis?.url || process.env.REDIS_URL;

function createRedisClient(): Redis {
  if (redisUrl) {
    const isRediss = redisUrl.toLowerCase().startsWith('rediss://');
    const tlsConfig = isRediss ? { rejectUnauthorized: false } : undefined;
    return new Redis(redisUrl, {
      ...baseOptions,
      tls: tlsConfig,
    });
  }

  const host = config?.redis?.host || '127.0.0.1';
  const port = config?.redis?.port || 6379;
  const password = config?.redis?.password || undefined;
  const isPrivate = isPrivateNetworkHost(host);

  let tlsConfig: { rejectUnauthorized: boolean } | undefined = config?.redis?.tls ? { rejectUnauthorized: false } : undefined;

  // Cloud platform internal Redis (such as Render internal network red-xxx) communicates over
  // private VPC and does NOT support TLS. Forcing TLS on plaintext ports causes ERR_SSL_WRONG_VERSION_NUMBER.
  if (tlsConfig && isPrivate) {
    logger.warn(`[redis] REDIS_TLS=true is configured, but host "${host}" is an internal private network host without TLS support. Automatically disabling TLS to avoid ERR_SSL_WRONG_VERSION_NUMBER.`);
    tlsConfig = undefined;
  } else if (!tlsConfig && !isPrivate && config?.server?.nodeEnv === 'production') {
    logger.warn('[redis] Connecting to remote Redis host without TLS. Only set REDIS_TLS=true if your Redis instance is explicitly configured for SSL/TLS (rediss://); forcing TLS on a plaintext port causes ERR_SSL_WRONG_VERSION_NUMBER.');
  }

  return new Redis({
    ...baseOptions,
    host,
    port,
    password,
    tls: tlsConfig,
  });
}

export const redis = createRedisClient();
redis.setMaxListeners(30);

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
