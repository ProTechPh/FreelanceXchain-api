/**
 * Log Sanitizer Utility
 * Redacts sensitive data from logs to prevent information disclosure
 * 
 * OWASP A02:2021 - Cryptographic Failures
 * OWASP A09:2021 - Security Logging and Monitoring Failures
 */

/**
 * Patterns for sensitive data detection
 */
const SENSITIVE_PATTERNS = {
  // JWT tokens (Bearer tokens)
  jwt: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/gi,
  
  // API keys and secrets
  apiKey: /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)[\s:=]+['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
  
  // Passwords
  password: /(?:password|passwd|pwd)[\s:=]+['"]?([^'"\s]{6,})['"]?/gi,
  
  // Credit card numbers (basic pattern)
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  
  // Email addresses (for PII protection)
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Phone numbers (international format)
  phone: /\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  
  // Social Security Numbers (US format)
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // Authorization headers
  authHeader: /authorization[\s:]+['"]?([^'"\n]+)['"]?/gi,
  
  // Private keys
  privateKey: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
};

/**
 * Sensitive field names that should be redacted
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',
  'privateKey',
  'private_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'auth',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'social_security',
  'sessionId',
  'session_id',
]);

/**
 * Redaction placeholder
 */
const REDACTED = '[REDACTED]';

/**
 * Sanitize a string by redacting sensitive patterns
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  sanitized = sanitized.replace(SENSITIVE_PATTERNS.jwt, 'Bearer [REDACTED_JWT]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, (match, group1) => 
    match.replace(group1, REDACTED)
  );
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.password, (match, group1) => 
    match.replace(group1, REDACTED)
  );
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.creditCard, '[REDACTED_CC]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.email, '[REDACTED_EMAIL]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.phone, '[REDACTED_PHONE]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.ssn, '[REDACTED_SSN]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.authHeader, (match, group1) => 
    match.replace(group1, REDACTED)
  );
  sanitized = sanitized.replace(SENSITIVE_PATTERNS.privateKey, '[REDACTED_PRIVATE_KEY]');

  return sanitized;
}

/**
 * Sanitize an object by redacting sensitive fields.
 * The generic preserves the input's shape so callers keep their types.
 */
export function sanitizeObject<T>(obj: T): T {
  return sanitizeObjectInternal(obj, new WeakSet<object>());
}

/**
 * Recursive core of sanitizeObject. `seen` tracks the objects currently being
 * sanitized on this path (added before recursing, removed after) so a circular
 * reference — e.g. `err.cause = err` or a self-referential request object — is
 * replaced with '[Circular]' instead of recursing forever and overflowing the
 * stack, which would crash the logger and mask the very error being logged.
 * Shared-but-non-circular references are still fully sanitized.
 */
function sanitizeObjectInternal<T>(obj: T, seen: WeakSet<object>): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj)) {
    return '[Circular]' as T;
  }
  seen.add(obj);

  const sanitized: Record<string, unknown> = {};

  if (Array.isArray(obj)) {
    const items = obj.map(item => sanitizeObjectInternal(item, seen));
    seen.delete(obj);
    return items as T;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      sanitized[key] = REDACTED;
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObjectInternal(value, seen);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  seen.delete(obj);
  return sanitized as T;
}

/**
 * Sanitize log data (can be string or object).
 * The generic preserves the input's shape so callers keep their types.
 */
export function sanitizeLogData<T>(data: T): T {
  if (typeof data === 'string') {
    return sanitizeString(data) as T;
  }
  
  if (typeof data === 'object' && data !== null) {
    return sanitizeObject(data);
  }
  
  return data;
}

/**
 * Sanitize error objects for logging
 */
export function sanitizeError(error: Error): Record<string, unknown> {
  const seen = new WeakSet<object>();
  // The root error is on the current path, so a self-reference (e.g. a
  // `cause` pointing back at the error) is detected as circular.
  seen.add(error);

  const sanitized: Record<string, unknown> = {
    name: error.name,
    message: sanitizeString(error.message),
  };

  if (error.stack) {
    sanitized.stack = sanitizeString(error.stack);
  }

  for (const [key, value] of Object.entries(error)) {
    if (key !== 'name' && key !== 'message' && key !== 'stack') {
      const lowerKey = key.toLowerCase();
      
      if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
        sanitized[key] = REDACTED;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObjectInternal(value, seen);
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
  }

  return sanitized;
}

/**
 * Check if a string contains sensitive data patterns
 */
export function containsSensitiveData(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Reset lastIndex for global regexes before testing
  SENSITIVE_PATTERNS.jwt.lastIndex = 0;
  SENSITIVE_PATTERNS.apiKey.lastIndex = 0;
  SENSITIVE_PATTERNS.password.lastIndex = 0;
  SENSITIVE_PATTERNS.creditCard.lastIndex = 0;
  SENSITIVE_PATTERNS.email.lastIndex = 0;
  SENSITIVE_PATTERNS.phone.lastIndex = 0;
  SENSITIVE_PATTERNS.ssn.lastIndex = 0;
  SENSITIVE_PATTERNS.authHeader.lastIndex = 0;
  SENSITIVE_PATTERNS.privateKey.lastIndex = 0;

  return (
    SENSITIVE_PATTERNS.jwt.test(input) ||
    SENSITIVE_PATTERNS.apiKey.test(input) ||
    SENSITIVE_PATTERNS.password.test(input) ||
    SENSITIVE_PATTERNS.creditCard.test(input) ||
    SENSITIVE_PATTERNS.email.test(input) ||
    SENSITIVE_PATTERNS.ssn.test(input) ||
    SENSITIVE_PATTERNS.authHeader.test(input) ||
    SENSITIVE_PATTERNS.privateKey.test(input)
  );
}
