/**
 * HTTP Status Codes
 * Centralized constants to eliminate magic numbers in route handlers
 */
export enum HttpStatus {
  // Success
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,

  // Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // Server Errors
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/**
 * Common error code to status mappings
 */
export const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  UNAUTHORIZED: HttpStatus.FORBIDDEN,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  DUPLICATE_EMAIL: HttpStatus.CONFLICT,
  DUPLICATE_PROPOSAL: HttpStatus.CONFLICT,
  ALREADY_DISPUTED: HttpStatus.CONFLICT,
  PROJECT_LOCKED: HttpStatus.CONFLICT,
  TOKEN_EXPIRED: HttpStatus.UNAUTHORIZED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
};
