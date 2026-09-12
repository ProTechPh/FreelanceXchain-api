// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { Router } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockApiRouter = Router();

jest.unstable_mockModule(resolveModule('src/routes/index.ts'), () => ({
  default: mockApiRouter,
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    // Billing left unconfigured: the app must boot and every free feature must
    // work with no Stripe keys present.
    stripe: {
      monthlyPriceId: undefined,
      annualPriceId: undefined,
      publishableKey: undefined,
      baseUrl: 'https://api.stripe.com',
      devGrantPro: false,
    },
    server: {
      port: 3000,
      nodeEnv: 'test',
      baseUrl: 'http://localhost:3000',
      enableApiDocs: true, // Enable API docs to trigger the code path
      trustProxyHops: 0,
    },
    appwrite: {
      url: 'http://localhost:54321',
      anonKey: 'test-anon-key',
      serviceRoleKey: 'test-service-role-key',
      apiKey: 'test-api-key',
      projectId: 'test-project-id',
      endpoint: 'http://localhost:54321/v1',
      storage: {
        proposalAttachmentsBucket: 'proposal-attachments',
      },
      buckets: {
        proposalAttachments: 'proposal-attachments',
        projectAttachments: 'project-attachments',
        disputeEvidence: 'dispute-evidence',
        portfolioImages: 'portfolio-images',
        milestoneDeliverables: 'milestone-deliverables',
      },
    },
    jwt: {
      secret: 'test-jwt-secret',
      refreshSecret: 'test-jwt-secret',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
    },
    llm: {
      apiKey: 'test-llm-key',
      apiUrl: 'http://localhost:8000',
      model: 'claude-haiku-4.5',
    },
    cryptoNews: {
      baseUrl: 'https://cryptocurrency.cv',
      apiKey: undefined,
      timeoutMs: 10000,
      cacheTtlMs: 60000,
    },
    cryptoPanic: {
      baseUrl: 'https://cryptopanic.com/api/v1',
      authToken: undefined,
      timeoutMs: 8000,
    },
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x' + 'a'.repeat(64),
      mode: 'simulated',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      tls: false,
    },
  },
  getCorsOrigin: () => process.env['CORS_ORIGIN'],
  getNodeEnv: () => process.env['NODE_ENV'] ?? 'development',
  getCsrfSecret: () => process.env['CSRF_SECRET'],
  getStripeSecretKey: () => process.env['STRIPE_SECRET_KEY'],
  getStripeWebhookSecret: () => process.env['STRIPE_WEBHOOK_SECRET'],
  getBlockchainWebhookSecret: () => process.env['BLOCKCHAIN_WEBHOOK_SECRET'],
  getEmailWebhookSecret: () => process.env['EMAIL_WEBHOOK_SECRET'],
}));

import * as realFs from 'node:fs/promises';

// Mock node:fs/promises to make readFile throw for openapi.json
jest.unstable_mockModule('node:fs/promises', () => ({
  ...realFs,
  readFile: jest.fn().mockImplementation((filePath: string, ...args: any[]) => {
    if (String(filePath).includes('openapi.json')) {
      return Promise.reject(new Error('ENOENT: no such file or directory'));
    }
    return (realFs.readFile as any)(filePath, ...args);
  }),
}));

const { createApp } = await import('../../app.js');

describe('App - OpenAPI Spec Loading Error', () => {
  it('should throw error when OpenAPI spec file cannot be loaded', async () => {
    await expect(createApp()).rejects.toThrow('Failed to load OpenAPI spec');
  });

  it('should include the file path in the error message', async () => {
    await expect(createApp()).rejects.toThrow('openapi.json');
  });
});
