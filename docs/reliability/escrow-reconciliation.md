# Escrow Reconciliation Runbook

- **Owner:** Platform/backend lead (same role as the [SLO error-budget owner](slo.md))
- **Last reviewed:** 2026-08-17
- **Related code:** `src/services/escrow-reconciliation-service.ts`,
  `src/services/scheduler-service.ts`

The hourly **escrow reconciliation job** (`reconcileContractPayments`, cron
`0 * * * *`) is a read-only safety net that detects divergences between the
three sources of truth for money movement:

1. the **escrow ledger** (`blockchain_escrows` + `blockchain_escrow_milestones`),
2. the **DB read model** (contract `total_amount`, project milestone amounts and
   statuses), and
3. the **payments log** (`payments` collection — every record written by a money
   path, see [ADR-004](../architecture/adr/ADR-004-money-path-audit.md)).

The job never writes state. Divergences are reported as structured logs:
**critical** findings at `error` level, **trace gaps** at `warn` level, plus a
summary line `Escrow reconciliation found N issue(s) across M contract(s)` with
a `criticalCount`. Wire the `error` logs to your paging channel; the `warn`
logs are triage material, not pages.

## What the job checks

For every contract with a deployed escrow (enumerated from the escrow registry):

| Surface | Check | Codes |
| --- | --- | --- |
| Ledger vs read model | escrow total == contract total (exact wei) | `TOTAL_MISMATCH` |
| Ledger vs read model | balance + settled amounts == escrow total (conservation) | `BALANCE_MISMATCH` |
| Ledger vs read model | milestone set matches both ways; amounts match (exact wei); status mapping: ledger `released` ⟺ DB `approved`, `refunded` ⟺ `refunded`, ledger-pending must not be settled in the DB | `MILESTONE_MISSING_IN_DB`, `MILESTONE_MISSING_IN_ESCROW`, `MILESTONE_AMOUNT_MISMATCH`, `MILESTONE_STATUS_MISMATCH` |
| Read model vs payments log | `escrow_deposit` record exists and matches the contract total (tolerance 0.01) | `DEPOSIT_MISSING`, `DEPOSIT_AMOUNT_MISMATCH` |
| Read model vs payments log | every approved milestone has a release/dispute record; every refunded milestone has a refund/dispute record | `RELEASE_RECORD_MISSING`, `REFUND_RECORD_MISSING` |
| Read model vs payments log | Σ(approved + refunded) ≈ Σ(release + refund + dispute_resolution) records (tolerance 0.05; `milestone_release` amounts are stored as wei-as-Number and normalized) | `SETTLED_TOTAL_MISMATCH` |

A failed payments-log fetch (`PAYMENTS_FETCH_FAILED`) is reported once and the
record-level checks are skipped for that contract, so one failed read does not
cascade into false alerts.

## Issue reference

### Critical — page the on-call

| Code | Meaning | Likely cause | Operator response |
| --- | --- | --- | --- |
| `ESCROW_STATE_MISSING` | An address in the escrow registry has no ledger state | Ledger record deleted/corrupted, or a deployment that registered the address but never saved state | Check the escrow record for the contract; verify whether funds were ever deployed. Re-run the deployment if the contract shows funded but the ledger is gone. |
| `CONTRACT_MISSING` | A ledger record references a contract that does not exist | Contract deleted, or a ledger row written with a bad `contract_id` | Find the orphaned ledger row, identify the contract (by employer/freelancer address), restore it or archive the escrow. |
| `PROJECT_MISSING` | The contract has no project | Contract created without a project, or project deleted | Restore the project from backup; the milestone read model lives on the project. |
| `TOTAL_MISMATCH` | Escrow total ≠ contract `total_amount` | `total_amount` changed after deploy, or the escrow was deployed with wrong amounts (e.g. rush-fee fold defect) | Compare the values in the log; contract total is the source of truth for display — do **not** change escrow amounts post-deploy (the contract bakes them). Investigate how the total changed; the escrow cannot be resized, so a re-deploy or refund may be required. |
| `BALANCE_MISMATCH` | balance + settled ≠ total | Ledger update lost/raced (the ledger is serialized per-escrow, so this implies corruption or manual edit) | Treat as ledger corruption: audit the escrow's transaction log, repair the ledger state from the tx trail, and confirm against the contract (real mode) or payment records. |
| `MILESTONE_MISSING_IN_DB` | A ledger milestone does not exist in the project | Milestone deleted after deploy, or the escrow was deployed with a milestone the project never had | Add the milestone back to the project (matching id and amount) or refund/close the orphaned escrow milestone. |
| `MILESTONE_AMOUNT_MISMATCH` | Ledger milestone amount ≠ project milestone amount (exact wei) | The rush-fee fold scaled escrow amounts at deploy but the read-model persist failed (best-effort); or a milestone amount was edited in the DB | Verify the escrow amount is what was funded (check the deposit and tx log); update the project milestone to the scaled amount (this is the read model following the ledger, not the reverse). |
| `MILESTONE_STATUS_MISMATCH` | Ledger released/refunded does not match DB approved/refunded (or ledger-pending but DB settled) | A settled milestone whose DB update failed, or a DB "approved" that never moved money (the ADR-003 failure class) | **Highest priority.** Determine which side is true: if the ledger moved money, fix the DB milestone to match (approved/refunded) so the read model follows the ledger. If the DB says settled but the ledger is pending, no money moved — roll the DB milestone back to `submitted`/`pending`. |
| `SETTLED_TOTAL_MISMATCH` | Σ settled milestones in the DB ≠ Σ settled payment records | A release/refund/dispute record missing or mis-recorded (wrong amount, split rounding outside tolerance, wei/ETH unit mistake) | Diff the per-milestone records against the milestone amounts (the payments log is the audit trail). Repair the record — a missing record should be backfilled with the tx hash from the ledger. |

### Warning — triage in business hours

| Code | Meaning | Likely cause | Operator response |
| --- | --- | --- | --- |
| `MILESTONE_MISSING_IN_ESCROW` | A project milestone has no ledger milestone | Milestone added to the project after the escrow was deployed (the escrow cannot cover it) | Confirm the milestone was never funded; escrow-less milestones settle outside the ledger by design. If it should be escrowed, re-deploy or refund. |
| `DEPOSIT_MISSING` | A funded contract has no `escrow_deposit` record | Contract funded before the payments-log feature shipped (legacy), or the best-effort record write failed | Backfill the deposit record (amount = contract total, tx hash from the escrow record) — the log should match the ledger. |
| `DEPOSIT_AMOUNT_MISMATCH` | Deposit record amount ≠ contract total | `total_amount` changed after funding, or a bad record write | Correct the record amount to the funded total (what the escrow actually holds). |
| `RELEASE_RECORD_MISSING` / `REFUND_RECORD_MISSING` | A settled milestone has no money-movement record | Record write failed after the funds moved (best-effort), or the milestone was settled before the feature shipped | Backfill from the ledger/escrow tx hash so every settled milestone has a trace. |
| `PAYMENTS_FETCH_FAILED` | The payments query failed for one contract; record checks skipped | Appwrite hiccup or a bad index | Confirm Appwrite health; the next hourly run will re-check. No action unless it repeats. |

## Known benign patterns (do not chase)

- **Legacy contracts** funded before the payments-log feature shipped will show
  `DEPOSIT_MISSING` (and possibly `RELEASE_RECORD_MISSING` /
  `REFUND_RECORD_MISSING`) until backfilled. Triage them in batches.
- **Split dispute resolutions** round each leg to 2dp, so a `SETTLED_TOTAL_MISMATCH`
  within ±0.05 of the milestone amount is expected — the tolerance already
  absorbs this; a finding beyond it is real.
- **Direct rush-fee transfers** (ADR-003 option B) settle outside the escrow and
  are excluded from the settled-total comparison by design.

## Verifying a fix

1. Apply the DB/record repair (the job is read-only — fixes are manual or via
   the normal service flows).
2. Wait for the next hourly tick, or trigger a run manually by invoking
   `reconcileContractPayments()` (e.g. `tsx -e` against the built service).
3. Confirm the issue no longer appears in the logs and that the summary line
   shows a reduced or zero count.

## When the job itself fails

- `Failed to run escrow reconciliation job` — the registry scan failed
  (Appwrite outage). The whole run is skipped; no alerts are emitted for that
  run. Investigate Appwrite health; the next tick retries automatically.
- `Failed to reconcile escrow contract against ledger` (per contract) — one
  contract errored (e.g. ledger read failure). The rest of the run continues;
  investigate the specific contract.
- The job is registered in `initializeScheduler()`; if the scheduler is not
  running (check the `Scheduler service initialized successfully` startup log),
  no reconciliation happens and **no issue will be reported** — treat missing
  daily summary logs as a scheduler-down signal.

---

[Back to Reliability & SLO](slo.md)
