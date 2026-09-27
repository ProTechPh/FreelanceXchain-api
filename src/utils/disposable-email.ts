import { logger } from '../config/logger.js';

// Common disposable / temporary email domains (fallback blocklist)
const KNOWN_DISPOSABLE_DOMAINS = new Set<string>([
  'omanarts.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'fakemailgenerator.com',
  'mohmal.com',
  'mytemp.email',
  'tempail.com',
  'burnermail.io',
  'maildrop.cc',
  'inboxkitten.com',
  'crazymailing.com',
  'getairmail.com',
  'generator.email',
]);

const cache = new Map<string, { disposable: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Checks whether an email address is from a disposable/temporary email provider.
 * Uses local domain blocklist first, then queries DeBounce API with a short timeout.
 */
export async function isDisposableEmail(email: string): Promise<boolean> {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const normalized = email.toLowerCase().trim();
  const domain = normalized.split('@')[1];
  if (!domain) {
    return false;
  }

  // 1. Fast check against known local blocklist
  if (KNOWN_DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }

  // 2. Check in-memory cache
  const cached = cache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.disposable;
  }

  // 3. Query DeBounce free disposable check API with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`https://disposable.debounce.io/?email=${encodeURIComponent(normalized)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json() as { disposable?: string | boolean };
      const isDisposable = data.disposable === 'true' || data.disposable === true;

      // Keep cache bounded
      if (cache.size > 2000) {
        cache.clear();
      }
      cache.set(domain, { disposable: isDisposable, expiresAt: Date.now() + CACHE_TTL_MS });

      return isDisposable;
    }
  } catch (error) {
    // Fail open: log debug and do not block legitimate users if remote service is unavailable
    logger.debug('Disposable email check API skipped/failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return false;
}
