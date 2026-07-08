/**
 * Database Configuration
 *
 * @deprecated This module is kept for backward compatibility.
 * New code should import directly from config/appwrite
 */

// Re-export Appwrite client for convenience
export { databases, DATABASE_ID, BUCKETS } from './appwrite.js';

/**
 * @deprecated PostgreSQL has been removed. This export throws if called.
 * Use Appwrite databases instead.
 */
export const pool: any = new Proxy({} as any, {
  get: () => { throw new Error('PostgreSQL has been removed. Use Appwrite databases instead.'); },
});

/**
 * @deprecated PostgreSQL has been removed. Always returns false.
 */
export function isPostgresAvailable(): boolean { return false; }

/**
 * @deprecated PostgreSQL has been removed. This is a no-op.
 */
export async function initializeDatabase(): Promise<void> { /* no-op */ }

/**
 * @deprecated PostgreSQL has been removed. This throws if called.
 */
export async function query(): Promise<never> { throw new Error('PostgreSQL has been removed. Use Appwrite databases instead.'); }

/**
 * @deprecated PostgreSQL has been removed. This throws if called.
 */
export async function queryOne(): Promise<never> { throw new Error('PostgreSQL has been removed. Use Appwrite databases instead.'); }
