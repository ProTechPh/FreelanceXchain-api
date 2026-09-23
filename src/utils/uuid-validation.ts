/**
 * UUID Validation Utilities
 * Centralizes UUID format validation to eliminate duplicated regex patterns
 */

/**
 * RFC 4122 UUID v4 pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4.
 * 
 * @param value - The value to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return UUID_PATTERN.test(value);
}

/**
 * Validates a UUID and returns a descriptive error if invalid.
 * Use in route handlers for consistent validation messages.
 * 
 * @param value - The value to validate
 * @param paramName - Name of the parameter for error messages
 * @returns null if valid, error message if invalid
 */
export function validateUUID(
  value: unknown,
  paramName: string = 'id'
): string | null {
  if (typeof value !== 'string') {
    return `${paramName} is required and must be a string`;
  }
  
  if (!UUID_PATTERN.test(value)) {
    return `${paramName} must be a valid UUID`;
  }
  
  return null;
}

/**
 * Validates multiple UUID parameters at once.
 * Returns first error found or null if all valid.
 * 
 * @param params - Object with parameter names and values
 * @returns First validation error or null if all valid
 * 
 * @example
 * const error = validateUUIDParams({ contractId, milestoneId });
 * if (error) {
 *   sendErrorResponse(res, 400, 'VALIDATION_ERROR', error);
 *   return;
 * }
 */
export function validateUUIDParams(
  params: Record<string, unknown>
): string | null {
  for (const [name, value] of Object.entries(params)) {
    const error = validateUUID(value, name);
    if (error) return error;
  }
  return null;
}

/**
 * Type guard for UUID-identified entities.
 * Ensures an ID is present and valid before proceeding.
 * 
 * @param id - The ID to check
 * @returns true if valid UUID
 */
export function hasValidId(id: unknown): id is string {
  return isValidUUID(id);
}
