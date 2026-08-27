import dotenv from 'dotenv';
dotenv.config();

import { Client, Storage, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const storage = new Storage(client);

const BUCKETS_TO_SETUP = [
  { id: 'proposal-attachments', name: 'Proposal Attachments', permissions: [Permission.read(Role.any()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())] },
  { id: 'project-attachments', name: 'Project Attachments', permissions: [Permission.read(Role.any()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())] },
  { id: 'dispute-evidence', name: 'Dispute Evidence', permissions: [Permission.read(Role.users()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())] },
  { id: 'portfolio-images', name: 'Portfolio Images', permissions: [Permission.read(Role.any()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())] },
  { id: 'milestone-deliverables', name: 'Milestone Deliverables', permissions: [Permission.read(Role.users()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())] },
];

async function run() {
  console.log('Checking Appwrite Storage buckets...');
  const existing = await storage.listBuckets();
  const existingIds = new Set(existing.buckets.map((b) => b.$id));

  for (const b of BUCKETS_TO_SETUP) {
    if (existingIds.has(b.id)) {
      console.log(`✓ Bucket '${b.id}' already exists.`);
    } else {
      console.log(`Creating bucket '${b.id}' (${b.name})...`);
      try {
        await storage.createBucket(b.id, b.name, b.permissions, false, true, undefined, ['jpg', 'png', 'gif', 'webp', 'pdf', 'zip', 'txt', 'docx', 'xlsx', 'csv']);
        console.log(`✓ Bucket '${b.id}' created successfully.`);
      } catch (err) {
        console.error(`✗ Error creating bucket '${b.id}':`, err);
      }
    }
  }
  console.log('Storage buckets check complete.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
