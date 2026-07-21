# Stage 3: Adversarial Sequence Modeling -- Solidity Security Audit

**Audit Date:** 2026-07-21
**Contracts analyzed:** 5 (FreelanceEscrow, ContractAgreement, MilestoneRegistry, DisputeResolution, FreelanceReputation)
**Sequences modeled:** 6
**Findings:** 7 (1 HIGH, 3 MEDIUM, 2 LOW, 1 INFO)

---

## Table of Contents

1. [Candidate Sequences](#candidate-sequences)
2. [Exploit Traces (Step-by-Step)](#exploit-traces-step-by-step)
3. [Capability and Preconditions Matrix](#capability-and-preconditions-matrix)
4. [Missed-by-Isolated-Review Notes](#missed-by-isolated-review-notes)
5. [Summary of Findings](#summary-of-findings)

---

## Candidate Sequences

Six candidate adversarial sequences were identified across the five contracts. Each sequence models an end-to-end attack path with ordered transactions, state deltas, and invariant violations.

| ID | Sequence Name | Contracts Involved | Severity |
|----|--------------|--------------------|----------|
| SEQ-1 | Owner Key Compromise: Full Reputation Fabrication | ContractAgreement, MilestoneRegistry, FreelanceReputation, DisputeResolution | HIGH |
| SEQ-2 | Cross-Contract Lifecycle Desync: Premature Rating via Early Agreement Completion | ContractAgreement, FreelanceEscrow, FreelanceReputation | MEDIUM |
| SEQ-3 | Employer Griefing: Infinite Fund Lockout via Dispute Stall | FreelanceEscrow | MEDIUM |
| SEQ-4 | Dispute Stats Manipulation via Owner-Created Fabricated Disputes | DisputeResolution | MEDIUM |
| SEQ-5 | Owner Reputation Washing: Cancelling Negative Outcomes | DisputeResolution | LOW |
| SEQ-6 | Platform Front-Run: Employer Proxy Approving Before Freelancer Disputes | FreelanceEscrow | LOW |

---

## Exploit Traces (Step-by-Step)

---

### SEQ-1: Owner Key Compromise -- Full Reputation Fabrication

**Description:** If the owner (backend relayer) key is compromised, the attacker gains the ability to create fake agreements, fabricate milestone histories, submit fraudulent ratings, and manipulate dispute statistics -- all without any on-chain detection mechanism. This is a single-point-of-failure that affects the entire protocol's integrity.

**Preconditions:**
- Attacker has compromised the `owner` private key for ContractAgreement, MilestoneRegistry, and DisputeResolution (all use the same deployer address as owner)
- Attacker controls at least two addresses: one as fake "freelancer" (`FL`), one as fake "employer" (`EM`)

**Ordered Steps:**

**Tx1: Create fake agreement**
- Caller: `owner` (compromised)
- Target: `ContractAgreement.createAgreement(fakeContractIdHash, termsHash, EM, FL, 1 ether, 1)`
- State delta:
  - `agreements[fakeContractIdHash]` = new Agreement struct with `employer=EM, freelancer=FL, status=Pending, totalAmount=1 ether`
  - `userAgreements[EM].length` += 1
  - `userAgreements[FL].length` += 1
- Evidence: `ContractAgreement.sol` L78 (`msg.sender != owner` check passes for compromised owner), L84-94 (struct creation)

**Tx2: Sign agreement (EM signs)**
- Caller: `EM`
- Target: `ContractAgreement.signAgreement(fakeContractIdHash)`
- State delta:
  - `agreements[fakeContractIdHash].employerSignedAt` = block.timestamp
- Evidence: `ContractAgreement.sol` L111-113

**Tx3: Sign agreement (FL signs)**
- Caller: `FL`
- Target: `ContractAgreement.signAgreement(fakeContractIdHash)`
- State delta:
  - `agreements[fakeContractIdHash].freelancerSignedAt` = block.timestamp
  - `agreements[fakeContractIdHash].status` = `Signed`
- Evidence: `ContractAgreement.sol` L114-122

**Tx4: Complete agreement (no actual work done)**
- Caller: `owner` (compromised)
- Target: `ContractAgreement.completeAgreement(fakeContractIdHash)`
- State delta:
  - `agreements[fakeContractIdHash].status` = `Completed`
- Evidence: `ContractAgreement.sol` L135-141. Owner bypasses all guards. No verification that actual milestones were paid.

**Tx5: Submit fake milestone in MilestoneRegistry**
- Caller: `owner` (compromised)
- Target: `MilestoneRegistry.submitMilestone(fakeMilestoneId, fakeContractId, workHash, FL, EM, 5 ether, "Fake work")`
- State delta:
  - `milestones[fakeMilestoneId]` = new MilestoneRecord with `freelancer=FL, employer=EM, amount=5 ether, status=Submitted`
  - `freelancerMilestones[FL].length` += 1
- Evidence: `MilestoneRegistry.sol` L84 (owner can submit with arbitrary freelancer/employer), L86-96

**Tx6: Approve fake milestone**
- Caller: `owner` (compromised)
- Target: `MilestoneRegistry.approveMilestone(fakeMilestoneId)`
- State delta:
  - `milestones[fakeMilestoneId].status` = `Approved`
  - `milestones[fakeMilestoneId].completedAt` = block.timestamp
  - `completedCount[FL]` += 1
  - `totalEarned[FL]` += 5 ether
- Evidence: `MilestoneRegistry.sol` L112 (owner can approve), L114-124

**Tx7: Submit rating (EM rates FL as 5 stars)**
- Caller: `EM`
- Target: `FreelanceReputation.submitRating(FL, 5, "Excellent work!", fakeContractIdHash)`
- State delta:
  - `ratings[]` += new Rating(rater=EM, score=5, isEmployerRating=true, ratee=FL)
  - `userRatings[FL].length` += 1
  - `givenRatings[EM].length` += 1
  - `ratingExists[key]` = true
  - `totalScore[FL]` += 5
  - `ratingCount[FL]` += 1
- Evidence: `FreelanceReputation.sol` L129 (status == Completed passes because Tx4 set it), L130 (EM is employer), L131 (FL is freelancer)

**Tx8: Submit rating (FL rates EM as 5 stars)**
- Caller: `FL`
- Target: `FreelanceReputation.submitRating(EM, 5, "Great employer!", fakeContractIdHash)`
- State delta: Symmetric to Tx7 but with `ratee=EM`
- Evidence: `FreelanceReputation.sol` L129-131

**Tx9: Repeat Tx1-Tx8 with N different fake contract IDs**
- Effect: `completedCount[FL]` = N, `totalEarned[FL]` = N * 5 ether, `ratingCount[FL]` = N, `getAverageRating(FL)` = 500 (5.00 stars)

**Violated Invariant:** FreelanceReputation's implicit invariant that ratings reflect real work completed in real agreements. The `completedCount`, `totalEarned`, and rating aggregates in MilestoneRegistry and FreelanceReputation are no longer meaningful signals of actual work quality.

**Concrete Impact:** FL now appears as a top-rated freelancer with perfect 5.00 rating, N completed milestones, and N * 5 ether in earnings -- all fabricated. Employers relying on on-chain reputation will be misled into hiring FL for real work. This is an oracle corruption attack on the reputation system.

**Severity:** HIGH

**DESIGN_DECISION note:** The owner's full trust level is documented in the design decisions (access control model #3, #5, #6, #7). This sequence confirms that the documented trust assumption is the single point of failure. The attack path exists BECAUSE the design decisions grant the owner unchecked power across all three administrative contracts.

---

### SEQ-2: Cross-Contract Lifecycle Desync -- Premature Rating via Early Agreement Completion

**Description:** The `ContractAgreement.completeAgreement` function is owner-only and requires `Signed` status, but it does NOT verify that the corresponding `FreelanceEscrow` has actually released all milestone funds. This allows the owner to mark an agreement as `Completed` while the escrow still holds unclaimed funds, enabling premature rating submission.

**Preconditions:**
- A legitimate escrow contract `ESC` has been deployed with milestone amounts
- Both parties have signed the `ContractAgreement`
- The escrow has at least one milestone still in `Pending` or `Submitted` status (funds not yet fully released)
- The owner (backend relayer) calls `completeAgreement` prematurely (bug or intentional)

**Ordered Steps:**

**Tx1: Create and fund escrow**
- Caller: `Employer`
- Target: `FreelanceEscrow` constructor with `milestoneAmounts = [2 ether, 3 ether]`, `msg.value = 5 ether`
- State delta:
  - `ESC.isActive` = true
  - `ESC.totalAmount` = 5 ether
  - `ESC.releasedAmount` = 0
  - `ESC.refundedAmount` = 0
  - `address(ESC).balance` = 5 ether
- Evidence: `FreelanceEscrow.sol` L120-172

**Tx2: Create agreement (owner)**
- Caller: `owner`
- Target: `ContractAgreement.createAgreement(contractIdHash, termsHash, Employer, Freelancer, 5 ether, 2)`
- State delta: Agreement created with `status=Pending`
- Evidence: `ContractAgreement.sol` L70-100

**Tx3: Both parties sign**
- Caller: `Employer` then `Freelancer`
- Target: `ContractAgreement.signAgreement(contractIdHash)` (x2)
- State delta: `status` = `Signed`, both timestamps set
- Evidence: `ContractAgreement.sol` L105-125

**Tx4: Freelancer submits milestone 0**
- Caller: `Freelancer`
- Target: `FreelanceEscrow.submitMilestone(0)`
- State delta: `milestones[0].status` = `Submitted`
- Evidence: `FreelanceEscrow.sol` L178-185

**Tx5: Owner prematurely completes agreement**
- Caller: `owner`
- Target: `ContractAgreement.completeAgreement(contractIdHash)`
- State delta:
  - `agreements[contractIdHash].status` = `Completed`
- Evidence: `ContractAgreement.sol` L135-142. Owner-only check passes. Only checks `status == Signed`, does NOT cross-reference `FreelanceEscrow.isActive` or `FreelanceEscrow.releasedAmount`.
- **Key gap:** ContractAgreement and FreelanceEscrow have NO on-chain linkage (state variable map INV-2: "Enforcement: None on-chain")

**Tx6: Either party submits rating prematurely**
- Caller: `Employer`
- Target: `FreelanceReputation.submitRating(Freelancer, 1, "Poor quality", contractIdHash)`
- State delta:
  - `ratings[]` += new Rating
  - `totalScore[Freelancer]` += 1
  - `ratingCount[Freelancer]` += 1
- Evidence: `FreelanceEscrow.sol` L129 (status == Completed passes because Tx5 set it). The escrow still has 5 ether locked and milestone 0 is only Submitted (not approved). The freelancer has received zero payment.

**Violated Invariant:** The implicit protocol invariant that `ContractAgreement.status == Completed` implies all escrow milestones have been resolved and funds distributed. The cross-contract invariant INV-2 from the state variable map ("A ContractAgreement with status == Completed should have FreelanceEscrow.isActive == false") is violated.

**Concrete Impact:** The freelancer receives a 1-star rating for work that has not yet been paid for. If the employer subsequently approves the milestone, the freelancer may have already been unfairly rated. If the employer disputes and wins, the rating is retroactively justified but the timeline is corrupted. More critically, an employer could use this to rate the freelancer before the freelancer has even finished all work, creating information asymmetry.

**Severity:** MEDIUM

**DESIGN_DECISION note:** The separation between ContractAgreement and FreelanceEscrow is documented as intentional (state variable map INV-2, design decisions "DisputeResolution records outcomes; FreelanceEscrow handles actual fund distribution"). The risk here contradicts the implied invariant that completion means all payments are settled.

---

### SEQ-3: Employer Griefing -- Infinite Fund Lockout via Dispute Stall

**Description:** An employer submits work, the freelancer submits a milestone, and the employer disputes it. If the arbiter is unresponsive (colluding with employer, compromised, or simply offline), the freelancer's funds are locked indefinitely with no escape hatch.

**Preconditions:**
- Escrow `ESC` is active with milestone 0 containing 5 ether
- Milestone 0 is in `Submitted` status
- Arbiter address is controlled by or colluding with the employer (or is simply unresponsive)

**Ordered Steps:**

**Tx1: Freelancer submits milestone 0**
- Caller: `Freelancer`
- Target: `FreelanceEscrow.submitMilestone(0)`
- State delta: `milestones[0].status` = `Submitted`
- Evidence: `FreelanceEscrow.sol` L178-185

**Tx2: Employer disputes milestone 0**
- Caller: `Employer`
- Target: `FreelanceEscrow.disputeMilestone(0)`
- State delta: `milestones[0].status` = `Disputed`
- Evidence: `FreelanceEscrow.sol` L218-225

**Tx3: Arbiter never calls resolveDispute (permanent stall)**
- Effect: Milestone 0 is stuck in `Disputed` status indefinitely.
- Evidence: `FreelanceEscrow.sol` L238 -- `resolveDispute` requires `onlyArbiter`. If arbiter does not call, no resolution occurs.

**Tx4: Employer cannot cancel (blocked by Disputed milestone)**
- Target: `FreelanceEscrow.cancelContract()` would revert
- Evidence: `FreelanceEscrow.sol` L337-338: `if (s == MilestoneStatus.Disputed) revert CannotCancelSubmittedOrDisputed()`

**Tx5: Employer cannot refund (milestone is not Pending)**
- Target: `FreelanceEscrow.refundMilestone(0)` would revert
- Evidence: `FreelanceEscrow.sol` L308: `if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending()`

**Result:** The contract remains active (`isActive == true`) but no actions can be taken on milestone 0. The 5 ether is permanently locked. If this is the only milestone, the entire escrow balance is locked.

**State delta (final):**
- `ESC.isActive` = true (never deactivated)
- `ESC.releasedAmount` = 0
- `ESC.refundedAmount` = 0
- `milestones[0].status` = Disputed
- `address(ESC).balance` = 5 ether (locked permanently)

**Violated Invariant:** The implicit invariant that escrow funds are eventually distributable to either party. The documented trade-off (design decisions known trade-off #1, FreelanceEscrow NatSpec L298-303) acknowledges this gap but does not mitigate it.

**Concrete Impact:** The employer can grief the freelancer by locking their earned funds indefinitely. If the employer and arbiter collude, the employer effectively steals the freelancer's work (which was submitted but never paid) while keeping the funds locked. The freelancer has no on-chain recourse.

**Severity:** MEDIUM

**DESIGN_DECISION note:** This MATCHES the documented known trade-off: "No timeout or emergency escape for unresponsive arbiter" (design decisions known trade-off #1, FreelanceEscrow NatSpec L298-303). The NatSpec explicitly acknowledges this and suggests a future upgrade. This finding confirms the severity of the documented gap: it is not merely theoretical but is an exploitable griefing vector.

---

### SEQ-4: Dispute Stats Manipulation via Owner-Created Fabricated Disputes

**Description:** The owner can create disputes attributed to any party pair, resolve them with any outcome, and thereby manipulate the `disputeStats` mapping. This corrupts the on-chain dispute history for targeted addresses.

**Preconditions:**
- Attacker has compromised the `owner` key for DisputeResolution
- Target: inflate `disputeStats[FL].won` and inflate `disputeStats[Target].lost`

**Ordered Steps:**

**Tx1: Create dispute on behalf of FL (owner fabricates)**
- Caller: `owner` (compromised)
- Target: `DisputeResolution.createDispute(disputeId, contractId, milestoneId, FL, FL, Target, 1 ether)`
- State delta:
  - `disputes[disputeId]` = new DisputeRecord with `initiator=FL, freelancer=FL, employer=Target, outcome=Pending`
  - `userDisputes[FL].length` += 1
  - `userDisputes[Target].length` += 1
- Evidence: `DisputeResolution.sol` L88 (`msg.sender == owner` bypasses initiator check), L89 (`initiator == freelancer` passes)

**Tx2: Resolve dispute in FL's favor**
- Caller: `owner` (compromised)
- Target: `DisputeResolution.resolveDispute(disputeId, FreelancerFavor, "Fabricated reasoning", owner_address)`
- State delta:
  - `disputes[disputeId].outcome` = `FreelancerFavor`
  - `disputes[disputeId].arbiter` = `owner_address` (arbitrary, L144)
  - `disputeStats[FL].won` += 1
  - `disputeStats[Target].lost` += 1
- Evidence: `DisputeResolution.sol` L135 (`msg.sender == owner`), L144 (arbiter is caller-supplied), L152-154 (stats update)

**Tx3: Repeat Tx1-Tx2 N times with different dispute IDs**
- Effect: `disputeStats[FL].won` = N, `disputeStats[Target].lost` = N

**Violated Invariant:** DisputeStats should reflect real disputes between real parties over real work. The `won + lost + split` counters are no longer meaningful signals.

**Concrete Impact:** FL appears to have won N disputes, building a false track record of successful dispute resolutions. Target appears to have lost N disputes, appearing untrustworthy. Off-chain systems relying on `getUserDisputeStats` will display corrupted data.

**Severity:** MEDIUM

**DESIGN_DECISION note:** This MATCHES the documented trust assumption (design decisions access control model #4: "Dispute resolution restricted to owner only"). The owner's unchecked power to create and resolve disputes with arbitrary parameters is the enabling condition.

---

### SEQ-5: Owner Reputation Washing -- Cancelling Negative Outcomes

**Description:** The owner can resolve disputes as `Cancelled`, which intentionally does NOT update win/loss stats. This allows the owner to selectively erase negative dispute outcomes from a user's record by resolving unfavorable disputes as Cancelled instead of the correct outcome.

**Preconditions:**
- Owner key is compromised
- Target user `FL` has a dispute with outcome `EmployerFavor` (FL lost)
- The dispute has NOT yet been resolved (still `Pending`)

**Ordered Steps:**

**Tx1: Resolve dispute as Cancelled instead of EmployerFavor**
- Caller: `owner` (compromised)
- Target: `DisputeResolution.resolveDispute(disputeId, Cancelled, "Dispute cancelled", arbiter_addr)`
- State delta:
  - `disputes[disputeId].outcome` = `Cancelled`
  - `disputeStats[FL].lost` = 0 (NOT incremented -- design decision known trade-off #4)
  - `disputeStats[Employer].won` = 0 (NOT incremented)
- Evidence: `DisputeResolution.sol` L161-163 (Cancelled branch has no stat updates, by design)

**Violated Invariant:** The invariant that `disputeStats` accurately reflects the outcome of all resolved disputes. Cancelled outcomes are silently excluded from stats.

**Concrete Impact:** FL's dispute loss is erased from their on-chain statistics. An employer examining `getUserDisputeStats(FL)` sees zero losses, even though FL actually lost a dispute. This is reputation washing through selective stat manipulation.

**Severity:** LOW

**DESIGN_DECISION note:** This directly exploits the documented design decision: "DisputeOutcome.Cancelled intentionally does NOT update win/loss stats" (design decisions known trade-off #4). The design choice creates a blind spot that the owner can exploit for selective reputation management.

---

### SEQ-6: Platform Front-Run -- Employer Proxy Approving Before Freelancer Disputes

**Description:** The `platform` wallet (which has full employer powers via `onlyEmployer`) can monitor the mempool for `disputeMilestone` transactions and front-run them by calling `approveMilestone` first, releasing funds before the dispute can be filed.

**Preconditions:**
- Freelancer has submitted a milestone (status = `Submitted`)
- Freelancer broadcasts a `disputeMilestone` transaction to the mempool
- Platform wallet has mempool visibility and can send transactions with higher gas

**Ordered Steps:**

**Tx1 (pending in mempool): Freelancer disputes milestone 0**
- Caller: `Freelancer`
- Target: `FreelanceEscrow.disputeMilestone(0)`
- Expected state delta: `milestones[0].status` = `Disputed`
- Evidence: `FreelanceEscrow.sol` L218-225

**Tx2 (mined first via higher gas): Platform approves milestone 0**
- Caller: `platform`
- Target: `FreelanceEscrow.approveMilestone(0)`
- State delta:
  - `milestones[0].status` = `Approved`
  - `releasedAmount` += `milestones[0].amount`
  - `freelancer.call{value: milestones[0].amount}` (funds transferred)
- Evidence: `FreelanceEscrow.sol` L190 (`onlyEmployer` includes platform via L95), L195-206

**Tx3 (mined second, reverts): Freelancer dispute fails**
- Effect: `disputeMilestone` reverts with `MilestoneNotSubmitted()` because status is now `Approved`
- Evidence: `FreelanceEscrow.sol` L221: `if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted()`

**State delta (final):**
- `milestones[0].status` = `Approved`
- `releasedAmount` += milestone amount
- Freelancer received funds but lost the ability to dispute

**Violated Invariant:** The freelancer's right to dispute a submitted milestone before it is approved. The `onlyParties` modifier on `disputeMilestone` (L218) and `onlyEmployer` on `approveMilestone` (L190) create a race condition where the employer-side can preempt the freelancer's dispute.

**Concrete Impact:** The freelancer loses the ability to dispute work they consider incomplete. While the freelancer receives funds (which may seem favorable), the dispute mechanism -- the freelancer's primary recourse against low-quality work -- is nullified. In a scenario where the employer later claims the work was substandard and demands a refund or leaves a bad rating, the freelancer has no on-chain dispute record to point to.

**Severity:** LOW

**DESIGN_DECISION note:** This is an inherent consequence of the design where both `approveMilestone` and `disputeMilestone` operate on the same `Submitted` status with no ordering guarantee. The platform's full employer powers (design decision access control model #2) enable this front-running. No documented decision addresses the approve-vs-dispute race condition.

---

## Capability and Preconditions Matrix

| Sequence | Unprivileged User | Owner Key Compromise | Platform Key Compromise | Arbiter Collusion | Mempool Visibility | Flash Liquidity |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|
| SEQ-1 | | REQUIRED | | | | |
| SEQ-2 | | REQUIRED (or bug) | | | | |
| SEQ-3 | | | | REQUIRED | | |
| SEQ-4 | | REQUIRED | | | | |
| SEQ-5 | | REQUIRED | | | | |
| SEQ-6 | | | REQUIRED | | REQUIRED | |

**Detailed Capability Requirements:**

| Capability | Sequences | Acquisition Difficulty |
|-----------|-----------|----------------------|
| Owner private key | SEQ-1, SEQ-2, SEQ-4, SEQ-5 | HIGH -- requires compromising the backend relayer server. Single point of failure for 3 of 5 contracts. |
| Platform private key | SEQ-6 | MEDIUM -- requires compromising the platform server wallet. Only relevant for FreelanceEscrow. |
| Arbiter collusion | SEQ-3 | LOW-MEDIUM -- requires the arbiter (set at escrow construction) to be unresponsive or colluding. The employer chooses the arbiter at deploy time. |
| Mempool visibility | SEQ-6 | LOW -- public mempool on most chains. MEV bots routinely monitor for pending transactions. |

---

## Missed-by-Isolated-Review Notes

### 1. SEQ-1 (Owner Reputation Fabrication) would be missed by isolated domain review

**Why:** Each contract's Stage 2 audit correctly identifies the owner's power within that contract:
- `domain-contract-lifecycle.md`: "Owner can mark any agreement complete without actual payment verification"
- `domain-milestone-tracking.md`: "Owner can supply arbitrary freelancer and employer addresses"
- `domain-dispute-handling.md`: "Owner can set arbitrary arbiter address"
- `domain-reputation-ratings.md`: No owner role, so no finding

However, none of these audits model the composition of these powers into a single end-to-end attack. The cross-contract sequence (create agreement -> complete -> submit milestone -> approve -> rate) is only visible when all five contracts are analyzed together. The reputation contract's reliance on ContractAgreement's status field is the critical link, and this dependency is only exploitable when combined with the owner's unchecked power over that status.

### 2. SEQ-2 (Cross-Contract Lifecycle Desync) would be missed by isolated domain review

**Why:** The `domain-contract-lifecycle.md` audit identifies that `completeAgreement` is owner-only but does not analyze what happens in FreelanceEscrow when an agreement is prematurely completed. The `domain-escrow-payment.md` audit analyzes FreelanceEscrow in isolation and has no knowledge of ContractAgreement's status field. The `domain-reputation-ratings.md` audit assumes that a `Completed` agreement implies settled payments, but this assumption is never validated on-chain.

The cross-contract invariant INV-2 (state variable map) documents this gap ("Enforcement: None on-chain") but only the adversarial sequence analysis reveals the concrete exploitability via premature rating submission.

### 3. SEQ-3 (Employer Griefing via Dispute Stall) would be missed by isolated domain review

**Why:** The `domain-escrow-payment.md` audit correctly identifies the deadlock risk ("If both parties refuse to progress a Submitted or Disputed milestone and the arbiter is unresponsive, funds will be locked indefinitely") and classifies it as a known trade-off. However, it does not model the employer as an active adversary who deliberately triggers the stall. The isolated review treats the scenario as passive non-cooperation, while the adversarial sequence models it as an active attack where the employer disputes specifically to lock funds.

The key insight from adversarial modeling: the employer can both trigger the dispute (via `disputeMilestone`) and benefit from the stall (arbiter colludes or is unresponsive). This dual role is not analyzed in the isolated escrow domain review.

### 4. SEQ-4 and SEQ-5 (Dispute Stats Manipulation) would be missed by isolated domain review

**Why:** The `domain-dispute-handling.md` audit identifies that the owner can "create disputes on behalf of others" and "resolve disputes with any outcome" as separate findings. It does not model the composition of these two capabilities into a stats manipulation attack. The additional insight from adversarial modeling is that the `Cancelled` outcome's intentional exclusion from stats (design decision known trade-off #4) creates a washing vector that the isolated review does not consider.

### 5. SEQ-6 (Platform Front-Run) would be missed by isolated domain review

**Why:** The `domain-escrow-payment.md` audit analyzes `approveMilestone` and `disputeMilestone` independently. It notes that "Platform cannot dispute milestones" (access control map) but does not model the scenario where the platform's approval power is used to preempt a freelancer's dispute. The mempool race condition between two different functions operating on the same status prerequisite (`Submitted`) is a multi-function, multi-actor interaction that only adversarial sequence modeling reveals.

---

## Summary of Findings

| Finding # | Seq | Severity | Title | Contracts | Description |
|-----------|-----|----------|-------|-----------|-------------|
| F-1 | SEQ-1 | HIGH | Owner key compromise enables full reputation fabrication | ContractAgreement, MilestoneRegistry, FreelanceReputation | A single compromised owner key allows creating fake agreements, fabricating approved milestones, and submitting fraudulent ratings. The reputation system's integrity depends entirely on the owner's honesty, with no on-chain validation of work-to-payment linkage. |
| F-2 | SEQ-2 | MEDIUM | Cross-contract lifecycle desync allows premature rating | ContractAgreement, FreelanceEscrow, FreelanceReputation | `ContractAgreement.completeAgreement` has no on-chain linkage to `FreelanceEscrow` fund release status. Premature completion enables rating submission before work is paid, violating the implied invariant that completion means all payments are settled. |
| F-3 | SEQ-3 | MEDIUM | Employer-orchestrated fund lockout via dispute stall | FreelanceEscrow | An employer can dispute a submitted milestone and, with an unresponsive/colluding arbiter, permanently lock the freelancer's funds. The contract remains active but all paths are blocked: cannot cancel (Disputed milestone exists), cannot refund (not Pending), cannot resolve (arbiter absent). |
| F-4 | SEQ-4 | MEDIUM | Owner can fabricate dispute records and manipulate stats | DisputeResolution | The owner can create disputes attributed to any party pair and resolve them with any outcome, inflating/deflating `disputeStats` for targeted addresses. No validation that disputes reference real on-chain data. |
| F-5 | SEQ-5 | LOW | Owner can wash negative dispute outcomes via Cancelled resolution | DisputeResolution | The owner can resolve disputes that should have a clear loser as `Cancelled`, which intentionally does not update stats (design decision). This selectively erases negative outcomes from a user's record. |
| F-6 | SEQ-6 | LOW | Platform can front-run freelancer dispute with approval | FreelanceEscrow | The platform wallet's mempool visibility and employer-level access allows preempting a freelancer's `disputeMilestone` transaction by mining `approveMilestone` first, nullifying the dispute mechanism. |
| F-7 | SEQ-1 | INFO | DESIGN_DECISION -- Owner trust is the single point of failure across 3 contracts | ContractAgreement, MilestoneRegistry, DisputeResolution | The design decisions document that the owner is a trusted backend relayer. SEQ-1 confirms that this trust assumption is the protocol's most critical security boundary. Compromise of this single key enables attacks across all administrative contracts simultaneously. |

### Cross-Finding Analysis

**Root Cause Pattern:** Five of the six sequences (SEQ-1, SEQ-2, SEQ-4, SEQ-5, SEQ-6) exploit the same architectural pattern: privileged roles with unchecked power and no cross-contract validation. The root causes are:

1. **No cross-contract state verification:** ContractAgreement does not verify FreelanceEscrow state. FreelanceReputation trusts ContractAgreement's status without verifying fund release. DisputeResolution does not verify MilestoneRegistry or FreelanceEscrow state.

2. **Single-owner across multiple contracts:** The same deployer address serves as `owner` for ContractAgreement, MilestoneRegistry, and DisputeResolution. A single key compromise affects all three.

3. **No timelocks or multi-sig:** All owner operations are immediate with no delay or multi-party approval. There is no window for detection or intervention.

4. **Missing timeout mechanisms:** FreelanceEscrow has no timeout for stalled milestones or unresponsive arbiters, creating a permanent griefing vector (SEQ-3).

**Mitigation Priority:**
1. Implement cross-contract state verification (e.g., ContractAgreement.completeAgreement should verify FreelanceEscrow.isActive == false) -- addresses SEQ-2
2. Add timelocks or multi-sig requirements for owner operations -- addresses SEQ-1, SEQ-4, SEQ-5
3. Add timeout-based emergency escape for stalled milestones -- addresses SEQ-3
4. Consider separating owner keys across contracts -- reduces blast radius of key compromise
