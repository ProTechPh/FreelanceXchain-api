import { Client, Account, Storage, Users, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { config } from './env.js';

// Initialize Appwrite client for server-side operations
const client = new Client()
  .setEndpoint(config.appwrite.endpoint)
  .setProject(config.appwrite.projectId)
  .setKey(config.appwrite.apiKey);

// Initialize Appwrite services
export const account = new Account(client);
export const storage = new Storage(client);
export const users = new Users(client);
export const databases = new Databases(client);

// Database ID (all collections live under one database)
export const DATABASE_ID = config.appwrite.databaseId || 'freelancexchain';

// Re-export utilities
export { Query, ID, Permission, Role };

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
