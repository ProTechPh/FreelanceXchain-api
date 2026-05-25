import { Pool } from 'pg';
import { config } from './env.js';
import { logger } from './logger.js';

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Initialize and verify database connection
 */
export async function initializeDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('PostgreSQL connection verified', { 
      timestamp: result.rows[0].now,
      database: config.database.url.split('@')[1]?.split('/')[1] || 'unknown',
    });
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL', error);
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute a query and return all rows
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  const row = rows[0];
  return row !== undefined ? row : null;
}
