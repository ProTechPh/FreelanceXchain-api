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
  supabase: {
    url: getEnvVar('SUPABASE_URL'),
    anonKey: getEnvVar('SUPABASE_ANON_KEY'),
    serviceRoleKey: getEnvVarOptional('SUPABASE_SERVICE_ROLE_KEY'),
    storage: {
      proposalAttachmentsBucket: getEnvVar('SUPABASE_PROPOSAL_ATTACHMENTS_BUCKET', 'proposal-attachments'),
    },
  },
  jwt: {
    secret: getEnvVar('JWT_SECRET'),
    refreshSecret: (() => {
      const refreshSecret = getEnvVarOptional('JWT_REFRESH_SECRET');
      if (!refreshSecret && getEnvVar('NODE_ENV', 'development') === 'production') {
        throw new Error('JWT_REFRESH_SECRET is required in production. Using the same secret for access and refresh tokens is a security risk.');
      }
      return refreshSecret ?? getEnvVar('JWT_SECRET');
    })(),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '1h'),
    refreshExpiresIn: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  llm: {
    apiKey: getEnvVarOptional('LLM_API_KEY'),
    apiUrl: getEnvVar('LLM_API_URL'),
    model: getEnvVar('LLM_MODEL', 'claude-haiku-4.5'),
  },
  blockchain: {
    rpcUrl: getEnvVarOptional('BLOCKCHAIN_RPC_URL'),
    privateKey: getEnvVarOptional('BLOCKCHAIN_PRIVATE_KEY'),
    mode: getEnvVar('BLOCKCHAIN_MODE', 'simulated') as 'real' | 'simulated',
  },
} as const;

export type Config = typeof config;
