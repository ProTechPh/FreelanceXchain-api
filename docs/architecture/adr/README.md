# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records (ADRs) for the FreelanceXchain API and smart contract platform.

ADRs document significant architectural decisions, capturing the **context**, **decisions**, **alternatives considered**, and **consequences** (both benefits and accepted trade-offs).

---

## Index of Decisions

| ID | Title | Status | Date | Primary Scope |
|---|---|---|---|---|
| [ADR-001](ADR-001-token-sessions.md) | [Token Sessions & Authentication](ADR-001-token-sessions.md) | **Accepted** | 2026-08-16 | Appwrite JWT session strategy & token lifecycle |
| [ADR-002](ADR-002-partial-refunds.md) | [Partial Escrow Refunds](ADR-002-partial-refunds.md) | **Accepted** | 2026-08-16 | Milestone cancellation & dispute-settled refund logic |
| [ADR-003](ADR-003-rush-fees-escrow.md) | [Rush Fees & Escrow Splitting](ADR-003-rush-fees-escrow.md) | **Accepted** | 2026-08-17 | Premium milestone turnaround pricing & escrow isolation |
| [ADR-004](ADR-004-money-path-audit.md) | [Money Path Audit & Invariant Tracking](ADR-004-money-path-audit.md) | **Accepted** | 2026-08-17 | Dual-ledger reconciliation between Appwrite & EVM contracts |
| [ADR-005](ADR-005-protocol-monetization-tiered-kyc.md) | [Protocol Monetization & Tiered KYC](ADR-005-protocol-monetization-tiered-kyc.md) | **Accepted** | 2026-09-06 | Didit KYC tiers, fee schedules, and withdrawal limits |
| [ADR-006](ADR-006-distributed-locking.md) | [Redis-Backed Distributed Locking](ADR-006-distributed-locking.md) | **Accepted** | 2026-09-12 | Race-condition mitigation across replicated Node.js instances |
| [ADR-007](ADR-007-saga-orchestrator-escrow-release.md) | [Saga Orchestrator for Escrow Release](ADR-007-saga-orchestrator-escrow-release.md) | **Accepted** | 2026-09-14 | Distributed state transitions and compensation rollbacks |

---

## ADR Lifecycle

```
PROPOSED ──────► ACCEPTED ──────► (SUPERSEDED by ADR-xxx)
                     │
                     └──────────► (DEPRECATED)
```

- **Immutable History:** Never delete historical ADRs. If a previous architectural direction changes or is replaced, author a new ADR that explicitly marks the former ADR as superseded.
- **Sequential Numbering:** Use sequential IDs: `ADR-001-...`, `ADR-002-...`, etc.

---

## When to Write an ADR

Author an ADR whenever a technical decision:

- Introduces or changes an integration between off-chain and on-chain systems.
- Selects or changes a core dependency, framework, or architectural pattern (e.g. distributed locking, saga orchestrators).
- Changes security posture, authentication, or KYC models.
- Changes financial flows, money paths, or escrow handling.
- Would be costly or complex to reverse in the future.
