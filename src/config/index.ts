export { config } from './env.js';
export type { Config } from './env.js';
export { 
  getCosmosClient, 
  getDatabase, 
  getContainer, 
  initializeDatabase,
  COLLECTIONS 
} from './database.js';
export type { CollectionName } from './database.js';
export { swaggerSpec } from './swagger.js';
