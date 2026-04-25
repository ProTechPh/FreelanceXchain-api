import { Request, Response } from 'express';
import type { ServiceResult, ServiceError } from '../types/service-result.js';

export function getRequestId(req: Request): string {
  return req.headers['x-request-id'] as string ?? 'unknown';
}

export function sendError(
  res: Response,
  statusCode: number,
  error: { code: string; message: string; details?: unknown[] },
  requestId: string
): void {
  res.status(statusCode).json({
    error,
    timestamp: new Date().toISOString(),
    requestId,
  });
}

export function sendServiceError<T>(
  res: Response,
  result: Extract<ServiceResult<T>, { success: false }>,
  requestId: string,
  statusMap?: Record<string, number>
): void {
  const defaultStatus = 400;
  const statusCode = statusMap?.[result.error.code] ?? defaultStatus;
  res.status(statusCode).json({
    error: {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
    },
    timestamp: new Date().toISOString(),
    requestId,
  });
}
