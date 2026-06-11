import { logger } from './logger.js';

const PG_DISABLED_MSG = 'PostgreSQL is not configured — this project uses Appwrite only.';

/**
 * Stub pool that throws when PostgreSQL is accessed.
 * All pool.query() / pool.connect() calls across the codebase will hit this
 * and produce a clear error instead of a cryptic "Cannot read property of null".
 */
export const pool = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === 'query' || prop === 'connect') {
      return () => Promise.reject(new Error(PG_DISABLED_MSG));
    }
    if (prop === 'on') {
      return () => pool; // no-op chainable
    }
    throw new Error(PG_DISABLED_MSG);
  },
});

/**
 * Always throws — PostgreSQL is not available.
 */
export function getPool(): never {
  throw new Error(PG_DISABLED_MSG);
}

/**
 * Always returns false — PostgreSQL is not available.
 */
export function isPostgresAvailable(): boolean {
  return false;
}

/**
 * No-op — PostgreSQL is not configured.
 */
export async function initializeDatabase(): Promise<void> {
  logger.info('PostgreSQL disabled — using Appwrite-only mode');
}

/**
 * Stub — always throws.
 */
export async function query<T = any>(_text: string, _params?: any[]): Promise<T[]> {
  throw new Error(PG_DISABLED_MSG);
}

/**
 * Stub — always throws.
 */
export async function queryOne<T = any>(_text: string, _params?: any[]): Promise<T | null> {
  throw new Error(PG_DISABLED_MSG);
}
