# Data Models

The runtime database is **Appwrite**. The authoritative schema — collections,
attributes, and indexes — lives in `scripts/setup-appwrite-db.ts` and is applied
by re-running it (`npx tsx scripts/setup-appwrite-db.ts`; idempotent). TypeScript
models in `src/models/*` mirror these collections, and `src/repositories/*`
translate between Appwrite documents (snake_case attributes) and application
models (camelCase).

## Collection Inventory

| Collection | Purpose |
| ---------- | ------- |
| `users` | Accounts, role, wallet, suspension/MFA flags |
| `skill_categories` / `skills` | Two-level skill taxonomy for matching |
| `freelancer_profiles` / `employer_profiles` | Role-specific profile data |
| `projects` | Job postings with budget, deadline, milestones, tags |
| `proposals` | Freelancer bids on projects |
| `contracts` / `milestones` | Engagements and milestone breakdowns |
| `reviews` | Post-contract reputation ratings |
| `disputes` / `dispute_evidence` | Conflict resolution and evidence |
| `payments` / `transactions` / `blockchain_transactions` / `blockchain_escrows` | Payments and on-chain records |
| `conversations` / `messages` | Direct messaging |
| `notifications` | In-app notifications |
| `kyc_verifications` | Didit KYC sessions and decisions |
| `email_preferences` / `emails` | Email opt-ins and the email inbox |
| `saved_searches` / `user_custom_skills` / `skill_suggestions` | Matching/search features |
| `favorites` / `portfolio_items` | Social and portfolio features |
| `rush_upgrade_requests` / `refund_requests` | Contract lifecycle features |
| `audit_log_entries` | Admin audit trail |
| `pending_mfa_sessions` | MFA challenge staging |

## Key Model Details

### User (`users`)

| Attribute | Type | Notes |
| --------- | ---- | ----- |
| `email` | string(255) | required |
| `password_hash` | string(255) | default `''` |
| `role` | string(20) | required — `freelancer`, `employer`, `admin` |
| `wallet_address` | string(42) | default `''` |
| `name` | string(255) | default `'User'` |
| `is_suspended` / `suspension_reason` | boolean / string(1000) | admin suspension |
| `mfa_enabled` | boolean | default `false` |

Relationships are expressed by storing the related document ID as a plain string
attribute (Appwrite has no foreign keys); e.g. `freelancer_profiles.user_id`,
`projects.employer_id`, `proposals.freelancer_id`.

### Project (`projects`)

| Attribute | Type | Notes |
| --------- | ---- | ----- |
| `employer_id` | string(36) | required |
| `title` | string(255) | required |
| `description` | string(50000) | default `''` |
| `required_skills` | string(50000) | JSON array, default `'[]'` |
| `budget` | double | default `0` |
| `deadline` | string(30) | required ISO timestamp |
| `is_rush` / `rush_fee_percentage` | boolean / double | rush projects |
| `status` | string(20) | default `'open'` |
| `milestones` | string(100000) | JSON array of milestone stubs |
| `freelancer_limit` | integer | default `1` |
| `tags` / `attachments` | string | JSON arrays |

### Contract (`contracts`) and Milestone (`milestones`)

- `contracts` links `project_id`, `proposal_id`, `freelancer_id`, `employer_id`,
  plus `escrow_address`, `base_amount`, `rush_fee`, `total_amount`, `status`.
- `milestones` belongs to a contract (`contract_id`) and carries `title`,
  `description`, `amount`, `due_date`, workflow timestamps
  (`submitted_at`, `approved_at`, `rejected_at`, `completed_at`),
  `deliverable_files`, `rejection_reason`, `revision_count`, `notes`.

### Review (`reviews`)

Records `contract_id`, `project_id`, `reviewer_id`, `reviewee_id`, `rating`,
`comment`, `reviewer_role`, and the sub-ratings `work_quality`,
`communication`, `professionalism`, `would_work_again`.

### Dispute (`disputes`)

Links `contract_id` + `milestone_id`, with `initiator_id`, `reason`,
`evidence` (JSON array), `status`, and `resolution`. Supporting evidence lives
in `dispute_evidence` (`dispute_id`, `submitted_by`, `evidence_type`,
`file_url`, `description`, `verified_by`, `verified_at`).

### KYC (`kyc_verifications`)

Didit session fields (`didit_session_id`, `didit_session_token`,
`didit_session_url`, `didit_workflow_id`), decision fields (`decision`,
`status`), document data (`document_type`, `document_number`, `first_name`,
`last_name`, `nationality`), verification booleans (`document_verified`,
`liveness_passed`, `face_matched`), and admin fields (`reviewed_by`,
`admin_notes`).

## JSON-encoded Attributes

Appwrite collections are schemaless-ish but attribute-typed; nested structures
are stored as **JSON strings** in large string attributes and parsed in the
service layer. Examples: `freelancer_profiles.skills`/`experience`,
`projects.milestones`/`required_skills`/`attachments`/`tags`,
`disputes.evidence`, `notifications.data`, `portfolio_items.images`/`skills`.

## Conventions

- **IDs**: Appwrite auto-generates document IDs (`$id`); the API surface uses
  them as string IDs. Timestamps come from Appwrite system fields (`$createdAt`,
  `$updatedAt`).
- **Mapper**: `src/utils/entity-mapper.ts` converts snake_case Appwrite
  documents to camelCase application models.
- **Repository pattern**: `src/repositories/base-repository.ts` provides common
  CRUD + pagination; each domain repository adds collection-specific queries via
  the Appwrite `Databases` SDK (see `src/config/appwrite.ts`).

---

[← Back to Architecture](README.md)
