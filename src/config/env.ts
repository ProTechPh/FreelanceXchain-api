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
  jwt: {
    secret: getEnvVar('JWT_SECRET'),
    refreshSecret: (() => {
      const refreshSecret = getEnvVarOptional('JWT_REFRESH_SECRET');
      if (!refreshSecret) {
        const msg = 'JWT_REFRESH_SECRET not set — access and refresh tokens share the same signing key (insecure in production)';
        if (getEnvVar('NODE_ENV', 'development') === 'production') {
          throw new Error(msg);
        }
        console.warn(msg);
      }
      return refreshSecret ?? getEnvVar('JWT_SECRET');
    })(),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '1h'),
    refreshExpiresIn: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  blockchain: {
    rpcUrl: getEnvVarOptional('BLOCKCHAIN_RPC_URL'),
    privateKey: getEnvVarOptional('BLOCKCHAIN_PRIVATE_KEY'),
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
