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
    delete process.env.TRUST_PROXY_HOPS;
  });

  const setupRequiredEnv = () => {
    process.env.APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
    process.env.APPWRITE_PROJECT_ID = 'test-project-id';
    process.env.APPWRITE_API_KEY = 'test-api-key';
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

    it('should default trustProxyHops to 1', async () => {
      setupRequiredEnv();
      delete process.env.TRUST_PROXY_HOPS;
      const { config } = await importModule();
      expect(config.server.trustProxyHops).toBe(1);
    });

    it('should parse TRUST_PROXY_HOPS as number', async () => {
      setupRequiredEnv();
      process.env.TRUST_PROXY_HOPS = '2';
      const { config } = await importModule();
      expect(config.server.trustProxyHops).toBe(2);
    });

    it('should throw when TRUST_PROXY_HOPS is not a number', async () => {
      setupRequiredEnv();
      process.env.TRUST_PROXY_HOPS = 'many';
      await expect(importModule()).rejects.toThrow('Environment variable TRUST_PROXY_HOPS must be a number');
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

    it('should use default LLM_MODEL', async () => {
      setupRequiredEnv();
      delete process.env.LLM_MODEL;
      const { config } = await importModule();
      expect(config.llm.model).toBe('claude-haiku-4.5');
    });

    it('should allow missing BLOCKCHAIN_RPC_URL', async () => {
      setupRequiredEnv();
      delete process.env.BLOCKCHAIN_RPC_URL;
      const { config } = await importModule();
      expect(config.blockchain.rpcUrl).toBeUndefined();
    });

    it('should allow missing BLOCKCHAIN_PRIVATE_KEY', async () => {
      setupRequiredEnv();
      delete process.env.BLOCKCHAIN_PRIVATE_KEY;
      const { config } = await importModule();
      expect(config.blockchain.privateKey).toBeUndefined();
    });

    it('should allow missing LLM_API_KEY', async () => {
      setupRequiredEnv();
      delete process.env.LLM_API_KEY;
      const { config } = await importModule();
      expect(config.llm.apiKey).toBeUndefined();
    });
  });

  describe('error cases', () => {
    it('should throw when a required env var is missing (getEnvVar line 8)', async () => {
      setupRequiredEnv();
      delete process.env.APPWRITE_ENDPOINT;
      await expect(importModule()).rejects.toThrow('Environment variable APPWRITE_ENDPOINT is required but not set');
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

  });
});
