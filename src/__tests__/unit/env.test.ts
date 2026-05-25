import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule('dotenv', () => ({
  default: { config: jest.fn() },
  config: jest.fn(),
}));

describe('Env Config', () => {
  const importModule = async () => {
    jest.unstable_mockModule('dotenv', () => ({
      default: { config: jest.fn() },
      config: jest.fn(),
    }));
    return await import('../../config/env.js');
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.PORT;
    delete process.env.BASE_URL;
    delete process.env.SPACE_ID;
    delete process.env.ENABLE_API_DOCS;
    delete process.env.JWT_REFRESH_SECRET;
  });

  const setupRequiredEnv = () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/freelancexchain_test';
    process.env.APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
    process.env.APPWRITE_PROJECT_ID = 'test-project-id';
    process.env.APPWRITE_API_KEY = 'test-api-key';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.LLM_API_URL = 'http://localhost:5000';
  };

  describe('config values', () => {
    it('should use default port when PORT is not set', async () => {
      setupRequiredEnv();
      delete process.env.PORT;
      const { config } = await importModule();
      expect(config.server.port).toBe(3000);
    });

    it('should parse PORT as number', async () => {
      setupRequiredEnv();
      process.env.PORT = '8080';
      const { config } = await importModule();
      expect(config.server.port).toBe(8080);
    });

    it('should default nodeEnv to development when not set', async () => {
      setupRequiredEnv();
      delete process.env.NODE_ENV;
      const { config } = await importModule();
      expect(config.server.nodeEnv).toBe('development');
    });

    it('should use explicit BASE_URL', async () => {
      setupRequiredEnv();
      process.env.BASE_URL = 'https://example.com';
      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('https://example.com');
    });

    it('should use SPACE_ID for HuggingFace URL', async () => {
      setupRequiredEnv();
      process.env.SPACE_ID = 'User/Space-Name';
      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('https://user-space-name.hf.space');
    });

    it('should default baseUrl to localhost', async () => {
      setupRequiredEnv();
      delete process.env.BASE_URL;
      delete process.env.SPACE_ID;
      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('http://localhost:3000');
    });

    it('should default baseUrl to localhost with custom port', async () => {
      setupRequiredEnv();
      delete process.env.BASE_URL;
      delete process.env.SPACE_ID;
      process.env.PORT = '4000';
      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('http://localhost:4000');
    });

    it('should default enableApiDocs to false', async () => {
      setupRequiredEnv();
      delete process.env.ENABLE_API_DOCS;
      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(false);
    });

    it('should parse ENABLE_API_DOCS as true', async () => {
      setupRequiredEnv();
      process.env.ENABLE_API_DOCS = 'true';
      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(true);
    });

    it('should parse ENABLE_API_DOCS as false', async () => {
      setupRequiredEnv();
      process.env.ENABLE_API_DOCS = 'false';
      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(false);
    });

    it('should set jwt secret', async () => {
      setupRequiredEnv();
      process.env.JWT_SECRET = 'my-secret';
      const { config } = await importModule();
      expect(config.jwt.secret).toBe('my-secret');
    });

    it('should set jwt expiresIn', async () => {
      setupRequiredEnv();
      process.env.JWT_EXPIRES_IN = '2h';
      const { config } = await importModule();
      expect(config.jwt.expiresIn).toBe('2h');
    });

    it('should set blockchain mode', async () => {
      setupRequiredEnv();
      process.env.BLOCKCHAIN_MODE = 'real';
      const { config } = await importModule();
      expect(config.blockchain.mode).toBe('real');
    });

    it('should use optional rpcUrl', async () => {
      setupRequiredEnv();
      process.env.BLOCKCHAIN_RPC_URL = 'http://rpc.example.com';
      const { config } = await importModule();
      expect(config.blockchain.rpcUrl).toBe('http://rpc.example.com');
    });

    it('should use optional privateKey', async () => {
      setupRequiredEnv();
      process.env.BLOCKCHAIN_PRIVATE_KEY = '0xabc';
      const { config } = await importModule();
      expect(config.blockchain.privateKey).toBe('0xabc');
    });

    it('should fallback jwt refreshSecret to jwt secret', async () => {
      setupRequiredEnv();
      delete process.env.JWT_REFRESH_SECRET;
      const { config } = await importModule();
      expect(config.jwt.refreshSecret).toBe('test-jwt-secret');
    });
  });

  describe('error cases', () => {
    it('should throw when required env var is missing', async () => {
      setupRequiredEnv();
      delete process.env.DATABASE_URL;
      await expect(importModule()).rejects.toThrow('Environment variable DATABASE_URL is required but not set');
    });

    it('should throw when PORT is not a number', async () => {
      setupRequiredEnv();
      process.env.PORT = 'not-a-number';
      await expect(importModule()).rejects.toThrow('Environment variable PORT must be a number');
    });

    it('should throw when ENABLE_API_DOCS is invalid', async () => {
      setupRequiredEnv();
      process.env.ENABLE_API_DOCS = 'yes';
      await expect(importModule()).rejects.toThrow('Environment variable ENABLE_API_DOCS must be "true" or "false"');
    });

    it('should throw when JWT_REFRESH_SECRET is missing in production', async () => {
      setupRequiredEnv();
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_REFRESH_SECRET;
      await expect(importModule()).rejects.toThrow('JWT_REFRESH_SECRET is required in production');
    });

    it('should not throw when JWT_REFRESH_SECRET is set in production', async () => {
      setupRequiredEnv();
      process.env.NODE_ENV = 'production';
      process.env.JWT_REFRESH_SECRET = 'refresh-secret';
      const { config } = await importModule();
      expect(config.jwt.refreshSecret).toBe('refresh-secret');
    });
  });
});
