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

export const config = {
  server: {
    port: getEnvVarNumber('PORT', 3000),
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
  },
  cosmos: {
    endpoint: getEnvVar('COSMOS_ENDPOINT', ''),
    key: getEnvVar('COSMOS_KEY', ''),
    database: getEnvVar('COSMOS_DATABASE', 'freelance-marketplace'),
  },
  jwt: {
    secret: getEnvVar('JWT_SECRET', 'development-secret-key-min-32-chars'),
    expiresIn: getEnvVar('JWT_EXPIRES_IN', '1h'),
    refreshExpiresIn: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  llm: {
    apiKey: getEnvVarOptional('LLM_API_KEY'),
    apiUrl: getEnvVar('LLM_API_URL', 'https://generativelanguage.googleapis.com/v1beta'),
  },
  blockchain: {
    rpcUrl: getEnvVarOptional('BLOCKCHAIN_RPC_URL'),
    privateKey: getEnvVarOptional('BLOCKCHAIN_PRIVATE_KEY'),
  },
} as const;

export type Config = typeof config;
