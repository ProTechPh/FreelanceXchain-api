// SSRF prevention — OWASP A10:2021

import { URL } from 'url';

// Blocked IP ranges (RFC 1918 private networks, loopback, link-local, etc.)
const BLOCKED_IP_RANGES = [
  { start: '127.0.0.0', end: '127.255.255.255', description: 'Loopback' },
  { start: '10.0.0.0', end: '10.255.255.255', description: 'Private Class A' },
  { start: '172.16.0.0', end: '172.31.255.255', description: 'Private Class B' },
  { start: '192.168.0.0', end: '192.168.255.255', description: 'Private Class C' },
  { start: '169.254.0.0', end: '169.254.255.255', description: 'Link-local' },
  { start: '224.0.0.0', end: '239.255.255.255', description: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', description: 'Reserved' },
  { start: '::1', end: '::1', description: 'IPv6 Loopback' },
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', description: 'IPv6 Link-local' },
];

const ALLOWED_DOMAINS = new Set([
  'appwrite.io',
  'appwrite.co',
  'cloud.appwrite.io',
  'didit.me',
  'api.didit.me',
  'cryptocurrency.cv',
  'generativelanguage.googleapis.com',
  'api.openai.com',
  'api.anthropic.com',
  'accounts.google.com',
  'github.com',
  'login.microsoftonline.com',
  'www.linkedin.com',
]);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  '0.0.0.0',
]);

// Expand IPv6 to 8 groups of 16-bit numbers for range comparison
function ipv6ToGroups(ip: string): number[] | null {
  const raw = (ip
    .replace(/^\[/, '')
    .replace(/]$/, '')
    .split('%')[0]) as string;

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

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return nums.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

// Returns true if blocked, false if valid, null if unparseable (fail-closed)
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

function isHostnameAllowed(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return false;
  }

  // IP addresses — check against blocked ranges
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    const blocked = isIpInBlockedRange(hostname);
    // Fail closed: unparseable IP-looking hostname is blocked
    return !(blocked === null || blocked);
  }

  const lowerHostname = hostname.toLowerCase();

  if (ALLOWED_DOMAINS.has(lowerHostname)) {
    return true;
  }

  // Subdomain match (e.g. cloud.appwrite.io matches appwrite.io)
  for (const domain of ALLOWED_DOMAINS) {
    if (lowerHostname.endsWith('.' + domain) || lowerHostname === domain) {
      return true;
    }
  }

  return false;
}

// Public SSRF guard — exposed for other validators (e.g. file upload URLs)
export function isHostnameSsrfAllowed(hostname: string): boolean {
  return isHostnameAllowed(hostname);
}

interface UrlValidationResult {
  valid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

export function validateUrl(urlString: string): UrlValidationResult {
  if (!urlString || typeof urlString !== 'string') {
    return {
      valid: false,
      error: 'URL must be a non-empty string',
    };
  }

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

  /* c8 ignore next 6 */
  /* istanbul ignore next */
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS protocols are allowed',
    };
  }

  const hostname = parsedUrl.hostname;

  if (!isHostnameAllowed(hostname)) {
    return {
      valid: false,
      error: `Access to hostname '${hostname}' is not allowed`,
    };
  }

  const suspiciousPatterns = [
    /@/,
    /\.\./,
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

export function validateSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  const validPattern = /^[a-zA-Z0-9_-]+$/;

  if (!validPattern.test(sessionId)) {
    return false;
  }

  if (sessionId.length < 8 || sessionId.length > 128) {
    return false;
  }

  return true;
}

export function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID must be a non-empty string');
  }

  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');

  if (sanitized.length === 0) {
    throw new Error('Session ID contains no valid characters');
  }

  if (!validateSessionId(sanitized)) {
    throw new Error('Session ID format is invalid');
  }

  return sanitized;
}
