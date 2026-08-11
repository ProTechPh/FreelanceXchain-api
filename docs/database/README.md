# Database & Security

Comprehensive documentation for the FreelanceXchain Appwrite schema, security policies, and related configurations.

> The runtime database is **Appwrite**. The authoritative schema lives in `scripts/setup-appwrite-db.ts` (idempotent, re-run to apply).

## Documentation

- [Indexing Strategy](indexing.md) — Appwrite indexes (unique constraints backing race-condition fixes)
- [Security](security.md) — API security, authentication, CSRF protection, access control, privacy/KYC compliance, RBAC, and smart contract security

## Quick Reference

The authoritative collection/attribute reference is the [Appwrite Schema Design](../architecture/database-schema.md) page. All 31 collections are defined there; key ones include `users`, `skill_categories`, `skills`, `freelancer_profiles`, `employer_profiles`, `projects`, `proposals`, `contracts`, `milestones`, `reviews`, `disputes`, `dispute_evidence`, `payments`, `conversations`, `messages`, `notifications`, `kyc_verifications`, `email_preferences`, `audit_log_entries`, `blockchain_transactions`, `blockchain_escrows`, `transactions`, `favorites`, `portfolio_items`, `saved_searches`, `user_custom_skills`, `skill_suggestions`, `rush_upgrade_requests`, `refund_requests`, `emails`, `pending_mfa_sessions`.

## Security Checklist

- [ ] Review [security overview](security.md)
- [ ] Configure [authentication](security.md#authentication-security) properly
- [ ] Enable [CSRF protection](security.md#csrf-protection)
- [ ] Set up [database security](security.md#database-security--access-control)
- [ ] Implement [RBAC](security.md#role-based-access-control)
- [ ] Review [smart contract security](security.md#smart-contract-security)

[← Back to Documentation Index](../README.md)
