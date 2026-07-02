import { Request, Response, NextFunction } from 'express';
import type { ServiceResult } from '../types/service-result.js';
import type { ValidationError } from './validators.js';

// ── Request Helpers ───────────────────────────────────────────────────────────

export function getRequestId(req: Request): string {
  return req.headers['x-request-id'] as string ?? 'unknown';
}

/**
 * Wraps an async route handler to catch unhandled rejections (Express 4 does not).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Extract Bearer token from Authorization header.
 * Returns null and sends 401 response if missing.
 */
export function extractBearerToken(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader?.split(' ')[1];
  if (!token) {
    sendError(res, 401, {
      code: 'AUTH_MISSING_TOKEN',
      message: 'Authorization token is required',
    }, getRequestId(req));
    return null;
  }
  return token;
}

// ── Error Responses ───────────────────────────────────────────────────────────

/**
 * Default status code mapping for common error codes.
 */
const DEFAULT_STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  BAD_REQUEST: 400,
  RATE_LIMIT_EXCEEDED: 429,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_MISSING_TOKEN: 401,
  DUPLICATE_EMAIL: 409,
  MFA_REQUIRED: 200,
};

export function sendError(
  res: Response,
  statusCode: number,
  error: { code: string; message: string; details?: unknown },
  requestId?: string
): void {
  res.status(statusCode).json({
    error,
    timestamp: new Date().toISOString(),
    requestId: requestId ?? 'unknown',
  });
}

export function sendServiceError<T>(
  res: Response,
  result: ServiceResult<T>,
  requestId?: string,
  statusMap?: Record<string, number>
): void {
  if (result.success) return;
  const map = { ...DEFAULT_STATUS_MAP, ...statusMap };
  const statusCode = map[result.error.code] ?? 400;
  sendError(res, statusCode, result.error, requestId);
}

/**
 * Send a 400 validation error response with field-level details.
 */
export function sendValidationError(
  res: Response,
  errors: ValidationError[],
  requestId?: string
): void {
  sendError(res, 400, {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    details: errors,
  }, requestId);
}

/**
 * Send a standardized auth error response.
 * Maps AuthError codes to appropriate HTTP status codes.
 */
export function sendAuthError(
  res: Response,
  error: { code: string; message: string },
  requestId?: string
): void {
  const statusCode = DEFAULT_STATUS_MAP[error.code] ?? 400;
  sendError(res, statusCode, error, requestId);
}

/**
 * Send a 200 success JSON response with standard envelope.
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json(data);
}
