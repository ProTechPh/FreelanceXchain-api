# ADR-003: Rush fees on escrowed contracts (funding & settlement)

- **Status:** Accepted (the initial A+C decision was later superseded by B for
  active contracts, and extended to fold-at-deploy for pending contracts)
- **Date:** 2026-08-17
- **Related code:**
  - `src/services/rush-upgrade-service.ts` (`requestRushUpgrade`,
    `applyAcceptedRushFee`, `transferRushFee`)
  - `src/services/payment-service.ts` (`buildEscrowMilestones`,
    `initializeContractEscrow`)
  - `src/services/proposal-service.ts` (`acceptProposal`)
  - `src/utils/milestone-amounts.ts` (`rescaleMilestoneAmounts`)
  - `src/repositories/payment-repository.ts` (`PaymentType`)

## Context

The `FreelanceEscrow` contract bakes fixed amounts at deploy: it is deployed
and funded with milestone amounts derived from the project milestones, and
releases pay exactly those amounts. A **rush fee** (a percentage of the base
amount paid by the employer for priority) can enter the system two ways:

1. **Initial rush** — a proposal accepted on a project flagged `is_rush`; the
   fee is set at contract creation.
2. **Rush upgrade** — a post-creation negotiation (request → accept /
   counter-offer) on an existing contract.

Both paths originally shipped broken:

- **F2 — initial rush could never fund an escrow.** At proposal acceptance the
  contract total was `base + fee` while the project milestones still held base
  amounts. `validateEscrowAmounts` (escrow milestone sum must equal the
  contract total) failed with `AMOUNT_MISMATCH`, so the escrow was never
  deployed and the contract stayed `pending` forever (the proposal flow
  swallowed the failure; the fund route returned 400).
- **F1 — the upgrade-path fee was not real money.** Accepting an upgrade
  recorded `rush_fee`, bumped `total_amount`, and rescaled the DB milestone
  amounts, but the already-deployed escrow still held base amounts. The fee
  had no funding and no release mechanism — it existed only as DB bookkeeping
  while releases kept paying base, so the DB read model diverged from the
  ledger.

## Options considered

| Option | Mechanism | Fixes | Tradeoff |
| --- | --- | --- | --- |
| A | Fold the fee into escrow milestone amounts at deploy (scale by total/base) | F2 | Makes the fee real for initial rush; DB milestones must be scaled consistently or the read model diverges the other way |
| B | Pay the fee as a direct wallet-to-wallet transfer at accept | F1 | Fee becomes real but sits outside escrow (no dispute protection); needs a simulated counterpart |
| C | Disable the upgrade path (reject with a clear error) | F1 | Honest stopgap; loses the feature until funded |
| D | Re-deploy a fresh escrow with new amounts on upgrade | F1 | Employer funds the delta; two-escrow state, heavy |

## Decision (history)

### 1. A + C (initial fix)

- **A — fold the fee into escrow amounts.** The fee is folded into the escrow
  at deploy whenever the DB milestones still hold base amounts
  (`buildEscrowMilestones` scales by `total/base` and
  `initializeContractEscrow` persists the scaled amounts so the read model
  matches the ledger). Rush proposals additionally scale the project
  milestones at contract creation (`acceptProposal`), which is the root F2 fix
  and keeps agreement terms, escrow, and read model consistent from day one.
- **C — reject upgrades once an escrow is deployed.** An escrow is deployed
  and funded with base amounts; nothing in the platform can change what it
  holds. Layering a fee on afterwards leaves it with no funding and no release
  path — the F1 defect. The only honest options were B (direct payment) or D
  (re-deploy), so until B shipped, fail-closed rejection
  (`ESCROW_EXISTS`, HTTP 409) was the correct stopgap.

### 2. B supersedes C — direct transfer for active contracts

The fee is paid as a direct wallet-to-wallet transfer at accept, outside the
escrow:

- **Real mode:** `sendTransaction(freelancer.wallet, fee)` from the platform
  wallet — the same trust model as escrow funding, where the platform wallet
  funds escrows on the employer's behalf.
- **Simulated mode:** a `sim-rush-fee-*` hash is generated and the payment
  record is the ledger.
- **Both modes:** a durable payment record (`payment_type: 'rush_fee'`) with
  payer, payee, amount, and tx hash is written as the queryable counterpart.

`total_amount` stays at base and milestones are never rescaled — the escrow
still holds (and releases) base amounts. Upgrades are re-enabled on active
contracts. Money moves before any state is written: a failed transfer leaves
the request `pending` and applies nothing to the contract.

### 3. Pending (escrow-less) contracts fold at deploy

`requestRushUpgrade` now accepts `pending` contracts. At accept time the
settlement mechanism is chosen under the per-contract lock by escrow presence:

- **No escrow yet → fold:** `total_amount` is bumped to `base + fee`;
  milestones stay base. When the employer later funds, `buildEscrowMilestones`
  scales the escrow to `base + fee`, funds it fee-inclusive, and persists the
  scaled milestones. No transfer and no payment record — the escrow deposit is
  the money movement.
- **Escrow deployed → direct transfer** (step 2).

The milestone-progress guard (no accept after any milestone is submitted,
approved, refunded, disputed, or releasing) is enforced under the lock before
any money moves in both modes.

## Consequences

### Benefits

- The fee is real money in every path: funded inside the escrow (initial rush,
  pending-contract fold) or transferred directly (active-contract upgrade).
- F2 is eliminated: rush proposals activate and fund.
- The read model stays consistent with the ledger: milestone sums equal the
  contract total after deploy, and releases/payment records match.
- Fail-closed ordering: TOCTOU milestone checks run before money moves, and a
  failed transfer leaves the request pending and retryable.

### Risks (accepted)

1. **The direct-path fee is not dispute-protected.** It sits outside the
   escrow by design. If dispute protection is ever required, revisit D or a
   platform-held fee vault.
2. **Real mode fronts the fee from the platform wallet.** Same funding
   expectation as escrow deployment — the employer must have funded the
   platform wallet.
3. **Fold path is transiently inconsistent between accept and fund.** The
   contract total includes the fee while milestones still display base
   amounts; this self-heals at deploy.
4. **Residual fund/accept race.** The fund route and the accept path do not
   share the per-contract lock; an escrow deployed between accept's read and
   write could leave the escrow at base while the total includes the fee. The
   window is narrow; closing it would mean lock-coordinating the fund route.

## Alternatives rejected

- **D (re-deploy a fresh escrow on upgrade)** — rejected: two-escrow state and
  employer re-funding of the delta is heavy complexity for marginal benefit
  over B.
- **B alone without A** — rejected: fixes F1 but not F2; initial rush still
  could not deploy.

## Verification

Covered by the jest suite (rush-upgrade, proposal, and payment service tests,
including simulated/real transfer, fold-at-deploy, and no-double-scale cases),
`tsc --noEmit`, `eslint`, and the coverage gate (lines 99.5%, branches 98%).
