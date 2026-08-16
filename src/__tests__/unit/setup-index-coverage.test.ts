/**
 * Guards the Appwrite index catalog in scripts/setup-appwrite-db.ts against the
 * query shapes the repositories actually issue. Appwrite fails (or degrades to
 * a scan) any filtered/ordered query without a matching index, so every
 * hot-path filter+order combination must be covered.
 *
 * Each entry is [collection, indexKeyPrefix, required attribute combos] — the
 * test extracts the collection's index definitions from the setup script and
 * asserts each combo exists. The `attrs` arrays are the index-attribute sets
 * the query needs; entries also carry the expected leading attribute for
 * precision.
 */
// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';

const setupScript = readFileSync(resolve(process.cwd(), 'scripts/setup-appwrite-db.ts'), 'utf8');

/** Extract [{ collection, indexes: [{ key, attributes: string[] }] }] from the setup script. */
function extractIndexCatalog(): Array<{ collection: string; indexes: Array<{ key: string; attributes: string[] }> }> {
  const catalog: Array<{ collection: string; indexes: Array<{ key: string; attributes: string[] }> }> = [];
  // eslint-disable-next-line no-regex-spaces -- the two spaces delimit a collection definition
  const collectionRe = /id: '([^']+)',[\s\S]*?name: '([^']+)',([\s\S]*?)\n  \},/g;
  let m: RegExpExecArray | null;
  while ((m = collectionRe.exec(setupScript)) !== null) {
    const body = m[3]!;
    const indexes = [...body.matchAll(/key: '([^']+)',[^]*?attributes: \[([^\]]+)\]/g)].map(x => ({
      key: x[1]!,
      attributes: [...x[2]!.matchAll(/'([^']+)'/g)].map(a => a[1]!),
    }));
    catalog.push({ collection: m[1]!, indexes });
  }
  return catalog;
}

const catalog = extractIndexCatalog();

function indexCoverage(collection: string, attributes: string[]): boolean {
  const col = catalog.find(c => c.collection === collection);
  if (!col) return false;
  return col.indexes.some(idx =>
    attributes.length <= idx.attributes.length &&
    attributes.every((attr, i) => idx.attributes[i] === attr),
  );
}

describe('Appwrite setup index coverage', () => {
  it('covers every collection', () => {
    for (const col of catalog) {
      expect(col.indexes.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['projects', ['status', '$createdAt']],
    ['projects', ['status', 'title']],
    ['projects', ['status', 'budget']],
    ['projects', ['status', 'required_skill_ids']],
    ['projects', ['employer_id']],
    ['proposals', ['project_id', '$createdAt']],
    ['proposals', ['freelancer_id', '$createdAt']],
    ['proposals', ['project_id', 'status']],
    ['proposals', ['project_id', 'freelancer_id']],
    ['contracts', ['freelancer_id', '$createdAt']],
    ['contracts', ['employer_id', '$createdAt']],
    ['contracts', ['project_id', '$createdAt']],
    ['contracts', ['freelancer_id', 'status']],
    ['contracts', ['proposal_id']],
    ['reviews', ['reviewee_id', '$createdAt']],
    ['reviews', ['contract_id', '$createdAt']],
    ['reviews', ['contract_id', 'reviewer_id']],
    ['notifications', ['user_id', 'is_read', '$createdAt']],
    ['messages', ['conversation_id', '$createdAt']],
    ['messages', ['receiver_id', 'is_read']],
    ['conversations', ['participant1_id', 'last_message_at']],
    ['conversations', ['participant2_id', 'last_message_at']],
    ['payments', ['payee_id', 'status']],
    ['payments', ['payer_id', 'status']],
    ['email_preferences', ['weekly_digest']],
    ['favorites', ['user_id', 'target_type', '$createdAt']],
    ['favorites', ['user_id', 'target_type', 'target_id']],
    ['audit_log_entries', ['user_id', '$createdAt']],
    ['blockchain_transactions', ['hash']],
    ['emails', ['user_id', 'folder', 'received_at']],
    ['emails', ['user_id', 'is_read']],
  ])('indexes %s (%s)', (collection, attrs) => {
    expect(indexCoverage(collection, attrs)).toBe(true);
  });
});
