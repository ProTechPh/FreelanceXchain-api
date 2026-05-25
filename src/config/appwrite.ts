import { Client, Account, Storage, Users } from 'node-appwrite';
import { config } from './env.js';
import { logger } from './logger.js';

// Initialize Appwrite client for server-side operations
const client = new Client()
  .setEndpoint(config.appwrite.endpoint)
  .setProject(config.appwrite.projectId)
  .setKey(config.appwrite.apiKey);

// Initialize Appwrite services
export const account = new Account(client);
export const storage = new Storage(client);
export const users = new Users(client);

// Storage Bucket IDs
export const BUCKETS = {
  PROPOSAL_ATTACHMENTS: config.appwrite.buckets.proposalAttachments,
  PROJECT_ATTACHMENTS: config.appwrite.buckets.projectAttachments,
  DISPUTE_EVIDENCE: config.appwrite.buckets.disputeEvidence,
  PORTFOLIO_IMAGES: config.appwrite.buckets.portfolioImages,
  MILESTONE_DELIVERABLES: config.appwrite.buckets.milestoneDeliverables,
} as const;

export type BucketId = typeof BUCKETS[keyof typeof BUCKETS];

/**
 * Create a client for user-specific operations (with JWT)
 */
export function createUserClient(jwt: string): Client {
  return new Client()
    .setEndpoint(config.appwrite.endpoint)
    .setProject(config.appwrite.projectId)
    .setJWT(jwt);
}

/**
 * Initialize and verify Appwrite connection
 */
export async function initializeAppwrite(): Promise<void> {
  try {
    // Test connection by listing buckets
    const buckets = await storage.listBuckets();
    logger.info('Appwrite connection verified', { 
      bucketsCount: buckets.total,
      endpoint: config.appwrite.endpoint,
      projectId: config.appwrite.projectId,
    });
  } catch (error) {
    logger.error('Failed to connect to Appwrite', error);
    throw new Error(`Appwrite connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
