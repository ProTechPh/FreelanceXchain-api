# ADR-007: Saga Orchestrator for Escrow Release and Distributed State Transitions

- **Status:** Accepted
- **Date:** 2026-09-14
- **Related code:**
  - `src/utils/saga-orchestrator.ts` (`SagaOrchestrator`, `SagaStep`, `SagaExecutionResult`)
  - `src/utils/__tests__/saga-orchestrator.test.ts` (Saga orchestrator test suite)
  - `src/services/payment-service.ts` (Escrow milestone release orchestration)
  - `src/utils/async-lock.ts` (Distributed lock integration with saga flows)

---

## Context

FreelanceXchain orchestrates high-stakes financial operations across heterogeneous distributed environments:

1. **Off-Chain Persistence:** Appwrite NoSQL document collections storing project states, milestones, payment records, and dispute records.
2. **On-Chain Contracts:** EVM smart contracts (`FreelanceEscrow.sol`, `MilestoneRegistry.sol`, `ContractAgreement.sol`) managing decentralized funds custody and immutable release triggers.
3. **Ancillary Services:** Notification dispatchers (email delivery), cache layers (Redis caches), and administrative audit loggers (`admin-audit.ts`).

### The Challenge

Distributed atomic transactions across off-chain document databases and on-chain blockchain networks are impossible via traditional Two-Phase Commit (2PC) or standard ACID transaction managers:

- Smart contract execution is asynchronous, irreversible once mined, and subject to gas volatility or EVM reverts.
- Off-chain database updates can fail due to network blips, validation constraints, or server timeouts.
- Without disciplined coordination, a failure in a multi-step release flow leads to dangerous inconsistent states:
  - *Scenario A (Partial Release):* Milestone status marked `released` in Appwrite DB, but the EVM transaction failed or reverted. The freelancer never receives on-chain funds, while the UI displays the milestone as completed.
  - *Scenario B (Phantom Escrow Release):* On-chain smart contract releases funds to the freelancer wallet, but the subsequent Appwrite database write fails. The system database still considers the milestone unreleased or pending, potentially enabling a duplicate release attempt or corrupted escrow reconciliation.
  - *Scenario C (Dirty Intermediate State):* An error occurs midway through a pipeline, leaving milestones in indefinite intermediate or locked states without automated rollback.

Previous implementations relied on nested `try/catch` blocks and ad-hoc rollback functions in service layers. As payment logic evolved to incorporate rush fee handling, dispute reconciliation, distributed locking, and cache invalidation, ad-hoc rollbacks became prone to unhandled edge cases, compensation omissions, and tangled control flow.

---

## Decision

We designed and adopted an explicit **Saga Pattern Orchestrator** (`SagaOrchestrator<TContext>`) with backward compensating actions to manage multi-step distributed operations.

### 1. Core Architecture (`src/utils/saga-orchestrator.ts`)

The orchestrator defines a sequence of forward execution steps paired with reverse compensation handlers:

```typescript
export interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<void>;
  compensate?: (context: TContext, error: unknown) => Promise<void>;
}

export type SagaExecutionResult<TContext> =
  | { success: true; context: TContext }
  | { success: false; failedStep: string; error: unknown; context: TContext };
```

#### Execution Semantics

- **Forward Progression:** Steps execute sequentially in declared order (`addStep()`).
- **Context Sharing:** A typed mutable context object (`TContext`) flows across steps, enabling downstream steps to access results (e.g., transaction hashes, external IDs) computed by upstream steps.
- **Backward Compensation:** If any step fails during `execute`:
  1. The pipeline halts immediate forward progression.
  2. All previously completed steps that registered a `compensate` handler are executed in **strict reverse order** (`[...executedSteps].reverse()`).
  3. Errors thrown during compensation are captured and logged with structured diagnostics without interrupting subsequent compensations.
  4. A detailed failure result is returned containing `failedStep`, the triggering `error`, and current `context`.

---

### 2. Implementation in Escrow Milestone Release (`src/services/payment-service.ts`)

Milestone release orchestration is structured as a clear saga:

```
[Acquire Distributed Lock: milestoneLockKey(milestoneId)]
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │ Step 1: mark-releasing-in-db        │ ◄─── State: "releasing"
  │ Compensation: rollback status to db │
  └──────────────────┬──────────────────┘
                     │ Success
                     ▼
  ┌─────────────────────────────────────┐
  │ Step 2: release-on-blockchain       │ ◄─── EVM Contract Call
  │ (No on-chain compensation possible) │
  └──────────────────┬──────────────────┘
                     │ Success (txHash)
                     ▼
  ┌─────────────────────────────────────┐
  │ Step 3: record-released-in-db       │ ◄─── State: "released", payment record,
  │ Compensation: log critical alert    │      audit trail, invariant reconciliation
  └──────────────────┬──────────────────┘
                     │
                     ▼
[Post-Saga: Cache Invalidation, Email Delivery, Release Lock]
```

#### Step Breakdown

1. **`mark-releasing-in-db`**:
   - *Execute:* Updates the milestone status to `releasing` in the project document. This locks the milestone against concurrent operations even outside Redis locks.
   - *Compensate:* Calls `rollbackReleasingMilestone()`, restoring the previous valid milestone state if downstream steps fail.
2. **`release-on-blockchain`**:
   - *Execute:* Interacts with the `FreelanceEscrow` smart contract via Web3 client. Retrieves transaction receipt and populates `context.transactionHash`.
   - *Failure Path:* If the EVM transaction reverts or fails, the saga aborts and Step 1 compensation immediately restores the database milestone status back to its pre-release state.
3. **`record-released-in-db`**:
   - *Execute:* Atomically updates milestone status to `released`, saves `transactionHash`, writes the financial ledger record (`createPaymentRecord`), and creates an administrative audit trail (`persistAuditEntry`).
   - *Compensate:* Because blockchain funds have already been distributed, compensation here cannot reverse on-chain crypto movement. It logs a critical alert and creates an urgent reconciliation ticket for human/admin intervention (Money-Path Audit alignment, see ADR-004).

---

## Consequences

### Benefits

1. **Deterministic Failure Recovery:** Failed operations systematically roll back off-chain state changes in reverse order, preventing dirty "zombie" states.
2. **Separation of Concerns:** Business steps (DB updates, blockchain RPC calls, audit logging) are cleanly separated into modular, testable units rather than deeply nested conditionals.
3. **Observability:** Every step start, failure, and compensation attempt is emitted via structured logging (`[Saga:MilestoneApprovalRelease]`) with contextual error tracing.
4. **Resilience to Replay & Race Conditions:** Interlocks seamlessly with `withLock` (ADR-006) and the dual-ledger money-path reconciliation (ADR-004).
5. **Zero External Dependencies:** Built as a lightweight, zero-overhead TypeScript utility with comprehensive unit test coverage (`src/utils/__tests__/saga-orchestrator.test.ts`).

### Risks and Mitigations

1. **Non-Reversible Blockchain Transactions:**
   - *Risk:* Once a blockchain transaction is confirmed, it cannot be undone. If Step 3 (database finalization) crashes, on-chain funds have moved but database finalization is incomplete.
   - *Mitigation:* Step 3 operations are designed to be idempotent and resilient. Furthermore, ADR-004 invariant reconciliation scripts detect discrepancies between on-chain contract events and database records.
2. **Compensation Failures:**
   - *Risk:* A network failure during a compensating database call could leave state partially rolled back.
   - *Mitigation:* The orchestrator catches and logs compensation errors without halting other compensations. Secondary reconciliation jobs and manual admin audit workflows act as defense-in-depth.

---

## Alternatives Considered

1. **Two-Phase Commit (2PC) / XA Transactions:**
   - *Rejected:* Ethereum and EVM smart contracts do not support XA or two-phase commit protocols. Smart contract execution is final upon inclusion in a block.
2. **Ad-hoc Try/Catch Rollbacks:**
   - *Rejected:* Error handling becomes deeply nested and unmaintainable as additional actions (notifications, rush fees, audit logs) are introduced. Missed compensation calls frequently introduce state corruption.
3. **Heavyweight Workflow Engines (Temporal, BullMQ Workflows):**
   - *Rejected:* Adding external workflow engines or durable execution daemons introduces significant infrastructure overhead and operational complexity. The lightweight in-process `SagaOrchestrator` fulfills all consistency requirements without extra runtime dependencies.

---

## Related Decisions

- [ADR-002: Partial Escrow Refunds](ADR-002-partial-refunds.md)
- [ADR-004: Money Path Audit & Invariant Tracking](ADR-004-money-path-audit.md)
- [ADR-006: Redis-Backed Distributed Locking](ADR-006-distributed-locking.md)
