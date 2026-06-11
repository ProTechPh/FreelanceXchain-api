import dotenv from 'dotenv';

dotenv.config();

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
  // Check for explicit BASE_URL first
  const explicitUrl = getEnvVarOptional('BASE_URL');
  if (explicitUrl) return explicitUrl;

  // HuggingFace Spaces
  const hfSpaceId = getEnvVarOptional('SPACE_ID');
  if (hfSpaceId) return `https://${hfSpaceId.replace('/', '-').toLowerCase()}.hf.space`;

  // Default to localhost
  const port = getEnvVarNumber('PORT', 3000);
  return `http://localhost:${port}`;
}

export const config = {
  server: {
    port: getEnvVarNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    baseUrl: getBaseUrl(),
    enableApiDocs: getEnvVarBoolean('ENABLE_API_DOCS', false),
  },
  database: {
    url: getEnvVar('DATABASE_URL'),
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
  },
} as const;

export type Config = typeof config;
