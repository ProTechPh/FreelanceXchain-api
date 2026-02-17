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
  apiKey: /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
  
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

  // Apply all pattern-based redactions
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
 * Sanitize an object by redacting sensitive fields
 */
export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  // Handle null
  if (obj === null) {
    return null;
  }

  // Handle objects
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field name is sensitive
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      sanitized[key] = REDACTED;
      continue;
    }

    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize log data (can be string or object)
 */
export function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  
  if (typeof data === 'object') {
    return sanitizeObject(data);
  }
  
  return data;
}

/**
 * Sanitize error objects for logging
 */
export function sanitizeError(error: Error): any {
  const sanitized: any = {
    name: error.name,
    message: sanitizeString(error.message),
  };

  // Include stack trace but sanitize it
  if (error.stack) {
    sanitized.stack = sanitizeString(error.stack);
  }

  // Include any additional properties
  for (const [key, value] of Object.entries(error)) {
    if (key !== 'name' && key !== 'message' && key !== 'stack') {
      sanitized[key] = sanitizeLogData(value);
    }
  }

  return sanitized;
}

/**
 * Check if a string contains sensitive data
 */
export function containsSensitiveData(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  return Object.values(SENSITIVE_PATTERNS).some(pattern => pattern.test(input));
}
