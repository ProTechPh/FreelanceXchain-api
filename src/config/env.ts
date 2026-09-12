import './load-env.js';

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvVarOptional(key: string): string | undefined {
  return process.env[key];
}

function getEnvVarNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

function getEnvVarBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;

  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new Error(`Environment variable ${key} must be "true" or "false"`);
}

function getBaseUrl(): string {
  const explicitUrl = getEnvVarOptional('BASE_URL');
  if (explicitUrl) return explicitUrl;

  const hfSpaceId = getEnvVarOptional('SPACE_ID');
  if (hfSpaceId) return `https://${hfSpaceId.replace('/', '-').toLowerCase()}.hf.space`;

  const port = getEnvVarNumber('PORT', 3000);
  return `http://localhost:${port}`;
}

function getDisableRateLimiter(): boolean {
  const disabled = getEnvVarBoolean('DISABLE_RATE_LIMITER', false);
  const nodeEnv = process.env['NODE_ENV'];
  if (disabled && nodeEnv === 'production') {
    // In production, rate limiting MUST NEVER be disabled regardless of environment variables
    console.warn('[SECURITY WARNING] DISABLE_RATE_LIMITER=true is prohibited in production and will be ignored.');
    return false;
  }
  return disabled;
}

function getRedisConfig(): { host: string; port: number; password?: string; tls: boolean } {
  const redisUrl = process.env['REDIS_URL'];
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      return {
        host: parsed.hostname || 'localhost',
        port: parsed.port ? parseInt(parsed.port, 10) : 6379,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        tls: parsed.protocol === 'rediss:' || getEnvVarBoolean('REDIS_TLS', false),
      };
    } catch {
      // Fall through to separate env vars if URL parsing fails
    }
  }

  return {
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvVarNumber('REDIS_PORT', 6379),
    password: getEnvVarOptional('REDIS_PASSWORD'),
    tls: getEnvVarBoolean('REDIS_TLS', false),
  };
}

export const config = {
  server: {
    port: getEnvVarNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    baseUrl: getBaseUrl(),
    frontendUrl: getEnvVarOptional('FRONTEND_URL') ?? getEnvVarOptional('PUBLIC_URL') ?? 'http://localhost:3000',
    enableApiDocs: getEnvVarBoolean('ENABLE_API_DOCS', false),
    logLevel: getEnvVar('LOG_LEVEL', 'error'),
    verboseLogs: getEnvVarBoolean('VERBOSE_LOGS', false),
    disableRateLimiter: getDisableRateLimiter(),
    // Number of trusted reverse-proxy hops. Keeps req.ip (used by rate limiters and
    // audit logging) pointing at the real client instead of the proxy when deployed
    // behind nginx/Cloudflare/HF Spaces. Set 0 to disable and always use the socket
    // address. Express `trust proxy` semantics: a positive N trusts N hops from the
    // socket connection (the rightmost N entries of X-Forwarded-For).
    trustProxyHops: getEnvVarNumber('TRUST_PROXY_HOPS', 1),
  },
  appwrite: {
    endpoint: getEnvVar('APPWRITE_ENDPOINT'),
    projectId: getEnvVar('APPWRITE_PROJECT_ID'),
    apiKey: getEnvVar('APPWRITE_API_KEY'),
    databaseId: getEnvVar('APPWRITE_DATABASE_ID', 'freelancexchain'),
    buckets: {
      proposalAttachments: getEnvVar('APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET', 'proposal-attachments'),
      projectAttachments: getEnvVar('APPWRITE_PROJECT_ATTACHMENTS_BUCKET', 'project-attachments'),
      disputeEvidence: getEnvVar('APPWRITE_DISPUTE_EVIDENCE_BUCKET', 'dispute-evidence'),
      portfolioImages: getEnvVar('APPWRITE_PORTFOLIO_IMAGES_BUCKET', 'portfolio-images'),
      milestoneDeliverables: getEnvVar('APPWRITE_MILESTONE_DELIVERABLES_BUCKET', 'milestone-deliverables'),
    },
  },
  llm: {
    apiKey: getEnvVarOptional('LLM_API_KEY'),
    apiUrl: getEnvVar('LLM_API_URL'),
    model: getEnvVar('LLM_MODEL', 'claude-haiku-4.5'),
    timeoutMs: getEnvVarNumber('LLM_TIMEOUT_MS', 6000),
  },
  cryptoNews: {
    // Upstream provider for the crypto news proxy (cryptocurrency.cv free API).
    // Basic news/market endpoints work without a key; set CRYPTO_NEWS_API_KEY to
    // unlock premium endpoints and higher rate limits (sent as X-API-Key).
    baseUrl: getEnvVar('CRYPTO_NEWS_BASE_URL', 'https://cryptocurrency.cv'),
    apiKey: getEnvVarOptional('CRYPTO_NEWS_API_KEY'),
    timeoutMs: getEnvVarNumber('CRYPTO_NEWS_TIMEOUT_MS', 10000),
    // In-memory response cache TTL (ms). Repeated frontend calls for the same
    // path+params are served from cache instead of hitting the upstream rate
    // limit. Set 0 to disable caching entirely.
    cacheTtlMs: getEnvVarNumber('CRYPTO_NEWS_CACHE_TTL_MS', 60000),
  },
  cryptoPanic: {
    // Secondary news source (https://cryptopanic.com/developers/api/).
    // CryptoPanic requires an auth token; unauthenticated public requests are no longer supported.
    baseUrl: getEnvVar('CRYPTOPANIC_BASE_URL', 'https://cryptopanic.com/api/v1'),
    authToken: getEnvVarOptional('CRYPTOPANIC_AUTH_TOKEN'),
    timeoutMs: getEnvVarNumber('CRYPTOPANIC_TIMEOUT_MS', 8000),
  },
  // NOTE: No JWT signing config here. Auth tokens are issued and validated by
  // Appwrite (session JWTs via account.get/createSession) — the app never signs
  // or verifies its own tokens, so JWT_SECRET-style env vars would be dead
  // config that only confused operators (see auth-service.validateToken).

  blockchain: {
    rpcUrl: getEnvVarOptional('BLOCKCHAIN_RPC_URL'),
    privateKey: getEnvVarOptional('BLOCKCHAIN_PRIVATE_KEY'),
    // BLOCKCHAIN_MODE switches the blockchain backend: 'real' talks to actual
    // EVM contracts (dev → Ganache, prod → Polygon Amoy), 'simulated' emulates
    // the ledger in Appwrite for tests/CI and as a no-config fallback. The
    // `dev` and `prod` npm scripts force 'real' explicitly — the 'simulated'
    // default ONLY applies when BLOCKCHAIN_MODE is unset. See
    // src/services/blockchain/README.md for the parity notes between modes.
    mode: getEnvVar('BLOCKCHAIN_MODE', 'simulated') as 'real' | 'simulated',
    arbiterAddress: getEnvVarOptional('PLATFORM_ARBITER_ADDRESS'),
    arbiterPrivateKey: getEnvVarOptional('PLATFORM_ARBITER_PRIVATE_KEY'),
  },
  redis: {
    url: getEnvVarOptional('REDIS_URL'),
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvVarNumber('REDIS_PORT', 6379),
    password: getEnvVarOptional('REDIS_PASSWORD'),
    tls: getEnvVarBoolean('REDIS_TLS', false),
  },
  stripe: {
    // Stripe billing for the single "Pro" plan (the same product for freelancers
    // and employers). The secret and webhook signing keys are read lazily at
    // request time (getStripeSecretKey/getStripeWebhookSecret below) so the app
    // boots — and every free feature keeps working — with billing unconfigured.
    //
    // One Product ("Pro") with up to two Prices on it: monthly and annual are
    // billing variants of the same plan, not separate tiers.
    monthlyPriceId: getEnvVarOptional('STRIPE_MONTHLY_PRICE_ID'),
    annualPriceId: getEnvVarOptional('STRIPE_ANNUAL_PRICE_ID'),
    // Free trial length in days, applied to both billing intervals. 0 (the
    // default) means no trial.
    //
    // NOTE: a trial set on the Price in the Stripe Dashboard is NOT inherited
    // by the API — Stripe treats it only as a default for the Dashboard's own
    // subscription form. Checkout applies a trial only when the session asks
    // for one, which is why this exists.
    trialPeriodDays: getEnvVarNumber('STRIPE_TRIAL_PERIOD_DAYS', 0),
    // Client-side key. Not used by the hosted Checkout redirect this
    // integration uses, but exposed here for a future Payment Element.
    publishableKey: getEnvVarOptional('STRIPE_PUBLISHABLE_KEY'),
    // Stripe API host. Only worth overriding to point at a proxy or a mock;
    // the SDK talks to api.stripe.com by default.
    baseUrl: getEnvVar('STRIPE_BASE_URL', 'https://api.stripe.com'),
    // Dev-only escape hatch: when Stripe is unconfigured, treat every
    // authenticated user as Pro so gated features are reachable without a
    // Stripe account. Fatal at boot when NODE_ENV=production — a dev escape
    // hatch that can reach production is not an escape hatch.
    devGrantPro: getEnvVarBoolean('BILLING_DEV_GRANT_PRO', false),
  },
  turnstile: {
    secret: getEnvVarOptional('TURNSTILE_SECRET'),
    hostnames: getEnvVarOptional('TURNSTILE_HOSTNAMES') || 'freelancexchain.works,www.freelancexchain.works,localhost,127.0.0.1',
  },
} as const;

export type Config = typeof config;

/**
 * Lazily-resolved environment values.
 *
 * These are read at call time rather than module load so that middleware that
 * must react to environment switches (e.g. NODE_ENV toggled between test
 * cases) keeps working, and so secrets like the webhook HMAC key are picked up
 * whenever a request arrives. Centralizing them here means no module outside
 * of config/ touches process.env directly.
 */
export function getNodeEnv(): string {
  return getEnvVar('NODE_ENV', 'development');
}

export function getCsrfSecret(): string | undefined {
  return getEnvVarOptional('CSRF_SECRET');
}

export function getCorsOrigin(): string | undefined {
  return getEnvVarOptional('CORS_ORIGIN');
}

export function getBlockchainWebhookSecret(): string | undefined {
  return getEnvVarOptional('BLOCKCHAIN_WEBHOOK_SECRET');
}

export function getEmailWebhookSecret(): string | undefined {
  return getEnvVarOptional('EMAIL_WEBHOOK_SECRET');
}

/**
 * Stripe server-side key (prefer a restricted `rk_` key over a full `sk_` one).
 *
 * Read at call time so the client is only constructed when billing is actually
 * configured, and so tests can swap credentials between cases without
 * reloading the module. STRIPE_SECRET_KEY is accepted as an alias for
 * STRIPE_API_KEY; the canonical name wins when both are set.
 */
export function getStripeSecretKey(): string | undefined {
  return getEnvVarOptional('STRIPE_API_KEY') ?? getEnvVarOptional('STRIPE_SECRET_KEY');
}

/** Signing secret (whsec_...) for POST /api/webhooks/stripe. */
export function getStripeWebhookSecret(): string | undefined {
  return getEnvVarOptional('STRIPE_WEBHOOK_SECRET');
}

/** Cloudflare Turnstile server-side secret key for siteverify. */
export function getTurnstileSecret(): string | undefined {
  return getEnvVarOptional('TURNSTILE_SECRET');
}

export function getTurnstileHostnames(): string {
  return getEnvVarOptional('TURNSTILE_HOSTNAMES') || 'freelancexchain.works,www.freelancexchain.works,localhost,127.0.0.1';
}
