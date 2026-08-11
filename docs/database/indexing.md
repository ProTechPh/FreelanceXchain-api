# Indexing Strategy

The runtime database is **Appwrite**. Indexes are declared in the `INDEXES`
array of `scripts/setup-appwrite-db.ts` and created via `db.createIndex(...)`
when the setup script runs. Appwrite maintains indexes automatically per
collection; they exist purely to accelerate queries the application issues
through the `Databases` SDK (`listDocuments`, `getDocument`, etc.).

## Declared Indexes

| Collection | Index key | Attributes | Type |
| ---------- | --------- | ---------- | ---- |
| `reviews` | `unique_contract_reviewer` | `contract_id`, `reviewer_id` | **unique** |
| `user_custom_skills` | `unique_user_skill` | `user_id`, `name` | **unique** |
| `skill_suggestions` | `unique_suggestion_name` | `skill_name` | **unique** |
| `favorites` | `unique_user_target` | `user_id`, `target_type`, `target_id` | **unique** |

## Why These Indexes Exist

All four are **race-condition backstops** for check-then-insert patterns in the
service layer. The application serializes these operations with per-process
locks (see `src/utils/async-lock.ts`), but a lock is not a guarantee across
multiple server instances — the unique index is the global guarantee:

1. **`reviews (contract_id, reviewer_id)`** — backs BLF-9.1 (duplicate-review
   race). Two concurrent reviews of the same contract by the same reviewer
   cannot both insert; the second insert fails at the database.
2. **`user_custom_skills (user_id, name)`** — backs BLF-skill.1 (custom-skill
   anti-spam). Two racing requests cannot both insert the same named skill for
   one user.
3. **`skill_suggestions (skill_name)`** — backs BLF-skill.2 (suggestion-queue
   dedup). Concurrent `suggestForGlobal` calls with the same skill name collapse
   to a single pending row.
4. **`favorites (user_id, target_type, target_id)`** — backs the `addFavorite`
   check-then-insert race so a user cannot favorite the same target twice.

## Appwrite Indexing Notes

- **Unique vs non-unique**: Appwrite creates a unique index when `indexes:
  ['unique']` is passed to `createIndex`. Unique indexes reject duplicate
  values on insert.
- **Deploying on populated collections**: creating a unique index fails if the
  collection already contains duplicates. The setup script comments call out
  the de-duplication pre-step for each index.
- **Idempotency**: `createIndex` throws HTTP 409 when the index already exists;
  `scripts/setup-appwrite-db.ts` logs `⊘` and continues, so re-running is safe.
- **Query planning**: Appwrite indexes serve `Query.equal(...)`,
  `Query.search(...)`, `Query.orderDesc(...)`, and pagination. The four
  declared indexes cover the uniqueness invariants; frequently-queried
  attributes (e.g. `status`) are left to Appwrite's per-collection query
  optimization rather than manual index sprawl.

## Adding an Index

1. Append an entry to `INDEXES` in `scripts/setup-appwrite-db.ts`.
2. Re-run `npx tsx scripts/setup-appwrite-db.ts`.
3. If the index is unique and the collection is populated, de-duplicate first.

---

[← Back to Database docs](../README.md)
