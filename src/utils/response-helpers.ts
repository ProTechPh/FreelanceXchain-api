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
 * Send a standardized error response with a given status code.
 * Replaces the manual `{ error: { code, message }, timestamp, requestId }` pattern.
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  requestId?: string
): void {
  res.status(statusCode).json({
    error: { code, message },
    timestamp: new Date().toISOString(),
    requestId: requestId ?? 'unknown',
  });
}

/**
 * Extract the request ID from a request, falling back to 'unknown'.
 * Repeated across route handlers — centralize here.
 */
export { getRequestId } from './route-helpers.js';
