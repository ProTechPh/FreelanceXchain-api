/**
 * Add user_id index to user_preferences collection
 * Run this after the attributes are available (a few seconds after collection creation)
 * 
 * Run: npx tsx scripts/add-user-preferences-index.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, DatabasesIndexType } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function addIndex() {
  console.log('Adding user_id index to user_preferences collection...\n');

  try {
    await db.createIndex(
      DATABASE_ID,
      'user_preferences',
      'user_id',
      DatabasesIndexType.Unique,
      ['user_id']
    );
    console.log('✓ Index "user_id" created successfully');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('⊘ Index "user_id" already exists');
    } else {
      console.error('✗ Failed to create index:', error.message);
      process.exit(1);
    }
  }

  console.log('\n=== Index creation complete! ===');
}

addIndex();
