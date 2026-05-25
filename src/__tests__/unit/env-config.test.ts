import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule('dotenv', () => ({
  default: { config: jest.fn() },
  config: jest.fn(),
}));

const originalEnv = { ...process.env };

describe('Env Config', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const importModule = async () => {
    jest.unstable_mockModule('dotenv', () => ({
      default: { config: jest.fn() },
      config: jest.fn(),
    }));
    return await import('../../config/env.js');
  };

  const setRequiredEnv = () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
    process.env.APPWRITE_PROJECT_ID = 'project123';
    process.env.APPWRITE_API_KEY = 'key123';
    process.env.LLM_API_URL = 'https://api.llm.com';
    process.env.JWT_SECRET = 'test-jwt-secret';
  };

  describe('required environment variables', () => {
    it('should throw when DATABASE_URL is missing', async () => {
      setRequiredEnv();
      delete process.env.DATABASE_URL;

      await expect(importModule()).rejects.toThrow('DATABASE_URL');
    });

    it('should throw when APPWRITE_ENDPOINT is missing', async () => {
      setRequiredEnv();
      delete process.env.APPWRITE_ENDPOINT;

      await expect(importModule()).rejects.toThrow('APPWRITE_ENDPOINT');
    });

    it('should throw when JWT_SECRET is missing', async () => {
      setRequiredEnv();
      delete process.env.JWT_SECRET;

      await expect(importModule()).rejects.toThrow('JWT_SECRET');
    });
  });

  describe('default values', () => {
    it('should use default PORT', async () => {
      setRequiredEnv();
      delete process.env.PORT;

      const { config } = await importModule();
      expect(config.server.port).toBe(3000);
    });

    it('should use default NODE_ENV', async () => {
      setRequiredEnv();
      delete process.env.NODE_ENV;

      const { config } = await importModule();
      expect(config.server.nodeEnv).toBe('development');
    });

    it('should use default ENABLE_API_DOCS', async () => {
      setRequiredEnv();
      delete process.env.ENABLE_API_DOCS;

      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(false);
    });

    it('should use default LLM_MODEL', async () => {
      setRequiredEnv();
      delete process.env.LLM_MODEL;

      const { config } = await importModule();
      expect(config.llm.model).toBe('claude-haiku-4.5');
    });

    it('should use default BLOCKCHAIN_MODE', async () => {
      setRequiredEnv();
      delete process.env.BLOCKCHAIN_MODE;

      const { config } = await importModule();
      expect(config.blockchain.mode).toBe('simulated');
    });
  });

  describe('getBaseUrl', () => {
    it('should use BASE_URL when provided', async () => {
      setRequiredEnv();
      process.env.BASE_URL = 'https://custom.example.com';

      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('https://custom.example.com');
    });

    it('should use SPACE_ID for HuggingFace Spaces', async () => {
      setRequiredEnv();
      delete process.env.BASE_URL;
      process.env.SPACE_ID = 'user/space-name';

      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('https://user-space-name.hf.space');
    });

    it('should default to localhost with PORT', async () => {
      setRequiredEnv();
      delete process.env.BASE_URL;
      delete process.env.SPACE_ID;
      process.env.PORT = '8080';

      const { config } = await importModule();
      expect(config.server.baseUrl).toBe('http://localhost:8080');
    });
  });

  describe('boolean parsing', () => {
    it('should parse true correctly', async () => {
      setRequiredEnv();
      process.env.ENABLE_API_DOCS = 'true';

      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(true);
    });

    it('should parse false correctly', async () => {
      setRequiredEnv();
      process.env.ENABLE_API_DOCS = 'false';

      const { config } = await importModule();
      expect(config.server.enableApiDocs).toBe(false);
    });

    it('should throw on invalid boolean', async () => {
      setRequiredEnv();
      process.env.ENABLE_API_DOCS = 'yes';

      await expect(importModule()).rejects.toThrow('ENABLE_API_DOCS');
    });
  });

  describe('number parsing', () => {
    it('should parse valid number', async () => {
      setRequiredEnv();
      process.env.PORT = '4000';

      const { config } = await importModule();
      expect(config.server.port).toBe(4000);
    });

    it('should throw on invalid number', async () => {
      setRequiredEnv();
      process.env.PORT = 'not-a-number';

      await expect(importModule()).rejects.toThrow('PORT');
    });
  });

  describe('JWT refresh secret', () => {
    it('should use JWT_REFRESH_SECRET when provided', async () => {
      setRequiredEnv();
      process.env.JWT_REFRESH_SECRET = 'refresh-secret';

      const { config } = await importModule();
      expect(config.jwt.refreshSecret).toBe('refresh-secret');
    });

    it('should fallback to JWT_SECRET when JWT_REFRESH_SECRET is missing', async () => {
      setRequiredEnv();
      delete process.env.JWT_REFRESH_SECRET;

      const { config } = await importModule();
      expect(config.jwt.refreshSecret).toBe(process.env.JWT_SECRET);
    });

    it('should throw in production when JWT_REFRESH_SECRET is missing', async () => {
      setRequiredEnv();
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_REFRESH_SECRET;

      await expect(importModule()).rejects.toThrow('JWT_REFRESH_SECRET');
    });
  });

  describe('optional variables', () => {
    it('should allow missing BLOCKCHAIN_RPC_URL', async () => {
      setRequiredEnv();
      delete process.env.BLOCKCHAIN_RPC_URL;

      const { config } = await importModule();
      expect(config.blockchain.rpcUrl).toBeUndefined();
    });

    it('should allow missing BLOCKCHAIN_PRIVATE_KEY', async () => {
      setRequiredEnv();
      delete process.env.BLOCKCHAIN_PRIVATE_KEY;

      const { config } = await importModule();
      expect(config.blockchain.privateKey).toBeUndefined();
    });

    it('should allow missing LLM_API_KEY', async () => {
      setRequiredEnv();
      delete process.env.LLM_API_KEY;

      const { config } = await importModule();
      expect(config.llm.apiKey).toBeUndefined();
    });
  });

  describe('config type', () => {
    it('should export Config type', async () => {
      setRequiredEnv();

      const mod = await importModule();
      expect(mod.config).toBeDefined();
      expect(typeof mod.config).toBe('object');
    });
  });
});
