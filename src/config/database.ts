import { CosmosClient, Database, Container } from '@azure/cosmos';
import { config } from './env.js';

let client: CosmosClient | null = null;
let database: Database | null = null;

export const COLLECTIONS = {
  USERS: 'users',
  FREELANCER_PROFILES: 'freelancerProfiles',
  EMPLOYER_PROFILES: 'employerProfiles',
  PROJECTS: 'projects',
  PROPOSALS: 'proposals',
  CONTRACTS: 'contracts',
  DISPUTES: 'disputes',
  SKILLS: 'skills',
  SKILL_CATEGORIES: 'skillCategories',
  NOTIFICATIONS: 'notifications',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

export function getCosmosClient(): CosmosClient {
  if (!client) {
    if (!config.cosmos.endpoint || !config.cosmos.key) {
      throw new Error('Cosmos DB configuration is missing. Set COSMOS_ENDPOINT and COSMOS_KEY environment variables.');
    }
    client = new CosmosClient({
      endpoint: config.cosmos.endpoint,
      key: config.cosmos.key,
    });
  }
  return client;
}

export async function getDatabase(): Promise<Database> {
  if (!database) {
    const cosmosClient = getCosmosClient();
    const { database: db } = await cosmosClient.databases.createIfNotExists({
      id: config.cosmos.database,
    });
    database = db;
  }
  return database;
}

export async function getContainer(containerName: CollectionName): Promise<Container> {
  const db = await getDatabase();
  return db.container(containerName);
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();
  
  const containerConfigs: Array<{ id: CollectionName; partitionKey: string }> = [
    { id: COLLECTIONS.USERS, partitionKey: '/id' },
    { id: COLLECTIONS.FREELANCER_PROFILES, partitionKey: '/userId' },
    { id: COLLECTIONS.EMPLOYER_PROFILES, partitionKey: '/userId' },
    { id: COLLECTIONS.PROJECTS, partitionKey: '/employerId' },
    { id: COLLECTIONS.PROPOSALS, partitionKey: '/projectId' },
    { id: COLLECTIONS.CONTRACTS, partitionKey: '/id' },
    { id: COLLECTIONS.DISPUTES, partitionKey: '/contractId' },
    { id: COLLECTIONS.SKILLS, partitionKey: '/categoryId' },
    { id: COLLECTIONS.SKILL_CATEGORIES, partitionKey: '/id' },
    { id: COLLECTIONS.NOTIFICATIONS, partitionKey: '/userId' },
  ];

  for (const containerConfig of containerConfigs) {
    await db.containers.createIfNotExists({
      id: containerConfig.id,
      partitionKey: { paths: [containerConfig.partitionKey] },
    });
  }
}
