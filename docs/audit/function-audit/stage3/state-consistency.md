# State Consistency Audit -- Cross-Domain Analysis

**Audit Date**: 2026-07-21
**Scope**: All 5 contracts -- FreelanceEscrow, ContractAgreement, MilestoneRegistry, DisputeResolution, FreelanceReputation
**Compiler**: Solidity 0.8.26
**Prior Art**: Stage 1 (state-variable-map, access-control-map, external-call-map), Stage 2 (all 5 domain analyses), Stage 0 (design-decisions)

---

## Table of Contents

1. [Accounting Invariants](#1-accounting-invariants)
2. [Divergent State Tracking](#2-divergent-state-tracking)
3. [Stale State](#3-stale-state)
4. [State Transition Completeness](#4-state-transition-completeness)
5. [Cross-Domain Interaction Map](#5-cross-domain-interaction-map)
6. [Summary Table](#6-summary-table)

---

## 1. Accounting Invariants

### INV-A: `releasedAmount + refundedAmount <= totalAmount` (FreelanceEscrow)

**Invariant**: The sum of released and refunded amounts must never exceed the total escrowed amount.

**Maintained by**:
- `approveMilestone` (L195-201): increments `releasedAmount` by `milestone.amount`, checks `releasedAmount + refundedAmount >= totalAmount` to deactivate
- `resolveDispute` (L249-256): increments `releasedAmount` by `freelancerAmt` and `refundedAmount` by `employerAmt`, same completion check
- `refundMilestone` (L310-317): increments `refundedAmount` by `milestone.amount`, same completion check
- `cancelContract` (L344): computes `remainingFunds = totalAmount - releasedAmount - refundedAmount`

**Can any operation sequence violate it?** No. Each milestone amount can only be counted once because:
- `approveMilestone` requires `Submitted` status (L193) and sets it to `Approved` (L195) -- one-shot
- `resolveDispute` requires `Disputed` status (L242) and sets it to `Approved` (L249) -- one-shot
- `refundMilestone` requires `Pending` status (L308) and sets it to `Refunded` (L310) -- one-shot
- Status transitions are one-way (no function reverts a milestone to an earlier state)

Since each milestone's amount enters the sum exactly once, and the sum of all milestone amounts equals `totalAmount` (constructor L143-156), the invariant holds.

**Verdict**: **PASS** -- The one-shot-per-milestone guarantee ensures the sum cannot exceed `totalAmount`.

---

### INV-B: `releasedAmount` is monotonically non-decreasing (FreelanceEscrow)

**Writers**:
- `approveMilestone` (L197): `releasedAmount += amt`
- `resolveDispute` (L250): `releasedAmount += freelancerAmt`

Both use `+=`. No function decrements `releasedAmount`.

**Verdict**: **PASS**

---

### INV-C: `refundedAmount` is monotonically non-decreasing (FreelanceEscrow)

**Writers**:
- `refundMilestone` (L312): `refundedAmount += amt`
- `resolveDispute` (L251): `refundedAmount += employerAmt`

Both use `+=`. No function decrements `refundedAmount`.

**Verdict**: **PASS**

---

### INV-D: `isActive` is monotonically decreasing (FreelanceEscrow)

**Writer**: Constructor (L141: `true`). Set to `false` by:
- `approveMilestone` (L201)
- `resolveDispute` (L255)
- `refundMilestone` (L316)
- `cancelContract` (L345)

No function ever sets `isActive` back to `true`. The `contractActive` modifier (L115-118) prevents further operations once deactivated.

**Verdict**: **PASS**

---

### INV-E: `sum(pendingWithdrawals) <= address(this).balance` (FreelanceEscrow)

**Crediting**: `resolveDispute` (L260, L265) credits `pendingWithdrawals` for freelancer and employer.

**Debiting**: `withdraw()` (L283) zeroes `pendingWithdrawals[msg.sender]` before transferring ETH (L284).

**Can the sum exceed balance?** No. `resolveDispute` only credits amounts derived from `milestone.amount` (L244-246). The corresponding ETH was deposited in the constructor (L157) and has not left the contract (pull-payment pattern means no ETH is transferred in `resolveDispute`). Direct transfer functions (`approveMilestone`, `refundMilestone`, `cancelContract`) transfer ETH and update accounting simultaneously.

**Sequence verification** (2 milestones, each 1 ETH):
1. Constructor: balance = 2 ETH, totalAmount = 2 ETH
2. Milestone 0 resolved with 50/50 split: pendingWithdrawals[freelancer] = 0.5, pendingWithdrawals[employer] = 0.5. Balance = 2 ETH. Sum = 1 ETH <= 2 ETH.
3. Milestone 1 approved: 1 ETH transferred to freelancer. Balance = 1 ETH. Sum = 1 ETH <= 1 ETH.
4. Both withdraw: balance = 0. Sum = 0.

**Force-sent ETH**: If ETH is force-sent to the contract, `address(this).balance` increases but `pendingWithdrawals` is unaffected. The invariant still holds (balance >= sum).

**Verdict**: **PASS**

---

### INV-F: MilestoneRegistry `completedCount[fl]` == count of Approved milestones for `fl`

**Writers**:
- `approveMilestone` (L122): `completedCount[fl]++` when `Submitted -> Approved`
- `resolveDisputedMilestone` (L152): `completedCount[fl]++` when `Disputed -> Approved`

**Source of truth**: Count of entries in `milestones` mapping where `freelancer == fl` and `status == Approved`.

**Currently safe**: Both paths to `Approved` status increment the counter. No function changes milestone status without updating the counter.

**Fragility**: No admin mechanism exists to repair the counter if a future function adds a new path to `Approved` without incrementing.

**Verdict**: **PASS** (currently safe; fragile to future changes)

---

### INV-G: MilestoneRegistry `totalEarned[fl]` == sum of Approved milestone amounts for `fl`

Same pattern as INV-F. Writers: `approveMilestone` (L124), `resolveDisputedMilestone` (L154).

**Verdict**: **PASS** (same caveat as INV-F)

---

### INV-H: FreelanceReputation `totalScore[ratee]` == sum of all rating scores for `ratee`

**Writer**: `submitRating` (L165): `totalScore[ratee] += score` in `unchecked` block.

**Single writer**: Only `submitRating` modifies this value. No deletions or modifications of existing ratings exist.

**Overflow safety**: Each `score` is `uint8` in [1,5]. `totalScore` is `uint256`. Overflow requires ~2^256/5 ratings, which is physically impossible.

**Verdict**: **PASS**

---

### INV-I: FreelanceReputation `ratingCount[ratee]` == `userRatings[ratee].length`

**Writers** (in `submitRating`):
- L160: `userRatings[ratee].push(ratingIndex)` (increments array length)
- L166: `ratingCount[ratee]++` (increments counter)

Both writes occur in the same function, same transaction, with no external calls between them. They cannot desynchronize unless a future function modifies one without the other.

**Verdict**: **PASS** (currently safe; fragile to future changes)

---

### INV-J: ContractAgreement `status == Signed` implies both signatures present

**Enforced by**: `signAgreement` (L120-122): status is set to `Signed` only when `employerSignedAt > 0 && freelancerSignedAt > 0`.

No other function sets status to `Signed` or modifies the signing timestamps.

**Verdict**: **PASS**

---

### INV-K: `totalAmount` is immutable (FreelanceEscrow)

Set once in constructor (L156). Declared `immutable` (L49). Cannot be modified after deployment.

**Verdict**: **PASS**

---

## 2. Divergent State Tracking

### DIV-A: FreelanceEscrow `milestones[]` vs MilestoneRegistry `milestones{}`

**Description**: FreelanceEscrow tracks payment lifecycle (`Pending -> Submitted -> Approved/Disputed/Refunded`). MilestoneRegistry tracks work verification (`Submitted -> Approved/Rejected/Disputed`). They are loosely coupled via off-chain `contractId`.

**Divergence vectors**:
1. MilestoneRegistry record created without matching FreelanceEscrow milestone (or vice versa)
2. FreelanceEscrow milestone approved but MilestoneRegistry milestone still in Submitted status
3. MilestoneRegistry milestone rejected but FreelanceEscrow milestone still in Pending status

**Impact**: Off-chain systems may show inconsistent milestone data. No on-chain impact because neither contract calls the other for milestone operations.

**Enforcement**: None on-chain. Backend relayer coordinates.

**Design decision match**: Per design-decisions.md Additional Context: "MilestoneRegistry is a parallel record-keeping system; FreelanceEscrow is the source of truth for funds." This loose coupling is intentional.

**Verdict**: **INFO -- DESIGN_DECISION -- Loosely coupled milestone tracking is intentional. FreelanceEscrow is the source of truth for funds; MilestoneRegistry is a parallel work-verification ledger.**

---

### DIV-B: ContractAgreement `status` vs FreelanceEscrow `isActive`

**Description**: ContractAgreement and FreelanceEscrow are independent contracts. ContractAgreement can be marked `Completed` (by owner) while FreelanceEscrow still has pending milestones (`isActive == true`). Conversely, FreelanceEscrow can become inactive (all milestones resolved) while ContractAgreement is still `Signed`.

**Divergence vectors**:
1. Owner marks agreement `Completed` before all escrow milestones are resolved -- ratings become possible before all funds are distributed
2. All escrow milestones resolved but agreement still `Signed` -- ratings blocked until owner calls `completeAgreement`

**Impact**: Vector 1 could allow premature rating submission. Vector 2 delays reputation building.

**Enforcement**: None on-chain. The owner (backend relayer) is expected to call `completeAgreement` only after confirming all milestones are paid, per ContractAgreement NatSpec (L127-133).

**Verdict**: **LOW -- Cross-contract lifecycle coordination relies on backend correctness. No on-chain guard prevents premature `completeAgreement`.**

---

### DIV-C: DisputeResolution outcome vs FreelanceEscrow dispute split

**Description**: DisputeResolution records an outcome (`FreelancerFavor`, `EmployerFavor`, `Split`, `Cancelled`) and an `amount`. FreelanceEscrow splits funds via basis points. These are independent operations coordinated by the backend.

**Divergence vectors**:
1. DisputeResolution says `FreelancerFavor` but FreelanceEscrow resolves with `freelancerBps = 5000` (50/50 split)
2. DisputeResolution records `amount = 2 ETH` but FreelanceEscrow milestone has `amount = 1 ETH`
3. DisputeResolution resolved but FreelanceEscrow milestone still in `Disputed` status (timing gap)

**Impact**: The on-chain dispute record may not accurately reflect how funds were distributed. Off-chain audit trails become unreliable.

**Enforcement**: None on-chain. Backend must pass consistent parameters to both contracts.

**Verdict**: **LOW -- Fund distribution consistency between DisputeResolution records and FreelanceEscrow splits depends on backend parameter consistency.**

---

### DIV-D: FreelanceReputation `ratingCount[user]` vs `userRatings[user].length`

**Description**: `ratingCount` (S22) is a cached counter that duplicates `userRatings[user].length` (S18). Both are updated in `submitRating` (L160 and L166).

**Divergence vectors**: Currently none -- both written in same function, same transaction. Divergence would only occur if a future function modifies one without the other.

**Impact**: If diverged, `getAverageRating` (which uses `ratingCount`) would return an incorrect value while `getUserRatingCount` (which reads `userRatings[].length`) would be correct.

**Enforcement**: Manual synchronization in `submitRating`.

**Verdict**: **INFO -- Cached counter currently synchronized. No admin repair mechanism exists if divergence occurs from future code changes.**

---

### DIV-E: MilestoneRegistry `completedCount` / `totalEarned` vs derivable milestone data

**Description**: Both are cached aggregates derivable from scanning the `milestones` mapping. They exist for O(1) `getFreelancerStats` queries.

**Divergence vectors**: Same as DIV-D -- currently safe, fragile to future changes.

**Impact**: Incorrect freelancer statistics displayed to off-chain consumers.

**Enforcement**: Manual synchronization in `approveMilestone` and `resolveDisputedMilestone`.

**Verdict**: **INFO -- Cached aggregates currently synchronized. No repair mechanism.**

---

### DIV-F: DisputeResolution `disputeStats` won+lost+split vs `userDisputes.length`

**Description**: `userDisputes[user].length` includes all disputes (pending, cancelled, resolved). `disputeStats` only counts resolved non-cancelled disputes.

**Invariant**: `won + lost + split <= userDisputes[user].length`

**By design**: `DisputeOutcome.Cancelled` intentionally does not update stats (L162, design-decisions.md Known Trade-off #4).

**Impact**: Consumers expecting `won + lost + split == total` will see a discrepancy when cancelled or pending disputes exist.

**Verdict**: **INFO -- DESIGN_DECISION -- Cancelled disputes intentionally excluded from stats. `total` includes all disputes; `won + lost + split` counts only resolved non-cancelled.**

---

### DIV-G: ContractAgreement `isFullySigned()` vs `status == Signed`

**Description**: `isFullySigned` (L191-193) checks `employerSignedAt > 0 && freelancerSignedAt > 0` independently of the `status` field. `signAgreement` (L120-122) sets `status = Signed` only when both timestamps are non-zero.

**Can they diverge?** Not with current code. `signAgreement` is the only function that modifies timestamps, and it always sets `status = Signed` when both are non-zero. No other function modifies the status to `Signed`.

**Verdict**: **PASS -- Currently consistent. Divergence possible only from future code changes.**

---

## 3. Stale State

### STALE-A: ContractAgreement `Disputed` status becomes permanently stale

**Trigger**: `disputeAgreement` (ContractAgreement L148-155) sets `status = Disputed`.

**Source of truth updated elsewhere**: DisputeResolution.resolveDispute records the actual outcome (DisputeResolution L142).

**Stale value**: ContractAgreement `status` remains `Disputed` forever -- no function in ContractAgreement transitions `Disputed` to any other state.

**What reads the stale value**:
- `completeAgreement` (L138): requires `status == Signed`, so a Disputed agreement can never be completed
- `FreelanceReputation.submitRating` (L129): requires agreement status `Completed`, so no ratings can ever be submitted for a disputed agreement

**Impact**: **MEDIUM** -- After a dispute is resolved (via DisputeResolution), the ContractAgreement status remains `Disputed`. This means:
1. The agreement can never transition to `Completed`
2. Neither party can submit ratings via FreelanceReputation
3. The freelancer's reputation does not reflect work done under this contract
4. The `userAgreements` index for both parties contains a permanently broken entry

**On-chain recovery**: None. There is no function to transition `Disputed -> Completed` or `Disputed -> Signed` in ContractAgreement. The backend cannot fix this without redeploying.

**Verdict**: **MEDIUM -- ContractAgreement `Disputed` status is a dead end. No resolution path exists within the contract. DisputeResolution outcomes are not propagated back, leaving the agreement permanently stale and blocking reputation ratings.**

---

### STALE-B: MilestoneRegistry `Disputed` status when dispute favors employer

**Trigger**: Backend sets MilestoneRegistry milestone to `Disputed` status externally (not via a MilestoneRegistry function -- there is no `disputeMilestone` in MilestoneRegistry).

**Source of truth updated elsewhere**: DisputeResolution records `EmployerFavor` outcome.

**Stale value**: MilestoneRegistry milestone remains in `Disputed` status. The only path out is `resolveDisputedMilestone` (L138-157), which always transitions to `Approved` and credits the freelancer.

**What reads the stale value**:
- `getMilestone` returns status `Disputed`
- `getFreelancerStats` counts the milestone in `totalMilestones` but not in `completed` or `earned`
- `approveMilestone` (L111): requires `Submitted` status, cannot process a `Disputed` milestone
- `rejectMilestone` (L166): requires `Submitted` status, cannot process a `Disputed` milestone

**Impact**: **MEDIUM** -- When a dispute is resolved in the employer's favor, the MilestoneRegistry has no on-chain path to record that the work was rejected. The milestone stays permanently in `Disputed` status, and the freelancer's stats include it in the total count without categorizing it as completed or rejected. A `Disputed -> Rejected` transition is missing.

**Verdict**: **MEDIUM -- MilestoneRegistry has no `Disputed -> Rejected` path. Employer-favorable dispute outcomes leave milestones permanently in `Disputed` status, creating stale state that inflates `totalMilestones` without proper categorization.**

---

### STALE-C: FreelanceEscrow milestone status during cross-contract coordination delay

**Trigger**: DisputeResolution.resolveDispute records an outcome. FreelanceEscrow.resolveDispute has not yet been called by the arbiter.

**Stale value**: FreelanceEscrow milestone remains in `Disputed` status while the dispute is already resolved in DisputeResolution.

**Impact**: LOW -- This is a transient coordination delay managed by the backend. The `contractActive` modifier still allows `resolveDispute` to be called on the escrow. No permanent inconsistency.

**Verdict**: **INFO -- Transient cross-contract state divergence during backend coordination. Expected and self-correcting.**

---

### STALE-D: DisputeResolution `DisputeRecord.amount` may not match FreelanceEscrow milestone amount

**Trigger**: `createDispute` (DisputeResolution L101) stores an `amount` parameter that is caller-supplied and not cross-validated against FreelanceEscrow.

**Stale value**: If the backend passes a different amount than the actual milestone amount, the dispute record is inaccurate.

**Impact**: LOW -- The `amount` field in DisputeResolution is informational only (the contract does not hold or transfer funds). Actual fund distribution happens in FreelanceEscrow based on milestone amounts. Off-chain consumers relying on DisputeResolution `amount` for analytics would get incorrect data.

**Verdict**: **LOW -- DisputeResolution `amount` is not cross-validated against FreelanceEscrow. Informational field can be inaccurate.**

---

### STALE-E: ContractAgreement `totalAmount` vs FreelanceEscrow `totalAmount`

**Trigger**: Both contracts store a `totalAmount` but they are set independently by the backend.

**Stale value**: If the backend passes different values, the two records diverge.

**Impact**: LOW -- ContractAgreement.totalAmount is informational (the contract does not hold funds). FreelanceEscrow.totalAmount is the source of truth for fund accounting. Off-chain consumers comparing the two may see inconsistency.

**Verdict**: **LOW -- Dual totalAmount tracking with no cross-validation. FreelanceEscrow is the source of truth for funds.**

---

## 4. State Transition Completeness

### FSM-A: FreelanceEscrow MilestoneStatus

**Transitions**:

| From | To | Function | Line | Exists? |
|------|----|----------|------|---------|
| Pending | Submitted | `submitMilestone` | L183 | YES |
| Submitted | Approved | `approveMilestone` | L195 | YES |
| Submitted | Disputed | `disputeMilestone` | L223 | YES |
| Disputed | Approved | `resolveDispute` | L249 | YES |
| Pending | Refunded | `refundMilestone` | L310 | YES |
| Submitted | Refunded | (none) | -- | **NO** (by design) |
| Disputed | Refunded | (none) | -- | **NO** |
| Disputed | Pending | (none) | -- | NO (correct) |
| Approved | (any) | (none) | -- | NO (correct, terminal) |
| Refunded | (any) | (none) | -- | NO (correct, terminal) |

**Stuck state risk**: A milestone in `Submitted` status with an unresponsive employer and unresponsive arbiter is permanently stuck. The freelancer cannot approve their own work, and there is no timeout mechanism. The contract NatSpec (L296-303) explicitly acknowledges this.

**Design decision match**: Per design-decisions.md State Machine Transitions #1: "Pending -> Submitted -> Approved/Disputed/Refunded" and "No Submitted -> Refunded path exists by design."

**Verdict**: **INFO -- DESIGN_DECISION -- Submitted milestones can get stuck if employer and arbiter are both unresponsive. No timeout or escape mechanism. Documented trade-off.**

---

### FSM-B: ContractAgreement AgreementStatus

**Transitions**:

| From | To | Function | Line | Exists? |
|------|----|----------|------|---------|
| (new) | Pending | `createAgreement` | L87 | YES |
| Pending | Signed | `signAgreement` | L121 | YES |
| Pending | Cancelled | `cancelAgreement` | L170 | YES |
| Signed | Completed | `completeAgreement` | L141 | YES |
| Signed | Disputed | `disputeAgreement` | L154 | YES |
| **Disputed** | **Completed** | **(none)** | -- | **NO** |
| **Disputed** | **Signed** | **(none)** | -- | **NO** |
| **Disputed** | **Cancelled** | **(none)** | -- | **NO** |
| Completed | (any) | (none) | -- | NO (correct, terminal) |
| Cancelled | (any) | (none) | -- | NO (correct, terminal) |

**Critical gap**: The `Disputed` status is a **dead end**. Once an agreement enters `Disputed`, it can never transition to any other state. This is the root cause of STALE-A.

**Impact**: **MEDIUM** -- Combined with STALE-A, this means:
1. A disputed agreement can never be completed
2. FreelanceReputation ratings are permanently blocked for that agreement
3. The agreement's `userAgreements` index entry is permanently non-functional

**Possible fixes** (for consideration):
- Add `resolveDisputeAgreement(contractIdHash, newStatus)` restricted to owner, allowing transition from `Disputed` to `Completed` or `Cancelled`
- Allow `completeAgreement` to accept `Disputed` status in addition to `Signed`
- Add a `DisputeResolved -> Completed` transition gated on DisputeResolution confirming the outcome

**Verdict**: **MEDIUM -- `Disputed` status has no exit path. This is the most significant state machine gap in the system. Blocks reputation ratings and creates permanently stale agreement records.**

---

### FSM-C: MilestoneRegistry MilestoneStatus

**Transitions**:

| From | To | Function | Line | Exists? |
|------|----|----------|------|---------|
| (new) | Submitted | `submitMilestone` | L90 | YES |
| Submitted | Approved | `approveMilestone` | L114 | YES |
| Submitted | Rejected | `rejectMilestone` | L169 | YES |
| Submitted | Disputed | (external) | -- | YES (set by backend) |
| Disputed | Approved | `resolveDisputedMilestone` | L144 | YES |
| **Disputed** | **Rejected** | **(none)** | -- | **NO** |
| Rejected | (any) | (none) | -- | NO (correct, terminal) |
| Approved | (any) | (none) | -- | NO (correct, terminal) |

**Gap**: `Disputed -> Rejected` has no path. This is the root cause of STALE-B.

**Impact**: **MEDIUM** -- Employer-favorable dispute outcomes cannot be recorded in MilestoneRegistry. The milestone stays permanently in `Disputed` status.

**Possible fix**: Add `rejectDisputedMilestone(bytes32 milestoneIdHash, string calldata reason)` restricted to owner, transitioning `Disputed -> Rejected` without updating `completedCount` or `totalEarned`.

**Verdict**: **MEDIUM -- `Disputed -> Rejected` transition missing. Employer-favorable dispute outcomes leave milestones in permanent `Disputed` limbo.**

---

### FSM-D: DisputeResolution DisputeOutcome

**Transitions**:

| From | To | Function | Line | Exists? |
|------|----|----------|------|---------|
| (new) | Pending | `createDispute` | L95 | YES |
| Pending | FreelancerFavor | `resolveDispute` | L142 | YES |
| Pending | EmployerFavor | `resolveDispute` | L142 | YES |
| Pending | Split | `resolveDispute` | L142 | YES |
| Pending | Cancelled | `resolveDispute` | L142 | YES |
| (any resolved) | (any) | (none) | -- | NO (correct, terminal) |

**All terminal transitions from `Pending` are covered.** No re-resolution possible (AlreadyResolved check at L139). The state machine is complete.

**Verdict**: **PASS -- Complete state machine. All resolution outcomes are reachable from Pending. Terminal states are properly enforced.**

---

### FSM-E: FreelanceReputation (no state machine)

The only state-changing function is `submitRating`. Ratings are append-only with no lifecycle or transitions. No state machine issues.

**Verdict**: **PASS**

---

## 5. Cross-Domain Interaction Map

### CROSS-A: ContractAgreement dispute blocks FreelanceReputation ratings (STALE-A + FSM-B)

**Flow**:
1. ContractAgreement is in `Signed` status
2. Either party calls `disputeAgreement` -> status becomes `Disputed` (ContractAgreement L154)
3. DisputeResolution records and resolves the dispute
4. ContractAgreement status remains `Disputed` (no resolution path)
5. FreelanceReputation.submitRating checks `status == Completed` (L129) -> reverts
6. Neither party can ever rate the other for this contract

**Severity**: **MEDIUM** -- Permanent reputation data loss for disputed contracts.

---

### CROSS-B: DisputeResolution outcome vs FreelanceEscrow fund split consistency

**Flow**:
1. DisputeResolution.resolveDispute records `FreelancerFavor` outcome with amount X
2. FreelanceEscrow.resolveDispute is called with `freelancerBps` that may not correspond to `FreelancerFavor` (e.g., 5000 BPS = 50/50)
3. The recorded outcome and actual fund distribution are inconsistent

**Enforcement**: None on-chain. Backend must pass consistent parameters.

**Severity**: **LOW** -- Trust assumption on backend parameter consistency.

---

### CROSS-C: MilestoneRegistry status vs FreelanceEscrow milestone status divergence

**Flow**:
1. FreelanceEscrow milestone is in `Submitted` status
2. Backend approves it in FreelanceEscrow via `approveMilestone` -> status becomes `Approved`
3. MilestoneRegistry milestone may still be in `Submitted` status (backend hasn't called `approveMilestone` there)
4. Or: FreelanceEscrow milestone is disputed and resolved, but MilestoneRegistry milestone is still `Disputed`

**Enforcement**: None on-chain. Contracts do not reference each other for milestone status.

**Severity**: **INFO** -- Expected coordination delay. Self-correcting when backend completes both operations.

---

### CROSS-D: ContractAgreement completion timing vs FreelanceEscrow lifecycle

**Flow**:
1. All FreelanceEscrow milestones are resolved (approved/refunded). `isActive = false`.
2. ContractAgreement is still `Signed` (owner hasn't called `completeAgreement` yet)
3. FreelanceReputation.submitRating reverts because status is not `Completed`
4. Or: owner calls `completeAgreement` before all escrow milestones are resolved, enabling premature ratings

**Enforcement**: None on-chain. Owner is trusted to coordinate timing per NatSpec (ContractAgreement L127-133).

**Severity**: **LOW** -- Timing coordination depends on backend. Premature completion could allow ratings before all funds are distributed.

---

### CROSS-E: DisputeResolution dispute creation vs FreelanceEscrow milestone status

**Flow**:
1. A dispute is created in DisputeResolution referencing a `milestoneId`
2. The corresponding FreelanceEscrow milestone may be in `Pending`, `Submitted`, `Disputed`, `Approved`, or `Refunded` status
3. DisputeResolution does not validate that the milestone is in a disputeable state

**Enforcement**: None on-chain. DisputeResolution stores `milestoneId` as an opaque `bytes32` reference.

**Severity**: **LOW** -- Orphaned disputes can reference non-existent or already-resolved milestones.

---

## 6. Summary Table

| # | Severity | Category | Finding | Affected Contracts | Key Lines |
|---|----------|----------|---------|-------------------|-----------|
| 1 | MEDIUM | Stale State + FSM | ContractAgreement `Disputed` status has no exit path; permanently blocks FreelanceReputation ratings | ContractAgreement, FreelanceReputation | CA:148-155, CA:138, FR:129 |
| 2 | MEDIUM | FSM Gap | MilestoneRegistry `Disputed -> Rejected` transition missing; employer-favorable disputes leave milestones in permanent `Disputed` limbo | MilestoneRegistry, DisputeResolution | MR:142, MR:166 |
| 3 | LOW | Divergent State | ContractAgreement status vs FreelanceEscrow lifecycle not synchronized on-chain | ContractAgreement, FreelanceEscrow | CA:141, FE:201 |
| 4 | LOW | Divergent State | DisputeResolution outcome vs FreelanceEscrow BPS split not cross-validated | DisputeResolution, FreelanceEscrow | DR:142, FE:240-246 |
| 5 | LOW | Divergent State | Dual `totalAmount` tracking in ContractAgreement and FreelanceEscrow with no cross-validation | ContractAgreement, FreelanceEscrow | CA:90, FE:156 |
| 6 | LOW | Stale State | DisputeResolution `amount` not cross-validated against FreelanceEscrow milestone amount | DisputeResolution, FreelanceEscrow | DR:101, FE:244 |
| 7 | LOW | Divergent State | FreelanceEscrow milestones vs MilestoneRegistry records loosely coupled; can diverge independently | FreelanceEscrow, MilestoneRegistry | FE:71, MR:48 |
| 8 | INFO | Divergent State | `ratingCount` vs `userRatings[].length` dual tracking; currently synchronized but fragile | FreelanceReputation | FR:160, FR:166 |
| 9 | INFO | Divergent State | `completedCount`/`totalEarned` cached counters; currently synchronized but fragile | MilestoneRegistry | MR:122-124, MR:152-154 |
| 10 | INFO | Divergent State | `disputeStats` won+lost+split != `userDisputes.length` when cancelled disputes exist | DisputeResolution | DR:162, DR:197 |
| 11 | INFO | FSM Gap | FreelanceEscrow `Submitted` milestones can get stuck with no timeout mechanism | FreelanceEscrow | FE:178-185, FE:296-303 |
| 12 | INFO | Stale State | Transient cross-contract state divergence during backend coordination (self-correcting) | All | -- |
| 13 | PASS | Accounting | `releasedAmount + refundedAmount <= totalAmount` -- maintained by one-shot-per-milestone guarantee | FreelanceEscrow | FE:195-201, FE:249-256 |
| 14 | PASS | Accounting | `releasedAmount` and `refundedAmount` monotonically non-decreasing | FreelanceEscrow | FE:197, FE:250-251, FE:312 |
| 15 | PASS | Accounting | `isActive` monotonically decreasing (true -> false, never back) | FreelanceEscrow | FE:141, FE:201, FE:255, FE:316, FE:345 |
| 16 | PASS | Accounting | `sum(pendingWithdrawals) <= address(this).balance` | FreelanceEscrow | FE:260, FE:265, FE:283 |
| 17 | PASS | Accounting | `totalAmount` immutable after construction | FreelanceEscrow | FE:49, FE:156 |
| 18 | PASS | Accounting | `status == Signed` implies both signatures present | ContractAgreement | CA:120-122 |
| 19 | PASS | FSM | DisputeResolution DisputeOutcome -- complete state machine | DisputeResolution | DR:95, DR:142 |
| 20 | PASS | FSM | FreelanceReputation -- no state machine, append-only | FreelanceReputation | FR:149-157 |

---

**Total invariants checked**: 20
**Findings**: 2 MEDIUM, 5 LOW, 4 INFO, 9 PASS

---

## Key Recommendations

1. **[MEDIUM] Add `Disputed -> Completed` transition in ContractAgreement.** Either allow `completeAgreement` to accept `Disputed` status, or add a new `resolveDisputeAgreement` function restricted to owner that transitions from `Disputed` to `Completed`. This unblocks FreelanceReputation ratings for disputed-and-resolved contracts.

2. **[MEDIUM] Add `Disputed -> Rejected` path in MilestoneRegistry.** Add a `rejectDisputedMilestone(bytes32 milestoneIdHash, string calldata reason)` function restricted to owner that transitions `Disputed -> Rejected` without updating `completedCount` or `totalEarned`. This allows employer-favorable dispute outcomes to be recorded.

3. **[LOW] Consider on-chain cross-contract status validation.** When the backend calls `completeAgreement`, it could also verify that FreelanceEscrow is inactive. This would require ContractAgreement to hold a reference to the FreelanceEscrow contract, which is a design trade-off between coupling and safety.

4. **[LOW] Add a timeout mechanism for stuck milestones.** The documented trade-off (no timeout for unresponsive arbiter) is acknowledged but represents a real fund-locking risk. A time-locked escape hatch (e.g., employer can refund after N days if milestone is Submitted with no activity) would mitigate this.
