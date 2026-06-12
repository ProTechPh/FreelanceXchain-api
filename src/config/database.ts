/* eslint-disable @typescript-eslint/no-explicit-any */

export const pool: any = new Proxy({} as any, {
  get: () => { throw new Error('Database not available — use Appwrite instead'); },
});

export function isPostgresAvailable(): boolean { return false; }
export async function initializeDatabase(): Promise<void> { /* no-op */ }
export async function query(): Promise<never> { throw new Error('Database not available — use Appwrite instead'); }
export async function queryOne(): Promise<never> { throw new Error('Database not available — use Appwrite instead'); }
