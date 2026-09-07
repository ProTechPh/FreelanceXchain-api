# ADR-006: Redis-backed distributed locking

- **Status:** Accepted
- **Date:** 2026-09-07
- **Related code:**
  - `src/utils/async-lock.ts` (`withLock`, `milestoneLockKey`)
  - `src/services/payment-service.ts` (milestone approve, submit)
  - `src/services/milestone-service.ts` (milestone state transitions)
  - `src/services/dispute-service.ts` (dispute create, resolve)
  - `src/services/escrow-refund-service.ts` (refund create, approve)
  - `src/services/escrow-contract.ts` (escrow operations)
  - `src/services/didit-kyc-service.ts` (KYC webhook, review, manual verification)
  - `src/services/reputation-service.ts` (rating submission)
  - `src/services/contract-service.ts` (contract cancellation)
  - `src/services/proposal-service.ts` (proposal acceptance)
  - `src/services/rush-upgrade-service.ts` (rush fee operations)
  - `src/repositories/user-custom-skill-repository.ts` (suggestion request dedup)

## Context

FreelanceXchain runs as a stateless Node.js service behind a load balancer, with
multiple replicas handling concurrent requests. Payment flows (milestone approve,
submit, refund, dispute) and KYC verification flows have critical sections where
race conditions can cause:

1. **Double-spends:** Two concurrent approvals of the same milestone could both
   read the "pending" state and dispatch blockchain transactions, resulting in
   over-payment or escrow corruption.
2. **Webhook replay:** Didit KYC webhooks can retry; without serialization, the
   same webhook could be processed twice, creating duplicate verification records.
3. **Rating deduplication:** Concurrent rating submissions for the same contract
   could bypass the "one rating per role" check.

A distributed lock abstraction is required to serialize critical sections across
all server instances, not just within a single process.

## Decision

### Core implementation

The `withLock(key, fn)` function in `src/utils/async-lock.ts` implements a
Redis-backed distributed lock with in-process fallback:

1. **Redis distributed lock:** When Redis is healthy (`status === 'ready'`), use
   `SET key token PX ttl NX` to acquire a lock with TTL and ownership token.
2. **Tokenized release:** A Lua script releases the lock only if the stored value
   matches our token, preventing ABA problems where a different process' lock
   is accidentally released.
3. **Automatic TTL refresh:** An interval timer extends the TTL every 10s during
   the critical section, preventing lock expiration while work is in progress.
4. **In-process fallback:** When Redis is unavailable or lock acquisition times
   out, fall back to a per-key promise chain (`localLocks` map). This preserves
   mutual exclusion within a single instance and maintains availability for
   local development, tests, and degraded deployments.

### Lock key patterns

| Flow | Lock key pattern | Granularity | BLF tags |
| --- | --- | --- | --- |
| Milestone approve/reject/dispute | `milestone-approve:{milestoneId}` | Per-milestone, shared across flows | BLF-1.1, BLF-3.1, BLF-3.2, BLF-3.5 |
| Milestone submit | `milestone-submit:{milestoneId}` | Per-milestone submission | — |
| Dispute resolve | `dispute-resolve:{disputeId}` | Per-dispute | — |
| Refund create | `refund-create:{contractId}` | Per-contract | — |
| Refund approve | `refund-approve:{refundId}` | Per-refund-request | BLF-3.2 |
| KYC webhook | `kyc-webhook:{session_id}` | Per-DiDiT session | — |
| KYC review | `kyc-review:{verificationId}` | Per-verification | BLF-12.3 |
| KYC manual | `kyc-manual:{userId}` | Per-user | BLF-12.3 |
| Rating submission | `rating:{contractId}:{raterId}` | Per-contract per-rater | BLF-9.1 |
| Contract cancel | `contract-cancel:{contractId}` | Per-contract | BLF-5.4 |
| Proposal accept | `proposal-accept:project:{projectId}` | Per-project | — |
| Rush upgrade operations | `rush-upgrade:{contractId}` | Per-contract | BLF-6.1 |
| Escrow operations | `escrow:{escrowAddress}` | Per-escrow contract | — |
| Suggestion request | `suggestion-request:{requestId}` | Per-request | — |

### Shared milestone lock (`milestoneLockKey`)

All milestone-mutating operations (approve, dispute, refund) share a single lock
key `milestone-approve:{milestoneId}`. This prevents concurrent approve + dispute
or approve + refund from both committing and moving the same escrow twice. The
lock is acquired in sorted order to avoid deadlocks (BLF-3.5).

### Configuration (overridable via env)

| Env var | Default | Purpose |
| --- | --- | --- |
| `ASYNC_LOCK_TTL_MS` | 30000 | Lock expiration time (ms) |
| `ASYNC_LOCK_ACQUIRE_TIMEOUT_MS` | 10000 | Max time to wait for lock |
| `ASYNC_LOCK_RETRY_INTERVAL_MS` | 30 | Polling interval between retries |
| `ASYNC_LOCK_REFRESH_INTERVAL_MS` | 10000 | TTL refresh interval during hold |

## Consequences

### Benefits

1. **Multi-instance safety:** Critical sections serialize across all server
   replicas, preventing race conditions in payment and KYC flows.
2. **Graceful degradation:** In-process fallback keeps the service operational
   when Redis is down, trading global mutual exclusion for local safety.
3. **No external library dependency:** The implementation uses raw Redis commands
   (`SET NX PX`, Lua script) rather than a third-party library, reducing
   dependency surface area and audit burden.
4. **Automatic TTL refresh:** Long-running operations (e.g., blockchain
   transactions) do not expire the lock midway, avoiding premature release.
5. **Ownership token:** Tokenized release prevents accidental release of another
   process' lock, even under network partitions or clock skew.

### Risks (accepted)

1. **Redis dependency:** In multi-instance deployments, losing Redis removes
   cross-instance mutual exclusion. The in-process fallback is "best effort" —
   concurrent requests to different instances can still race. Mitigated by Redis
   clustering/redundancy in production.
2. **TTL edge cases:** If a process crashes or hangs without releasing the lock,
   the TTL (30s default) acts as a safety net, but the lock holder cannot
   distinguish between "lock expired" and "lock acquired by another." Critical
   sections must be idempotent or fail gracefully on stale lock states.
3. **Not re-entrant:** Calling `withLock` with the same key from inside the
   callback will deadlock (the inner call waits forever for the outer caller's
   lock). Documented in code comments; callers must not nest locks for the same
   key.
4. **Lock acquisition timeout:** If a lock cannot be acquired within 10s, the
   fallback to in-process mode may proceed without cross-instance serialization.
   This trades strictness for availability — blocking indefinitely would be
   worse.
5. **Network partitions:** During a partition, two instances may both decide
   Redis is unavailable and fall back to local locks, removing cross-instance
   mutual exclusion. This is accepted as a availability-over-consistency tradeoff.

## Alternatives considered

1. **Database-level locking (SELECT FOR UPDATE):**
   - Rejected: Requires transaction-scoped DB connections, which does not
     integrate cleanly with Appwrite's document APIs. Adds DB load for what is
     fundamentally a coordination problem, not a data problem.

2. **Optimistic locking (version/timestamp check on write):**
   - Rejected: Requires every critical write to include a conditional update,
     and failed writes must be retried by the caller. Does not protect against
     concurrent blockchain operations that cannot be rolled back once submitted.
     Distributed locks prevent work from starting; optimistic locking detects
     conflicts after work is done — too late for irreversible side effects.

3. **No locking (rely on idempotency):**
   - Rejected: While some flows (KYC webhooks, blockchain transactions) have
     idempotency guards, the complexity of making every critical section fully
     idempotent under concurrent execution is higher than using locks. Locks
     provide a single, well-understood coordination primitive.

4. **Third-party distributed lock library (e.g., redlock):**
   - Rejected: Adds external dependency and complexity. The implementation in
     `async-lock.ts` is ~140 lines and uses only standard Redis commands, which
     are easier to reason about and audit.

## BLF tags

- BLF-1.1: Milestone approval locking
- BLF-3.1: Dispute creation locking
- BLF-3.2: Refund approval locking
- BLF-3.5: Sorted lock acquisition to prevent deadlocks
- BLF-5.4: Contract cancellation locking
- BLF-6.1: Rush upgrade operations locking
- BLF-9.1: Rating submission locking (one per role per contract)
- BLF-12.3: KYC manual verification locking

## Reviewers

_Reviewed by: [placeholder for review]_
