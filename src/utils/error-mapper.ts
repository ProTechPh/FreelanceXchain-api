import { HttpStatus, ERROR_STATUS_MAP } from '../constants/http-status.js';

/**
 * Maps an error code to the appropriate HTTP status code.
 * Eliminates duplicated mapping logic across route handlers.
 * 
 * @param errorCode - The error code from ServiceResult
 * @param fallback - Default status if error code not mapped (defaults to 400)
 * @returns The appropriate HTTP status code
 */
export function mapErrorCodeToStatus(
  errorCode: string,
  fallback: HttpStatus = HttpStatus.BAD_REQUEST
): HttpStatus {
  return ERROR_STATUS_MAP[errorCode] ?? fallback;
}

/**
 * Determines HTTP status for common business error patterns.
 * Use when you need custom logic beyond simple code mapping.
 * 
 * @param errorCode - The error code
 * @returns HTTP status code
 */
export function resolveErrorStatus(errorCode: string): HttpStatus {
  // Authentication/Authorization errors
  if (errorCode === 'UNAUTHORIZED' || errorCode === 'TOKEN_EXPIRED') {
    return HttpStatus.UNAUTHORIZED;
  }
  
  if (errorCode === 'FORBIDDEN' || errorCode === 'INSUFFICIENT_PERMISSIONS') {
    return HttpStatus.FORBIDDEN;
  }

  // Not found errors
  if (
    errorCode === 'NOT_FOUND' ||
    errorCode.includes('NOT_FOUND') ||
    errorCode.includes('_NOT_FOUND')
  ) {
    return HttpStatus.NOT_FOUND;
  }

  // Conflict errors
  if (
    errorCode === 'DUPLICATE_EMAIL' ||
    errorCode === 'DUPLICATE_PROPOSAL' ||
    errorCode === 'ALREADY_DISPUTED' ||
    errorCode === 'PROJECT_LOCKED' ||
    errorCode === 'CONFLICT'
  ) {
    return HttpStatus.CONFLICT;
  }

  // Rate limiting
  if (errorCode === 'RATE_LIMITED' || errorCode === 'TOO_MANY_REQUESTS') {
    return HttpStatus.TOO_MANY_REQUESTS;
  }

  // Default to bad request
  return HttpStatus.BAD_REQUEST;
}
