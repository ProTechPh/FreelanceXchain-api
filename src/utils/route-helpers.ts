import type { Request } from 'express';

export function getRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  return Array.isArray(header) ? (header[0] ?? 'unknown') : (header ?? 'unknown');
}
