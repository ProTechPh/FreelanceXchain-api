# ADR-004: Money-path audit — closing the DB-vs-ledger divergence class

- **Status:** Accepted
- **Date:** 2026-08-17
- **Related code:**
  - `src/routes/payment-routes.ts` (unified dispute route, `/history`, `/me`)
  - `src/services/dispute-service.ts` (`createDispute`, `recordDisputeResolutionPayments`,
    `updateDisputeStatuses`)
  - `src/services/payment-service.ts` (`initializeContractEscrow`,
    `getContractPaymentHistory`, `getMyPayments`)
  - `src/services/escrow-refund-service.ts` (`approveRefund`)
  - `src/utils/payment-records.ts` (`createPaymentRecord` shared validator)
  - `src/repositories/payment-repository.ts` (`PaymentType`, `findByContractId`,
    `findByUserId`)
  - `src/services/escrow-reconciliation-service.ts` (`reconcileContractPayments`)
  - `src/services/scheduler-service.ts` (hourly reconciliation job)

## Context

ADR-003 (rush fees) exposed a failure class: **DB state diverging from the
escrow ledger or the payments log**. A record in one place asserted a money
movement the other never made (or never logged), with no detection until funds
were stuck. This ADR records a systematic audit of every money path for the
same pattern, the fixes that closed each finding, and the ongoing safety net
added so future divergences are detected instead of silently accumulating.

## Audit findings

| # | Severity | Finding | Root mechanism | Fix |
| --- | --- | --- | --- | --- |
| 1 | 🔴 High | Two live dispute-creation paths; the legacy one never touched the ledger | `/payments/.../dispute` called DB-only `payment-service.disputeMilestone` (marked the milestone disputed in Appwrite but never called `adapter.disputeMilestone`). In real mode `FreelanceEscrow.resolveDispute` reverts with `MilestoneNotDisputed`, so an admin resolution failed and the milestone's funds were stuck. | Unified: the legacy route now calls `dispute-service.createDispute`, which marks the milestone Disputed on-chain. `payment-service.disputeMilestone` was removed. |
| 2 | 🟠 Medium | Dispute resolution moved money with zero payment record | `resolveDispute` disbursed the milestone via the adapter but wrote no record — `PaymentType.'dispute_resolution'` was declared but never used. Split resolutions also lost per-party attribution (the DB milestone is `approved` at the full amount). | `recordDisputeResolutionPayments` writes one record per payee with the resolve tx hash: freelancer_favor → one employer→freelancer record, employer_favor → one freelancer→employer record, split → two records (freelancer gets `round(amount × bps / 10000)` to 2dp, employer gets the remainder). |
| 3 | 🟠 Medium | Refunds moved money with zero payment record | `approveRefund` refunded whole milestones via the adapter and marked them `refunded` in the DB, but `PaymentType.'refund'` was never created. | `approveRefund` writes one `refund` record per refunded milestone (payer = freelancer, payee = employer — the natural inversion of a release). Full refunds share the single `refundEscrow` hash; partial refunds get per-milestone hashes; milestones skipped on idempotent retry are still recorded with a null hash. |
| 4 | 🟡 Low | Escrow funding had no payment record | `PaymentType.'escrow_deposit'` was declared but never created — funding was invisible in the payments log. | `initializeContractEscrow` writes an `escrow_deposit` record (payer = employer, payee = freelancer, amount = contract total) after deploy. In simulated mode the deposit receipt hash is preferred; in real mode the deploy tx itself carries the value. |
| 5 | 🟡 Low | Agreement registry diverged on dispute completion | The approval path completes the on-chain agreement registry best-effort, but the dispute-resolution completion path marked the contract `completed` in the DB without completing the registry. | `updateDisputeStatuses` now calls `completeAgreement` best-effort (mirrors the approval path) when a resolution leaves every milestone settled. |
| 6 | 🟡 Low | Payments log was unreadable | Records existed but no endpoint surfaced them, so the log could not be reviewed or reconciled. | `GET /api/payments/contracts/:contractId/history` (contract parties/admin) and `GET /api/payments/me` (payer-or-payee across all contracts, paginated), backed by `paymentRepository.findByContractId` / `findByUserId`. |

## Decision

All six findings were fixed, and every ledger money movement now writes a
durable payment record through the shared `createPaymentRecord` validator
(`src/utils/payment-records.ts`), so all `PaymentType` members — `escrow_deposit`,
`milestone_release`, `refund`, `dispute_resolution`, `rush_fee` — are actually
written today. Record writes are **best-effort by design**: a failed write logs
loudly but never fails the money movement (the funds already moved on-chain),
which is why finding 6's read surface matters — the log is now the reconcilable
audit trail.

To keep it that way, an **hourly read-only reconciliation job**
(`escrow-reconciliation-service.ts`, registered in `scheduler-service.ts`)
compares, for every escrowed contract:

- **Ledger vs DB read model** — escrow total vs contract total, escrow balance
  conservation, per-milestone amount (exact wei) and status mapping
  (ledger `released` ⟺ DB `approved`, `refunded` ⟺ `refunded`, pending must not
  be settled).
- **DB read model vs payments log** — `escrow_deposit` presence/amount,
  per-milestone release/refund record coverage, and the settled-total invariant
  (Σ approved + refunded ≈ Σ release + refund + dispute_resolution records).

Divergences are reported via structured `error`/`warn` logs (critical findings
at error level, trace gaps at warn level) plus a summary with counts — the
codebase's established alert channel — so a downstream pager/webhook can
consume them.

## Consequences

- The DB read model, the escrow ledger, and the payments log can no longer
  diverge silently: the dispute path, refunds, deposits, and dispute
  resolutions all move money and record it in one place.
- **Record semantics worth knowing:** `milestone_release` amounts are stored as
  wei-as-Number (from `readEscrowRecordedAmount`), while every other record type
  stores ETH units; the reconciliation job normalizes with a 1e12 threshold.
  `dispute_resolution` legs are rounded to 2dp, so the settled-total check uses
  a 0.05 tolerance.
- The reconciliation job is read-only and only covers contracts with a deployed
  escrow; a pending contract with a folded rush fee is not checked until its
  escrow exists.
- Residual risk carried from ADR-003: the direct rush-fee transfer (option B)
  sits outside the escrow and is not dispute-protected, and the platform wallet
  fronts the fee in real mode.
- `getTotalEarnings` / `getTotalSpent` (payment-repository) sum completed
  records by payer/payee and are surfaced as `totalEarnings` / `totalSpent` on
  the `/payments/me` response (ETH units; `milestone_release` amounts stored as
  wei are normalized via the shared `toEthUnits` helper). The defined
  semantics: every type that moves money between parties counts — releases,
  refunds, dispute-resolution legs, rush fees — and `escrow_deposit` is
  excluded (the funding trace is not received/spent money, and its disposition
  is already captured by the other legs). A totals query failure returns `null`
  (not `0`) so a client can show "unavailable" instead of a misleading zero.

## Related ADRs

- [ADR-003: Rush fees on escrowed contracts](ADR-003-rush-fees-escrow.md) — the
  investigation that triggered this audit.
