# ADR-002: Milestone-granular (partial) escrow refunds (BLF-3.6)

- **Status:** Accepted
- **Date:** 2026-08-11
- **Related code:**
  - `src/services/escrow-refund-service.ts` (`approveRefund`)
  - `src/services/blockchain/adapter.ts` (`IBlockchainAdapter.refundMilestone`)
  - `src/services/blockchain/real-adapter.ts`, `src/services/blockchain/simulated-adapter.ts`
  - `src/services/escrow-blockchain.ts` (`refundMilestone`), `src/services/escrow-contract.ts` (`refundMilestone`)
  - `contracts/FreelanceEscrow.sol` (`refundMilestone`, `cancelContract`)

## Context

FreelanceXchain funds contracts through a deployed `FreelanceEscrow` contract
that holds the full contract value. Refund requests (`refund_requests`
collection) let either party ask the other to return money from the escrow.

Before BLF-3.6, approving a refund settled the **entire** remaining escrow:
the service called `refundEscrow` (on-chain `cancelContract`), marked every
not-yet-settled milestone `refunded`, and cancelled the contract. There was no
way to refund part of a partially-completed contract while keeping the rest of
the work going — e.g. refunding two of five milestones after the employer is
dissatisfied with a subset of deliverables.

The on-chain contract already supports per-milestone refunds: `refundMilestone`
transfers a single **Pending** milestone's amount back to the employer and
auto-deactivates the contract only when `released + refunded >= totalAmount`.

## Decision

- A refund request whose `is_partial` flag is `true` **and** whose `amount` is
  positive is settled **milestone-granular**: pending milestones are refunded
  in order until the cumulative refunded amount covers the requested amount,
  via the per-milestone `adapter.refundMilestone(escrow, index)` call.
- A request with `is_partial == false` (the default, i.e. "refund everything")
  keeps the previous whole-escrow behavior: `adapter.refundEscrow(escrow)`
  (on-chain `cancelContract`), refunding all remaining funds in one atomic
  transaction.
- **Whole milestones are always refunded.** The requested amount is a floor,
  not an exact amount: if it does not align to a milestone boundary, the actual
  refunded amount exceeds the request (the contract cannot split a milestone).
- **The contract is cancelled only when every refundable milestone is
  refunded** (`refundTargets.length === pendingMilestones.length`). A partial
  refund leaves the contract `active` so the remaining milestones can still be
  worked on, submitted, approved, and paid out.
- **Refunds are all-or-nothing per attempt.** The DB approval is written first
  and rolled back to `pending` if any on-chain call fails, keeping the DB
  consistent with the ledger.

## The retry-safety fix (idempotent partial refunds)

A naive loop would refund each target by calling `refundMilestone` directly.
That is **not** retry-safe: if a first attempt refunds milestone 1 on-chain and
then fails on milestone 2, the DB approval is rolled back to `pending` — but
milestone 1 is now `Refunded` in the ledger while the DB still lists it as a
`pending` target. A retry would call `refundMilestone` on the already-refunded
milestone, which reverts with `MilestoneNotPending` on-chain (or throws
"Milestone already refunded" in the simulated ledger) — permanently wedging
the refund and leaving DB/ledger state diverged.

To make retries safe, the partial loop pre-checks each target's on-chain status
via `adapter.getMilestone()`:

| On-chain status | Behavior |
| --- | --- |
| `Refunded` | **Skip** — already settled by a previous attempt; still marked `refunded` in the DB because it *is* refunded on-chain |
| `Pending` | Refund via `adapter.refundMilestone` |
| `Submitted` / `Approved` / `Disputed` | **Fail closed** — genuine DB/ledger inconsistency; do not silently skip |

The full-refund path needs no equivalent guard: real `cancelContract` is atomic
(revert ⇒ nothing happened) and the simulated `refundEscrow` re-filters
`pending` milestones on each call, so retries self-heal.

## Concurrency

- Approvals serialize per refund request (`refund-approve:{refundId}` lock) and
  per milestone (`milestone-approve:{id}` locks, acquired in sorted order,
  BLF-3.5) — a refund cannot interleave with an in-flight approve/dispute SAGA.
- Milestones in `releasing` (approve SAGA in flight) are excluded from refund
  targets but still locked, so a refund waits for the SAGA to settle.
- Refunds are refused while any milestone is `disputed` (BLF-3.4): contested
  escrow is settled by dispute resolution, never by a refund.

## Consequences

### Benefits

- Partial refunds support real business flows (returning money for a subset of
  deliverables) without killing the contract.
- DB/ledger state stays consistent on retry, and genuine inconsistencies fail
  closed rather than being silently skipped.
- No contract changes required — `refundMilestone` already existed on-chain.

### Risks (accepted)

1. **Over-refund beyond the request:** whole-milestone granularity means the
   refunded amount may exceed the requested amount at a milestone boundary.
   Acceptable — the contract cannot refund partial milestones.
2. **Requested-amount validation is at request time:** `createRefundRequest`
   caps `amount` at the remaining escrow (total minus approved releases).
   Between request and approval, milestones may be released, so the approval
   recomputes targets from the fresh pending set; any shortfall is covered by
   whole-milestone over-refund semantics above.
3. **Index alignment invariant:** DB milestone array index must equal the
   on-chain milestone array index (the escrow is deployed from the same
   milestone order). The project milestone array is never reordered after
   contract creation.
4. **Per-milestone on-chain read:** each partial-refund target incurs an
   extra `getMilestone` call before its `refundMilestone` transaction (one
   additional read per target in real mode). Reads are cheap relative to the
   refund transactions; the cost buys deterministic retry-safety.
5. **`Submitted` fail-closed branch is currently defensive:** the API never
   calls the escrow's `submitMilestone` (it is `onlyFreelancer`, so only a
   client-side call from the freelancer's wallet can reach it), so on-chain
   milestones stay `Pending` in the standard API flow. The fail-closed branch
   exists to catch direct-client submissions or ledger/DB divergence rather
   than a state the API itself produces.

## Alternatives considered

- **Exact-amount refunds by splitting milestones on-chain** — rejected: would
  require a new contract function and introduces rounding/accounting
  complexity for no current business need.
- **Refund to a single milestone only** (limit the partial refund to one
  milestone) — rejected: `amount` is expressed in currency, and the requester
  has no reason to know milestone boundaries; the in-order cumulative approach
  refunds the fewest milestones that cover the request.
- **String-matching "already refunded" errors for idempotency** — rejected:
  error text matching is fragile across adapters; the explicit
  `getMilestone` status check is deterministic and fails closed.

## Reviewers

Code review (2026-08-11): the idempotent-retry pre-check and the
`refundsAllPending` cancellation logic were validated against
`FreelanceEscrow.sol` semantics; behavior confirmed by unit tests in
`src/__tests__/unit/escrow-refund-service.test.ts`.
