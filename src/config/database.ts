/** @deprecated Import directly from config/appwrite instead. */
export { databases, DATABASE_ID, BUCKETS } from './appwrite.js';

/** @deprecated PostgreSQL has been removed. This is a no-op. */
export async function initializeDatabase(): Promise<void> { /* no-op */ }
