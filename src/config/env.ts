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

export const config = {
  server: {
    port: getEnvVarNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    baseUrl: getBaseUrl(),
    enableApiDocs: getEnvVarBoolean('ENABLE_API_DOCS', false),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
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
    // Free tier works without a token (public=true). Set CRYPTOPANIC_AUTH_TOKEN
    // to unlock authenticated endpoints and higher per-minute limits.
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
    host: getEnvVar('REDIS_HOST', 'localhost'),
    port: getEnvVarNumber('REDIS_PORT', 6379),
    password: getEnvVarOptional('REDIS_PASSWORD'),
    tls: getEnvVarBoolean('REDIS_TLS', false),
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
