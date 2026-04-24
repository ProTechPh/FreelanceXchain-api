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
  // Supabase
  'supabase.co',
  'supabase.com',
  
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
]);

/**
 * Convert IP address string to number for comparison
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return 0;
  }
  return parts.reduce((acc, part) => (acc << 8) + parseInt(part, 10), 0) >>> 0;
}

/**
 * Check if an IP address is in a blocked range
 */
function isIpInBlockedRange(ip: string): boolean {
  // Simple IPv4 check
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    // For IPv6 or invalid IPs, block localhost and link-local
    if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('::ffff:127.')) {
      return true;
    }
    return false;
  }

  const ipNum = ipToNumber(ip);
  
  for (const range of BLOCKED_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a hostname is allowed
 */
function isHostnameAllowed(hostname: string): boolean {
  // Check if hostname is blocked
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return false;
  }

  // Check if it's an IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return !isIpInBlockedRange(hostname);
  }

  // Check against whitelist
  const lowerHostname = hostname.toLowerCase();
  
  // Exact match
  if (ALLOWED_DOMAINS.has(lowerHostname)) {
    return true;
  }
  
  // Subdomain match (e.g., xyz.supabase.co matches supabase.co)
  for (const domain of ALLOWED_DOMAINS) {
    if (lowerHostname.endsWith('.' + domain) || lowerHostname === domain) {
      return true;
    }
  }
  
  return false;
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
