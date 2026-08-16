import { Request, Response } from 'express';
import { sendErrorResponse } from './response-helpers.js';
import type { ServiceResult } from '../types/service-result.js';

export function getRequestId(req: Request): string {
  return (req.headers?.['x-request-id'] as string) ?? 'unknown';
}

export function sendError(
  res: Response,
  statusCode: number,
  error: { code: string; message: string; details?: unknown },
  requestId?: string
): void {
  sendErrorResponse(res, statusCode, error.code, error.message, {
    ...(requestId !== undefined ? { requestId } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
}

export function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>,
  requestId?: string,
  statusMap?: Record<string, number>
): void {
  if (result.success) return;
  const defaultStatusMap: Record<string, number> = {
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    VALIDATION_ERROR: 400,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    BAD_REQUEST: 400,
    RATE_LIMIT_EXCEEDED: 429,
  };
  const map = { ...defaultStatusMap, ...statusMap };
  const statusCode = map[result.error.code] ?? 400;
  sendError(res, statusCode, result.error, requestId);
}
