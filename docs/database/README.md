# Database & Security

Comprehensive documentation for the FreelanceXchain PostgreSQL database schema, security policies, and related configurations.

## Documentation

- [Indexing Strategy](indexing.md) — Query optimization, foreign key indexes, and performance patterns
- [Database Schema Design](schema.md) — Complete schema documentation with ER diagrams and all table definitions
- [Row Level Security](rls.md) — RLS policy implementation, service role bypass, and Appwrite integration
- [Data Seeding](seeding.md) — Skill taxonomy seeding, UUID stability, and seed script details
- [Security](security.md) — API security, authentication, CSRF protection, RLS details, privacy/KYC compliance, RBAC, and smart contract security

## Quick Reference

| Table | File |
|-------|------|
| Contracts | [schema.md](schema.md#contracts-table) |
| Disputes | [schema.md](schema.md#disputes-table) |
| Employer Profiles | [schema.md](schema.md#employer-profiles-table) |
| Freelancer Profiles | [schema.md](schema.md#freelancer-profiles-table) |
| KYC Verifications | [schema.md](schema.md#kyc-verifications-table) |
| Messages | [schema.md](schema.md#messages-table) |
| Notifications | [schema.md](schema.md#notifications-table) |
| Payments | [schema.md](schema.md#payments-table) |
| Projects | [schema.md](schema.md#projects-table) |
| Proposals | [schema.md](schema.md#proposals-table) |
| Reviews | [schema.md](schema.md#reviews-table) |
| Skill Categories | [schema.md](schema.md#skill-categories-table) |
| Skills | [schema.md](schema.md#skills-table) |
| Users | [schema.md](schema.md#users-table) |

## Security Checklist

- [ ] Review [security overview](security.md)
- [ ] Configure [authentication](security.md#authentication-security) properly
- [ ] Enable [CSRF protection](security.md#csrf-protection-implementation-guide)
- [ ] Set up [database security](security.md#database-security--row-level-security)
- [ ] Implement [RBAC](security.md#role-based-access-control)
- [ ] Review [smart contract security](security.md#smart-contract-security)

[← Back to Documentation Index](../README.md)
