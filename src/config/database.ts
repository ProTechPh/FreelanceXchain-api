/**
 * Database Configuration
 *
 * @deprecated This module is kept for backward compatibility.
 * New code should import directly from config/appwrite
 */

// Re-export Appwrite client for convenience
export { databases, DATABASE_ID, BUCKETS } from './appwrite.js';

/**
 * @deprecated PostgreSQL has been removed. This is a no-op.
 */
export async function initializeDatabase(): Promise<void> { /* no-op */ }
