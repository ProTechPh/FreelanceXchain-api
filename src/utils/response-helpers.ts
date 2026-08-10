import { Response } from 'express';

type ValidationFieldError = { field: string; message: string };

/**
 * Send a standardized validation error response (HTTP 400).
 * Replaces the manual `{ error: { code, message, details }, timestamp, requestId }` pattern.
 */
export function sendValidationError(
  res: Response,
  errors: ValidationFieldError[],
  requestId?: string
): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: errors,
    },
    timestamp: new Date().toISOString(),
    requestId: requestId ?? 'unknown',
  });
}

/**
 * Send a standardized success response with a given status code.
 * Replaces the manual `{ ...payload, timestamp, requestId }` pattern.
 * `timestamp`/`requestId` are appended after `...payload` and therefore
 * override any payload keys with the same name.
 */
export function sendSuccessResponse(
  res: Response,
  statusCode: number,
  payload: Record<string, unknown>,
  requestId?: string
): void {
  res.status(statusCode).json({
    ...payload,
    timestamp: new Date().toISOString(),
    requestId: requestId ?? 'unknown',
  });
}

/**
 * Send a standardized error response with a given status code.
 * Replaces the manual `{ error: { code, message }, timestamp, requestId }` pattern.
 * Pass `success` to include a top-level `success` flag (e.g. `false` for OAuth error flows).
 * Pass `retryAfter` to include a top-level `retryAfter` field — either a delta-seconds
 * number (e.g. 429 rate-limit responses) or an ISO date string (RFC 7231 Retry-After).
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string | undefined,
  message: string | undefined,
  requestId?: string,
  details?: unknown,
  success?: boolean,
  retryAfter?: number | string
): void {
  res.status(statusCode).json({
    ...(success === undefined ? {} : { success }),
    error: details === undefined ? { code, message } : { code, message, details },
    ...(retryAfter === undefined ? {} : { retryAfter }),
    timestamp: new Date().toISOString(),
    requestId: requestId ?? 'unknown',
  });
}

/**
 * Extract the request ID from a request, falling back to 'unknown'.
 * Repeated across route handlers — centralize here.
 */
export { getRequestId } from './route-helpers.js';
