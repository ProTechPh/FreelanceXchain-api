# Appwrite Schema Design

The runtime database is **Appwrite**. The authoritative schema — collections,
attributes, and indexes — is declared in `scripts/setup-appwrite-db.ts` and
applied by re-running it:

```bash
npx tsx scripts/setup-appwrite-db.ts
```

The script is **idempotent**: existing collections, attributes, and indexes are
detected (HTTP 409) and skipped, so it can be re-run after every deploy to apply
any new schema changes. Requirements: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`,
`APPWRITE_API_KEY`; `APPWRITE_DATABASE_ID` defaults to `freelancexchain`.

## Collections

| Collection | Key attributes (beyond `$id`/`$createdAt`/`$updatedAt`) |
| ---------- | --------------------------------------------------------- |
| `users` | `email`, `password_hash`, `role`, `wallet_address`, `name`, `is_suspended`, `suspension_reason`, `mfa_enabled` |
| `skill_categories` | `name`, `description`, `is_active` |
| `skills` | `category_id`, `name`, `description`, `is_active` |
| `freelancer_profiles` | `user_id`, `name`, `nationality`, `bio`, `hourly_rate`, `skills` (JSON), `experience` (JSON), `availability` |
| `employer_profiles` | `user_id`, `name`, `nationality`, `company_name`, `description`, `industry` |
| `projects` | `employer_id`, `title`, `description`, `required_skills` (JSON), `budget`, `deadline`, `is_rush`, `rush_fee_percentage`, `status`, `milestones` (JSON), `freelancer_limit`, `tags`, `attachments` |
| `proposals` | `project_id`, `freelancer_id`, `cover_letter`, `attachments`, `proposed_rate`, `estimated_duration`, `status` |
| `contracts` | `project_id`, `proposal_id`, `freelancer_id`, `employer_id`, `escrow_address`, `base_amount`, `rush_fee`, `total_amount`, `status` |
| `milestones` | `contract_id`, `title`, `description`, `amount`, `due_date`, `status`, `submitted_at`, `approved_at`, `rejected_at`, `completed_at`, `deliverable_files`, `rejection_reason`, `revision_count`, `notes` |
| `reviews` | `contract_id`, `project_id`, `reviewer_id`, `reviewee_id`, `rating`, `comment`, `reviewer_role`, `work_quality`, `communication`, `professionalism`, `would_work_again` |
| `disputes` | `contract_id`, `milestone_id`, `initiator_id`, `reason`, `evidence` (JSON), `status`, `resolution` |
| `dispute_evidence` | `dispute_id`, `submitted_by`, `evidence_type`, `file_url`, `description`, `verified_by`, `verified_at` |
| `payments` | `contract_id`, `milestone_id`, `payer_id`, `payee_id`, `amount`, `currency`, `tx_hash`, `status`, `payment_type` |
| `conversations` | `participant1_id`, `participant2_id`, `last_message_at`, `last_message_preview`, `unread_count_1`, `unread_count_2` |
| `messages` | `conversation_id`, `sender_id`, `receiver_id`, `content`, `is_read`, `attachments` |
| `notifications` | `user_id`, `type`, `title`, `message`, `data` (JSON), `is_read` |
| `kyc_verifications` | `user_id`, `status`, `didit_session_id`, `didit_session_token`, `didit_session_url`, `didit_workflow_id`, `decision`, `document_type`, `document_number`, `first_name`, `last_name`, `nationality`, `document_verified`, `liveness_passed`, `face_matched`, `ip_address`, `metadata`, `reviewed_by`, `admin_notes` |
| `email_preferences` | `user_id`, `proposal_received`, `proposal_accepted`, `milestone_updates`, `payment_notifications`, `dispute_notifications`, `contract_notifications`, `message_notifications`, `review_notifications`, `kyc_notifications`, `marketing_emails`, `weekly_digest` |
| `emails` | `message_id`, `user_id`, `from_address`, `to_address`, `subject`, `text_body`, `html_body`, `attachments`, `is_read`, `is_starred`, `folder`, `in_reply_to`, `references`, `received_at` |
| `saved_searches` | `user_id`, `name`, `search_type`, `filters` (JSON), `notify_on_new`, `last_notified_at` |
| `user_custom_skills` | `user_id`, `name`, `description`, `years_of_experience`, `category_name`, `is_approved`, `suggested_for_global` |
| `skill_suggestions` | `user_id`, `skill_name`, `skill_description`, `category_name`, `suggested_by`, `times_requested`, `requester_ids` (string array), `status` |
| `favorites` | `user_id`, `target_type`, `target_id` |
| `portfolio_items` | `freelancer_id`, `title`, `description`, `project_url`, `images` (JSON), `skills` (JSON), `completed_at` |
| `rush_upgrade_requests` | `contract_id`, `requested_by`, `proposed_percentage`, `counter_percentage`, `status`, `responded_by` |
| `refund_requests` | `contract_id`, `requested_by`, `amount`, `is_partial`, `reason`, `status`, `approved_by`, `rejected_by`, `rejection_reason`, `transaction_hash` |
| `audit_log_entries` | `user_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `payload` (JSON), `ip_address`, `user_agent`, `status`, `error_message` |
| `blockchain_transactions` | `type`, `from_address`, `to_address`, `amount`, `data`, `timestamp`, `status`, `hash`, `block_number`, `gas_used`, `confirm_at` |
| `blockchain_escrows` | `contract_id`, `employer_address`, `freelancer_address`, `total_amount`, `balance`, `deployed_at`, `deployment_tx_hash` |
| `transactions` | `contract_id`, `milestone_id`, `from_user_id`, `to_user_id`, `amount`, `type`, `status`, `transaction_hash`, `metadata` |
| `pending_mfa_sessions` | `access_token`, `refresh_token`, `user_id`, `factor_id`, `expires_at` |
| `user_preferences` | `user_id`, `tour_progress` (JSON) |
| `subscriptions` | `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `plan`, `status`, `current_period_end` |
| `email_delivery_failures` | `message_id`, `from_address`, `to_address`, `subject`, `failure_code`, `failure_message`, `received_at` |
| `blockchain_escrow_milestones` | `escrow_address`, `milestone_id`, `amount`, `status` |
| `blockchain_agreements` | `contract_id_hash`, `terms_hash`, `employer_wallet`, `freelancer_wallet`, `total_amount`, `milestone_count`, `status`, `employer_signed_at`, `freelancer_signed_at`, `created_at_ts`, `transaction_hash`, `block_number` |
| `blockchain_milestones` | `milestone_id_hash`, `contract_id_hash`, `work_hash`, `freelancer_wallet`, `employer_wallet`, `amount`, `status`, `submitted_at`, `completed_at`, `title`, `transaction_hash`, `block_number` |
| `blockchain_dispute_records` | `dispute_id_hash`, `contract_id_hash`, `milestone_id_hash`, `evidence_hash`, `initiator_wallet`, `freelancer_wallet`, `employer_wallet`, `arbiter_wallet`, `amount`, `outcome`, `reasoning`, `created_at_ts`, `resolved_at` |
| `blockchain_ratings` | `contract_id`, `rater_id`, `ratee_id`, `rating`, `comment`, `timestamp`, `transaction_hash` |

## Relationships

Appwrite documents have no foreign-key constraints. Related entities reference
each other by storing the target document ID in a string attribute
(e.g. `projects.employer_id`, `proposals.project_id`, `milestones.contract_id`,
`disputes.contract_id`). Joins are performed in the service/repository layer by
fetching related documents.

## Security Model

Collections are created with default Appwrite permissions:

- **read**: any user (`Permission.read(Role.any())`)
- **create / update / delete**: authenticated users
  (`Permission.create/update/delete(Role.users())`)

Application-level middleware enforces ownership and role-based rules (see
`src/middleware/auth-middleware.ts`). KYC/dispute evidence and audit logs get
additional service-level gating.

## Data Seeding

Skill categories and skills are seeded via the application's skill seed logic
(repositories `src/repositories/skill-category-repository.ts` and
`src/repositories/skill-repository.ts`). The setup script only creates the
schema — it does not seed taxonomy.

## Migrations

There is no migration runner. Schema changes are made by editing the
`COLLECTIONS` / `INDEXES` arrays in `scripts/setup-appwrite-db.ts` and re-running
it. For destructive or constraint-bearing changes (e.g. new unique indexes), the
script's comments note the required pre-steps (such as de-duplicating existing
rows).

---

[← Back to Architecture](README.md)
