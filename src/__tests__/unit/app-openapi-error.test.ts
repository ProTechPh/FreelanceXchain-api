// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: {
      port: 3000,
      nodeEnv: 'test',
      baseUrl: 'http://localhost:3000',
      enableApiDocs: true, // Enable API docs to trigger the code path
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
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x' + 'a'.repeat(64),
      mode: 'simulated',
    },
    database: { url: 'postgresql://localhost/test' },
  },
}));

// Mock node:fs/promises to make readFile throw for openapi.json
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('openapi.json')) {
      return Promise.reject(new Error('ENOENT: no such file or directory'));
    }
    return Promise.reject(new Error('File not found'));
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
