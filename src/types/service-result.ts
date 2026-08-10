export type ServiceError = {
  code: string;
  message: string;
  details?: string[];
  retryAfter?: string;
};

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

/**
 * Build a successful ServiceResult. Replaces the repeated `{ success: true, data }` literal.
 * The inferred return type is the success member `{ success: true; data: T }`, which is
 * assignable to `ServiceResult<T>` and to structurally-compatible result unions such as
 * `DiditClientResult<T>` (whose error branch uses a different error type).
 */
export function successResult<T>(data: T) {
  return { success: true as const, data };
}

/**
 * Build a failed ServiceResult. Replaces the repeated `{ success: false, error: { code, message } }`
 * literal. `details`/`retryAfter` are only emitted when provided, so the resulting object shape is
 * identical to the literal it replaces.
 */
export function errorResult(
  code: string,
  message: string,
  details?: string[],
  retryAfter?: string
): { success: false; error: ServiceError } {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      ...(retryAfter === undefined ? {} : { retryAfter }),
    },
  };
}