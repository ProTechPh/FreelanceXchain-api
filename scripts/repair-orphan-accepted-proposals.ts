/**
 * Repair proposals left 'accepted' without a contract.
 *
 * Before acceptance compensated a failed contract insert, a proposal could be
 * marked accepted while its contract was never created (e.g. the negotiation
 * schema had not been applied yet). Such a proposal holds a hiring slot that no
 * contract can release. This script resets those proposals to 'pending'.
 *
 * Run (dry run, prints what would change):
 *   pnpm exec tsx scripts/repair-orphan-accepted-proposals.ts
 * Apply:
 *   pnpm exec tsx scripts/repair-orphan-accepted-proposals.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Query } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT'];
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID'];
const API_KEY = process.env['APPWRITE_API_KEY'];
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
  process.exit(1);
}

const db = new Databases(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY));
const apply = process.argv.includes('--apply');

async function listAll(collectionId: string, queries: string[]): Promise<Array<Record<string, unknown>>> {
  const docs: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await db.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    docs.push(...(page.documents as unknown as Array<Record<string, unknown>>));
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1]!.$id;
  }
  return docs;
}

async function main(): Promise<void> {
  const accepted = await listAll('proposals', [Query.equal('status', 'accepted')]);
  let orphans = 0;
  for (const proposal of accepted) {
    const id = String(proposal['$id']);
    const contracts = await db.listDocuments(DATABASE_ID, 'contracts', [Query.equal('proposal_id', id), Query.limit(1)]);
    if (contracts.total > 0) continue;
    orphans++;
    console.log(`${apply ? 'Resetting' : 'Would reset'} proposal ${id} (project ${String(proposal['project_id'])}) to pending`);
    if (apply) {
      await db.updateDocument(DATABASE_ID, 'proposals', id, { status: 'pending' });
    }
  }
  console.log(`${orphans} orphaned accepted proposal(s) found${apply ? ' and reset' : ' (dry run; pass --apply to reset)'}.`);
}

main().catch((error: unknown) => {
  console.error('Repair failed', error);
  process.exit(1);
});
