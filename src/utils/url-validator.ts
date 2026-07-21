/**
 * URL Validator Utility
 * Prevents SSRF (Server-Side Request Forgery) attacks
 * 
 * OWASP A10:2021 - Server-Side Request Forgery (SSRF)
 */

import { URL } from 'url';

/**
 * Blocked IP ranges (RFC 1918 private networks, loopback, link-local, etc.)
 */
const BLOCKED_IP_RANGES = [
  // Loopback addresses
  { start: '127.0.0.0', end: '127.255.255.255', description: 'Loopback' },
  
  // Private networks (RFC 1918)
  { start: '10.0.0.0', end: '10.255.255.255', description: 'Private Class A' },
  { start: '172.16.0.0', end: '172.31.255.255', description: 'Private Class B' },
  { start: '192.168.0.0', end: '192.168.255.255', description: 'Private Class C' },
  
  // Link-local addresses
  { start: '169.254.0.0', end: '169.254.255.255', description: 'Link-local' },
  
  // Multicast
  { start: '224.0.0.0', end: '239.255.255.255', description: 'Multicast' },
  
  // Reserved/Future use
  { start: '240.0.0.0', end: '255.255.255.255', description: 'Reserved' },
  
  // Localhost IPv6
  { start: '::1', end: '::1', description: 'IPv6 Loopback' },
  
  // IPv6 Link-local
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', description: 'IPv6 Link-local' },
];

/**
 * Allowed external domains (whitelist)
 * Add your trusted external services here
 */
const ALLOWED_DOMAINS = new Set([
  // Appwrite
  'appwrite.io',
  'appwrite.co',
  'cloud.appwrite.io',
  
  // Didit KYC
  'didit.me',
  'api.didit.me',
  
  // AI/LLM APIs (add your specific domains)
  'generativelanguage.googleapis.com', // Google Gemini
  'api.openai.com', // OpenAI
  'api.anthropic.com', // Anthropic
  
  // OAuth providers
  'accounts.google.com',
  'github.com',
  'login.microsoftonline.com',
  'www.linkedin.com',
]);

/**
 * Blocked hostnames
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS/Azure metadata
  '0.0.0.0', // Unspecified / all-interfaces (localhost bypass)
]);

/**
 * Expand an IPv6 address to 8 groups of 16-bit numbers (0-65535) for range comparison.
 * Returns null if the address is not a valid IPv6 address.
 */
function ipv6ToGroups(ip: string): number[] | null {
  // Strip any brackets and trailing zone id (e.g. `%eth0`).
  const raw = (ip
    .replace(/^\[/, '')
    .replace(/]$/, '')
    .split('%')[0]) as string;

  // Expand the `::` compression into 8 groups of 16-bit hex numbers.
  const doubleColon = raw.indexOf('::');
  let parts: string[];
  if (doubleColon !== -1) {
    const head = raw.slice(0, doubleColon).split(':').filter((p) => p !== '');
    const tail = raw.slice(doubleColon + 2).split(':').filter((p) => p !== '');
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    parts = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    parts = raw.split(':');
  }

  if (parts.length !== 8) return null;
  const nums = parts.map((g) => parseInt(g, 16));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/**
 * Compare two IPv6 address groups lexicographically.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareIpv6(a: number[], b: number[]): number {
  for (let i = 0; i < 8; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export { compareIpv6 };

/**
 * Parse a dotted-quad IPv4 address into a 32-bit unsigned number.
 */
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return nums.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

/**
 * Check if an IP address (IPv4 or IPv6) is within a blocked range.
 *
 * Returns:
 *   - `true`  if the IP is in a blocked range,
 *   - `false` if it is a valid IP but NOT in a blocked range,
 *   - `null`  if the input could not be parsed as an IP at all.
 *
 * The `null` case lets callers fail-closed: a hostname that looks like an IP
 * (per the IP gate) but does not parse as a valid IP is treated as blocked,
 * preventing SSRF bypass via malformed literals.
 */
function isIpInBlockedRange(ip: string): boolean | null {
  const ipv4Num = ipv4ToNumber(ip);
  if (ipv4Num !== null) {
    for (const range of BLOCKED_IP_RANGES) {
      const startNum = ipv4ToNumber(range.start);
      const endNum = ipv4ToNumber(range.end);
      if (startNum !== null && endNum !== null && ipv4Num >= startNum && ipv4Num <= endNum) {
        return true;
      }
    }
    return false;
  }

  const ipGroups = ipv6ToGroups(ip);
  if (ipGroups) {
    for (const range of BLOCKED_IP_RANGES) {
      const startGroups = ipv6ToGroups(range.start);
      const endGroups = ipv6ToGroups(range.end);
      if (startGroups && endGroups) {
        if (compareIpv6(ipGroups, startGroups) >= 0 && compareIpv6(ipGroups, endGroups) <= 0) {
          return true;
        }
      }
    }
    return false;
  }

  return null;
}

/**
 * Check if a hostname is allowed
 */
function isHostnameAllowed(hostname: string): boolean {
  // Check if hostname is blocked
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return false;
  }

  // Check if it's an IP address (IPv4 or IPv6)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    const blocked = isIpInBlockedRange(hostname);
    // Fail closed: an IP-looking hostname that cannot be parsed is blocked.
    return !(blocked === null || blocked);
  }

  // Check against whitelist
  const lowerHostname = hostname.toLowerCase();
  
  // Exact match
  if (ALLOWED_DOMAINS.has(lowerHostname)) {
    return true;
  }
  
  // Subdomain match (e.g., cloud.appwrite.io matches appwrite.io)
  for (const domain of ALLOWED_DOMAINS) {
    if (lowerHostname.endsWith('.' + domain) || lowerHostname === domain) {
      return true;
    }
  }
  
  return false;
}

/**
 * Public SSRF guard for a hostname. Returns true if the host is NOT a blocked
 * internal/metadata address and is on the allowed whitelist (or is a non-IP host
 * that passes the whitelist). Exposed so other validators (e.g. file upload URLs)
 * can apply the same SSRF protection.
 */
export function isHostnameSsrfAllowed(hostname: string): boolean {
  return isHostnameAllowed(hostname);
}

/**
 * Validation result
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

/**
 * Validate and sanitize a URL to prevent SSRF attacks
 */
export function validateUrl(urlString: string): UrlValidationResult {
  if (!urlString || typeof urlString !== 'string') {
    return {
      valid: false,
      error: 'URL must be a non-empty string',
    };
  }

  // Check for basic URL structure
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    return {
      valid: false,
      error: 'URL must use HTTP or HTTPS protocol',
    };
  }

  let parsedUrl: URL;
  
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
    };
  }

  // Only allow HTTP and HTTPS
  /* c8 ignore next 6 */
  /* istanbul ignore next */
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS protocols are allowed',
    };
  }

  // Check hostname
  const hostname = parsedUrl.hostname;
  
  if (!isHostnameAllowed(hostname)) {
    return {
      valid: false,
      error: `Access to hostname '${hostname}' is not allowed`,
    };
  }

  // Check for suspicious patterns in the URL
  const suspiciousPatterns = [
    /@/, // URLs with @ can be used for SSRF
    /\.\./,  // Path traversal
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(urlString)) {
      return {
        valid: false,
        error: 'URL contains suspicious patterns',
      };
    }
  }

  return {
    valid: true,
    sanitizedUrl: parsedUrl.toString(),
  };
}

/**
 * Validate a session ID or similar identifier to prevent injection into URLs
 */
export function validateSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  // Session IDs should be alphanumeric with hyphens/underscores only
  // This prevents URL manipulation attacks
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  
  if (!validPattern.test(sessionId)) {
    return false;
  }

  // Reasonable length check (adjust as needed)
  if (sessionId.length < 8 || sessionId.length > 128) {
    return false;
  }

  return true;
}

/**
 * Sanitize a session ID by removing any potentially dangerous characters
 */
export function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID must be a non-empty string');
  }

  // Remove any characters that aren't alphanumeric, hyphen, or underscore
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  if (sanitized.length === 0) {
    throw new Error('Session ID contains no valid characters');
  }

  if (!validateSessionId(sanitized)) {
    throw new Error('Session ID format is invalid');
  }

  return sanitized;
}
