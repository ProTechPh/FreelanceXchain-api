# State Variable Map -- Solidity Security Audit

**Date:** 2026-07-21
**Contracts analyzed:** 5
**Total variables documented:** 35 (2 constants, 9 immutables, 24 storage variables)

---

## Table of Contents

1. [FreelanceEscrow](#1-freelanceescrow)
2. [ContractAgreement](#2-contractagreement)
3. [MilestoneRegistry](#3-milestoneregistry)
4. [DisputeResolution](#4-disputeresolution)
5. [FreelanceReputation](#5-freelancereputation)
6. [Cross-Contract Storage Invariants](#6-cross-contract-storage-invariants)
7. [Storage Layout Summary](#7-storage-layout-summary)
8. [Unused or Potentially Redundant Variables](#8-unused-or-potentially-redundant-variables)
9. [Duplication and Sync Risks](#9-duplication-and-sync-risks)

---

## 1. FreelanceEscrow

**File:** `contracts/FreelanceEscrow.sol`

### 1.1 Constants

| # | Declaration | Line | Meaning |
|---|-------------|------|---------|
| C1 | `uint8 private constant NOT_ENTERED = 1` | 58 | Reentrancy guard idle state value |
| C2 | `uint8 private constant ENTERED = 2` | 59 | Reentrancy guard locked state value |

**Notes:** Using 1/2 instead of 0/1 is intentional to avoid the default-zero value acting as "not entered" after a storage slot is first written, which is a standard OpenZeppelin reentrancy guard pattern.

### 1.2 Immutables

| # | Declaration | Line | Meaning | Writers | Readers |
|---|-------------|------|---------|---------|---------|
| I1 | `address public immutable employer` | 45 | The employer (client) who created the escrow | constructor (L136) | `onlyEmployer` modifier (L95), `resolveDispute` (L260), `cancelContract` (L344), `refundMilestone` (L319), `getRemainingAmount` (L376) |
| I2 | `address public immutable freelancer` | 46 | The freelancer performing the work | constructor (L137) | `onlyFreelancer` modifier (L101), `approveMilestone` (L205), `resolveDispute` (L259) |
| I3 | `address public immutable arbiter` | 47 | Third-party dispute resolver | constructor (L138) | `onlyArbiter` modifier (L106) |
| I4 | `address public immutable platform` | 48 | Server wallet that can act on employer's behalf | constructor (L139) | `onlyEmployer` modifier (L95-96) |
| I5 | `uint256 public immutable totalAmount` | 49 | Sum of all milestone amounts | constructor (L156) | `approveMilestone` (L200), `resolveDispute` (L254), `cancelContract` (L344), `getRemainingAmount` (L376) |

**Invariants:**
- `employer != address(0)`, `freelancer != address(0)`, `arbiter != address(0)`, `platform != address(0)` -- enforced in constructor (L128-130).
- `arbiter != employer` and `arbiter != freelancer` -- enforced in constructor (L131-132).
- `totalAmount == sum(milestones[i].amount for all i)` -- computed in constructor loop (L143-154).
- `msg.value >= totalAmount` -- enforced in constructor (L157).

**Duplication risk:** None. Immutables are set once and cannot drift.

### 1.3 Storage Variables

#### S1: `uint256 public releasedAmount`

| Property | Detail |
|----------|--------|
| **Declaration** | `uint256 public releasedAmount` (line 51) |
| **Meaning** | Cumulative ETH released to the freelancer across approved milestones and dispute resolutions |
| **Slot** | 0 (first storage slot after immutables) |
| **Writers** | `approveMilestone` (L197: `releasedAmount += amt`), `resolveDispute` (L250: `releasedAmount += freelancerAmt`) |
| **Readers** | `approveMilestone` (L200: completion check), `resolveDispute` (L254: completion check), `cancelContract` (L344: remaining calculation), `getRemainingAmount` (L376) |
| **Invariants** | (1) `releasedAmount <= totalAmount` at all times. (2) `releasedAmount + refundedAmount <= totalAmount`. (3) `releasedAmount` is monotonically non-decreasing. (4) When `isActive == false`, `releasedAmount + refundedAmount >= totalAmount`. |
| **Duplication risk** | Could theoretically be re-derived by iterating `milestones[]` and summing amounts for `Approved` status milestones where the freelancer received funds. However, dispute splits make this non-trivial since `resolveDispute` may credit only a portion to `releasedAmount`. The stored value is the source of truth. |

#### S2: `uint256 public refundedAmount`

| Property | Detail |
|----------|--------|
| **Declaration** | `uint256 public refundedAmount` (line 52) |
| **Meaning** | Cumulative ETH refunded to the employer across refunded milestones and dispute resolutions |
| **Slot** | 1 |
| **Writers** | `refundMilestone` (L312: `refundedAmount += amt`), `resolveDispute` (L251: `refundedAmount += employerAmt`) |
| **Readers** | `approveMilestone` (L200: completion check), `resolveDispute` (L254: completion check), `cancelContract` (L344: remaining calculation), `getRemainingAmount` (L376) |
| **Invariants** | (1) `refundedAmount <= totalAmount`. (2) `releasedAmount + refundedAmount <= totalAmount` before a final action; `>= totalAmount` when `isActive == false` (due to >= check). (3) `refundedAmount` is monotonically non-decreasing. |
| **Duplication risk** | Same as `releasedAmount` -- derivable by summing `Refunded` milestone amounts plus employer-side dispute splits, but the stored value is canonical. |

#### S3: `mapping(address => uint256) public pendingWithdrawals`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256) public pendingWithdrawals` (line 55) |
| **Meaning** | Pull-payment pattern: amounts credited to each address after dispute resolution, awaiting withdrawal |
| **Slot** | 2 (base slot for mapping; actual slots are `keccak256(abi.encode(key, 2))`) |
| **Writers** | `resolveDispute` (L259-260: credits freelancer, L264-265: credits employer) |
| **Readers** | `withdraw` (L281: reads balance, L283: clears to zero) |
| **Invariants** | (1) `pendingWithdrawals[addr] >= 0` always (uint256). (2) The sum of all `pendingWithdrawals` values across all addresses is <= `address(this).balance` (contract must hold enough ETH to cover all pending withdrawals). (3) Only `freelancer` and `employer` addresses receive credits; no other address should have non-zero pending withdrawals. |
| **Duplication risk** | None directly. The credited amounts are derived from dispute splits which are one-time events. |

#### S4: `uint8 private _status`

| Property | Detail |
|----------|--------|
| **Declaration** | `uint8 private _status` (line 60) |
| **Meaning** | Reentrancy guard state variable |
| **Slot** | 3 (packed with `isActive` in the same 32-byte slot) |
| **Writers** | Constructor (L159: sets to NOT_ENTERED), `nonReentrant` modifier (L89: sets ENTERED, L91: resets NOT_ENTERED), constructor excess refund (L166-168) |
| **Readers** | `nonReentrant` modifier (L88: checks == ENTERED) |
| **Invariants** | (1) `_status` is always either `NOT_ENTERED` (1) or `ENTERED` (2). (2) Between external calls, `_status == NOT_ENTERED`. (3) `_status == ENTERED` only within the execution frame of a `nonReentrant`-guarded function. |
| **Duplication risk** | None. |

#### S5: `bool public isActive`

| Property | Detail |
|----------|--------|
| **Declaration** | `bool public isActive` (line 61) |
| **Meaning** | Whether the escrow contract is still active and accepting milestone actions |
| **Slot** | 3 (packed with `_status` -- `_status` occupies the low byte, `isActive` occupies the next byte in the same 32-byte slot) |
| **Writers** | Constructor (L141: sets `true`), `approveMilestone` (L201: sets `false` when complete), `resolveDispute` (L255: sets `false` when complete), `refundMilestone` (L316: sets `false` when complete), `cancelContract` (L345: sets `false`) |
| **Readers** | `contractActive` modifier (L116: checks `!isActive`), `approveMilestone` (L210: emits event if inactive), `resolveDispute` (L271: emits event if inactive), `refundMilestone` (L325: emits event if inactive) |
| **Invariants** | (1) `isActive` starts `true` and can only transition to `false` (monotonic, never re-activated). (2) When `isActive == false`, no further `submitMilestone`, `approveMilestone`, `disputeMilestone`, `resolveDispute`, `refundMilestone`, or `cancelContract` calls succeed. (3) When `isActive == false`, `releasedAmount + refundedAmount >= totalAmount` (or contract was cancelled with remaining refunded). |
| **Duplication risk** | Derivable from `(releasedAmount + refundedAmount >= totalAmount)` if cancellation path is excluded. However, `cancelContract` can set `isActive = false` even when `releasedAmount + refundedAmount < totalAmount` (remaining is refunded in the same tx). The stored value is necessary. |

#### S6: `Milestone[] public milestones`

| Property | Detail |
|----------|--------|
| **Declaration** | `Milestone[] public milestones` (line 71) |
| **Meaning** | Dynamic array of milestone records, each containing amount, status, and description |
| **Slot** | 4 (length stored at slot 4; elements at `keccak256(abi.encode(4)) + index * 3` due to 3-slot struct) |
| **Writers** | Constructor (L147-152: pushes milestones), `submitMilestone` (L183: status -> Submitted), `approveMilestone` (L195: status -> Approved), `disputeMilestone` (L223: status -> Disputed), `resolveDispute` (L249: status -> Approved), `refundMilestone` (L310: status -> Refunded) |
| **Readers** | `submitMilestone` (L179-181), `approveMilestone` (L191-193), `disputeMilestone` (L219-222), `resolveDispute` (L239-243), `refundMilestone` (L306-308), `cancelContract` (L334-341), `getMilestoneCount` (L358), `getMilestone` (L361-369) |
| **Invariants** | (1) `milestones.length >= 1` (enforced by constructor). (2) `milestones.length` is immutable after construction (no push/pop after constructor). (3) Each milestone transitions through a valid state machine: `Pending -> Submitted -> Approved/Disputed/Refunded`; `Disputed -> Approved` (via resolveDispute). (4) A milestone can only be in one state at a time. (5) The sum of all milestone amounts equals `totalAmount`. |
| **Duplication risk** | The `amount` field within each milestone is set once and never modified -- no sync risk. The `status` field is the canonical record of milestone lifecycle. |

**Milestone struct storage layout (3 slots per element):**

| Field | Type | Slot (relative to element base) | Bytes |
|-------|------|---------------------------------|-------|
| `amount` | `uint256` | 0 | 32 |
| `status` | `MilestoneStatus` (uint8) | 1 | 1 (29 bytes wasted) |
| `description` | `string` | 2 | dynamic |

#### S7: `string public contractId`

| Property | Detail |
|----------|--------|
| **Declaration** | `string public contractId` (line 72) |
| **Meaning** | Off-chain contract reference identifier (e.g., database UUID or hash) |
| **Slot** | 5+ (dynamic; length at slot 5, data at keccak256(5)) |
| **Writers** | Constructor (L140) |
| **Readers** | Auto-generated getter `contractId()` |
| **Invariants** | Immutable after construction. |
| **Duplication risk** | This is a reference to an off-chain entity. If the off-chain contract ID changes or is deleted, this on-chain reference becomes stale. However, this is by design -- it is a historical record. |

---

## 2. ContractAgreement

**File:** `contracts/ContractAgreement.sol`

### 2.1 Immutables

| # | Declaration | Line | Meaning | Writers | Readers |
|---|-------------|------|---------|---------|---------|
| I6 | `address public immutable owner` | 33 | Backend relayer address that can manage agreements | constructor (L63) | `createAgreement` (L78), `completeAgreement` (L139) |

**Invariants:** `owner != address(0)` -- set to `msg.sender` in constructor; no explicit zero-check but deployer is assumed non-zero.

### 2.2 Storage Variables

#### S8: `mapping(bytes32 => Agreement) public agreements`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(bytes32 => Agreement) public agreements` (line 50) |
| **Meaning** | Core registry of all contract agreements, keyed by contract ID hash |
| **Slot** | 0 (base slot; actual slots are `keccak256(abi.encode(key, 0))`) |
| **Writers** | `createAgreement` (L84-94: writes full struct), `signAgreement` (L113-117: writes timestamps and status), `completeAgreement` (L141: writes status), `disputeAgreement` (L154: writes status), `cancelAgreement` (L170: writes status) |
| **Readers** | `createAgreement` (L79: checks existence), `signAgreement` (L106-109), `completeAgreement` (L136-138), `disputeAgreement` (L149-152), `cancelAgreement` (L163-168), `getAgreement` (L176-189), `isFullySigned` (L191-194), `verifyTerms` (L196-200) |
| **Invariants** | (1) Once created, `createdAt != 0` (used as existence check). (2) Status transitions: `Pending -> Signed -> Completed/Disputed`; `Pending -> Cancelled`. (3) `status == Signed` implies both `employerSignedAt > 0` AND `freelancerSignedAt > 0`. (4) `employer != freelancer` and both non-zero at creation. (5) `milestoneCount <= type(uint32).max`. |
| **Duplication risk** | The `status == Signed` state is derivable from `employerSignedAt > 0 && freelancerSignedAt > 0`. The explicit status field provides convenience but could theoretically diverge if a bug sets the status without both signatures. Currently safe: `signAgreement` only sets `Signed` when both timestamps are non-zero (L120-122). |

**Agreement struct storage layout (7 slots per entry):**

| Field | Type | Slot (relative) | Bytes | Notes |
|-------|------|-----------------|-------|-------|
| `termsHash` | `bytes32` | 0 | 32 | |
| `employer` | `address` | 1 | 20 | Packed with status + milestoneCount |
| `status` | `AgreementStatus` (uint8) | 1 | 1 | Packed |
| `milestoneCount` | `uint32` | 1 | 4 | Packed (20+1+4 = 25/32 bytes) |
| `freelancer` | `address` | 2 | 20 | 12 bytes wasted |
| `totalAmount` | `uint256` | 3 | 32 | |
| `employerSignedAt` | `uint256` | 4 | 32 | |
| `freelancerSignedAt` | `uint256` | 5 | 32 | |
| `createdAt` | `uint256` | 6 | 32 | |

#### S9: `mapping(address => bytes32[]) public userAgreements`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => bytes32[]) public userAgreements` (line 53) |
| **Meaning** | Index of all agreement hashes associated with each user (both employer and freelancer) |
| **Slot** | 1 (base slot) |
| **Writers** | `createAgreement` (L96-97: pushes contractIdHash for both employer and freelancer) |
| **Readers** | `getUserAgreementCount` (L202), `getUserAgreementAt` (L206) |
| **Invariants** | (1) Each agreement hash appears in exactly two users' arrays (employer and freelancer). (2) The array is append-only -- agreements are never removed from the index. |
| **Duplication risk** | The `contractIdHash` values stored here are redundant with keys in the `agreements` mapping. However, this index is necessary for efficient enumeration. No sync risk since entries are only added, never removed. |

---

## 3. MilestoneRegistry

**File:** `contracts/MilestoneRegistry.sol`

### 3.1 Immutables

| # | Declaration | Line | Meaning | Writers | Readers |
|---|-------------|------|---------|---------|---------|
| I7 | `address public immutable owner` | 31 | Backend relayer address | constructor (L63) | `submitMilestone` (L84), `approveMilestone` (L112), `resolveDisputedMilestone` (L139), `rejectMilestone` (L167) |

### 3.2 Storage Variables

#### S10: `mapping(bytes32 => MilestoneRecord) public milestones`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(bytes32 => MilestoneRecord) public milestones` (line 48) |
| **Meaning** | Registry of all milestone records, keyed by milestone ID hash |
| **Slot** | 0 (base slot) |
| **Writers** | `submitMilestone` (L86-96: writes full struct), `approveMilestone` (L114-115: status/completedAt), `resolveDisputedMilestone` (L144-145: status/completedAt), `rejectMilestone` (L169: status) |
| **Readers** | `submitMilestone` (L79: existence check), `approveMilestone` (L109-111), `resolveDisputedMilestone` (L141-142), `rejectMilestone` (L164-166), `getMilestone` (L175-187), `verifyWorkHash` (L202-206) |
| **Invariants** | (1) Once created, `submittedAt != 0`. (2) Status transitions: `Submitted -> Approved/Rejected`; `Disputed -> Approved` (via resolveDisputedMilestone). (3) `completedAt != 0` iff `status == Approved`. (4) `freelancer != employer`, both non-zero. (5) `amount > 0`. |
| **Duplication risk** | This contract stores milestone data that overlaps conceptually with `FreelanceEscrow.milestones[]`. However, they serve different purposes: FreelanceEscrow tracks payment lifecycle, MilestoneRegistry tracks work verification. The `contractId` field links them. Desynchronization risk exists if one is updated but the other is not, but this is an architectural concern, not a storage bug. |

**MilestoneRecord struct storage layout (6 slots per entry):**

| Field | Type | Slot (relative) | Bytes | Notes |
|-------|------|-----------------|-------|-------|
| `contractId` | `bytes32` | 0 | 32 | |
| `workHash` | `bytes32` | 1 | 32 | |
| `freelancer` | `address` | 2 | 20 | Packed with status + submittedAt + completedAt |
| `status` | `MilestoneStatus` (uint8) | 2 | 1 | Packed |
| `submittedAt` | `uint48` | 2 | 6 | Packed |
| `completedAt` | `uint40` | 2 | 5 | Packed (20+1+6+5 = 32/32 bytes, fully packed) |
| `employer` | `address` | 3 | 20 | 12 bytes wasted |
| `amount` | `uint256` | 4 | 32 | |
| `title` | `string` | 5 | dynamic | |

#### S11: `mapping(address => bytes32[]) public freelancerMilestones`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => bytes32[]) public freelancerMilestones` (line 51) |
| **Meaning** | Index of milestone ID hashes for each freelancer's portfolio |
| **Slot** | 1 (base slot) |
| **Writers** | `submitMilestone` (L98: pushes milestoneIdHash) |
| **Readers** | `getFreelancerStats` (L194: reads `.length`), `getFreelancerMilestoneAt` (L198) |
| **Invariants** | (1) Append-only. (2) Each milestone hash appears in exactly one freelancer's array. |
| **Duplication risk** | The milestone hashes here are redundant with keys in the `milestones` mapping. Index is needed for enumeration. |

#### S12: `mapping(address => uint256) public completedCount`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256) public completedCount` (line 54) |
| **Meaning** | Number of milestones approved for each freelancer |
| **Slot** | 2 (base slot) |
| **Writers** | `approveMilestone` (L122: `completedCount[fl]++`), `resolveDisputedMilestone` (L152: `completedCount[fl]++`) |
| **Readers** | `getFreelancerStats` (L192) |
| **Invariants** | (1) `completedCount[fl] <= freelancerMilestones[fl].length` (cannot have more completions than total milestones). (2) Monotonically non-decreasing. (3) Equals the count of milestones in `milestones` mapping where `freelancer == fl` and `status == Approved`. |
| **Duplication risk** | **HIGH.** This is a cached counter that could be re-derived by iterating all freelancer milestones and counting `Approved` ones. It can drift out of sync if `approveMilestone` or `resolveDisputedMilestone` are called without proper checks (currently safe since both verify status transitions). However, if a new function is added that changes milestone status to Approved without incrementing this counter, the cached value becomes stale. |

#### S13: `mapping(address => uint256) public totalEarned`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256) public totalEarned` (line 55) |
| **Meaning** | Cumulative earnings in wei for each freelancer across all approved milestones |
| **Slot** | 3 (base slot) |
| **Writers** | `approveMilestone` (L124: `totalEarned[fl] += amt`), `resolveDisputedMilestone` (L154: `totalEarned[fl] += amt`) |
| **Readers** | `getFreelancerStats` (L193) |
| **Invariants** | (1) `totalEarned[fl]` equals the sum of `milestones[id].amount` for all approved milestones where `freelancer == fl`. (2) Monotonically non-decreasing. |
| **Duplication risk** | **HIGH.** Same as `completedCount` -- cached aggregate that is derivable from milestone records. If a milestone is approved without updating this, it drifts. Currently safe but fragile to future changes. |

---

## 4. DisputeResolution

**File:** `contracts/DisputeResolution.sol`

### 4.1 Immutables

| # | Declaration | Line | Meaning | Writers | Readers |
|---|-------------|------|---------|---------|---------|
| I8 | `address public immutable owner` | 33 | Backend relayer / admin address | constructor (L68) | `createDispute` (L88), `submitEvidence` (L119), `resolveDispute` (L135) |

### 4.2 Storage Variables

#### S14: `mapping(bytes32 => DisputeRecord) public disputes`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(bytes32 => DisputeRecord) public disputes` (line 52) |
| **Meaning** | Core registry of all dispute records, keyed by dispute ID hash |
| **Slot** | 0 (base slot) |
| **Writers** | `createDispute` (L91-103: writes full struct), `submitEvidence` (L121: appends to evidenceHashes), `resolveDispute` (L142-145: outcome, reasoning, arbiter, resolvedAt) |
| **Readers** | `createDispute` (L84: existence check), `submitEvidence` (L116-118), `resolveDispute` (L137-140), `getDispute` (L170-183), `getEvidenceCount` (L185), `getEvidenceAt` (L189), `isResolved` (L200) |
| **Invariants** | (1) Once created, `createdAt != 0`. (2) Status transitions: `Pending -> FreelancerFavor/EmployerFavor/Split/Cancelled`. (3) `resolvedAt != 0` iff `outcome != Pending`. (4) `initiator` is either `freelancer` or `employer`. (5) `amount > 0` (assumed from creation context, not explicitly enforced). |
| **Duplication risk** | The `contractId` and `milestoneId` here link to ContractAgreement and FreelanceEscrow/MilestoneRegistry respectively. Cross-contract consistency is maintained by the backend relayer but not enforced on-chain. |

**DisputeRecord struct storage layout (9+ slots per entry):**

| Field | Type | Slot (relative) | Bytes | Notes |
|-------|------|-----------------|-------|-------|
| `contractId` | `bytes32` | 0 | 32 | |
| `milestoneId` | `bytes32` | 1 | 32 | |
| `initiator` | `address` | 2 | 20 | Packed with outcome + createdAt + resolvedAt |
| `outcome` | `DisputeOutcome` (uint8) | 2 | 1 | Packed |
| `createdAt` | `uint48` | 2 | 6 | Packed |
| `resolvedAt` | `uint48` | 2 | 6 | Packed (20+1+6+6 = 33 bytes -- **OVERFLOW: exceeds 32 bytes**) |
| `freelancer` | `address` | 3 | 20 | |
| `employer` | `address` | 4 | 20 | |
| `arbiter` | `address` | 5 | 20 | |
| `amount` | `uint256` | 6 | 32 | |
| `reasoning` | `string` | 7 | dynamic | |
| `evidenceHashes` | `bytes32[]` | 8 | dynamic | |

**FINDING -- Slot 2 packing overflow:** The struct comment claims `initiator` (20 bytes) + `outcome` (1 byte) + `createdAt` (6 bytes) + `resolvedAt` (6 bytes) = 33 bytes are packed into slot 2. Solidity's storage packing rules state that fields are packed into the same slot only if they fit within 32 bytes. Since 33 > 32, `resolvedAt` will spill into a new slot (slot 3), shifting all subsequent fields by one slot. The comment is misleading but the code is functionally correct -- Solidity handles this automatically. The struct will occupy 10 slots, not 9.

#### S15: `mapping(address => bytes32[]) public userDisputes`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => bytes32[]) public userDisputes` (line 53) |
| **Meaning** | Index of dispute ID hashes for each user (both freelancer and employer of each dispute) |
| **Slot** | 1 (base slot) |
| **Writers** | `createDispute` (L105-106: pushes disputeIdHash for both freelancer and employer) |
| **Readers** | `getUserDisputeStats` (L197: reads `.length` for total count) |
| **Invariants** | (1) Each dispute hash appears in exactly two users' arrays. (2) Append-only. |
| **Duplication risk** | Redundant with keys in `disputes` mapping. Needed for enumeration. |

#### S16: `mapping(address => DisputeStats) public disputeStats`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => DisputeStats) public disputeStats` (line 61) |
| **Meaning** | Packed win/loss/split counters per user for reputation tracking |
| **Slot** | 2 (base slot; DisputeStats struct fits in 1 slot: 8+8+8 = 24 bytes) |
| **Writers** | `resolveDispute` (L153-163: increments won/lost/split based on outcome) |
| **Readers** | `getUserDisputeStats` (L196) |
| **Invariants** | (1) `won + lost + split <= userDisputes[user].length` (only resolved disputes are counted). (2) All counters are monotonically non-decreasing. (3) For any dispute, exactly one freelancer/employer stat pair is updated (FreelancerFavor: freelancer.won++, employer.lost++; etc.). |
| **Duplication risk** | **MEDIUM.** The total `userDisputes[user].length` includes pending disputes, so `won + lost + split` may be less than the total. The `DisputeOutcome.Cancelled` case intentionally does not update any counter (L162-163), which means cancelled disputes are "lost" from the stats. This is by design but could confuse consumers who expect `won + lost + split + cancelled == total`. |

**DisputeStats struct layout (1 slot):**

| Field | Type | Bytes |
|-------|------|-------|
| `won` | `uint64` | 8 |
| `lost` | `uint64` | 8 |
| `split` | `uint64` | 8 |
| *padding* | -- | 8 |

---

## 5. FreelanceReputation

**File:** `contracts/FreelanceReputation.sol`

### 5.1 Immutables

| # | Declaration | Line | Meaning | Writers | Readers |
|---|-------------|------|---------|---------|---------|
| I9 | `IContractAgreement public immutable contractAgreement` | 51 | Reference to the ContractAgreement contract for gating ratings | constructor (L89) | `submitRating` (L117-127) |

### 5.2 Storage Variables

#### S17: `Rating[] public ratings`

| Property | Detail |
|----------|--------|
| **Declaration** | `Rating[] public ratings` (line 64) |
| **Meaning** | Global array of all ratings ever submitted |
| **Slot** | 0 (length stored at slot 0; elements at `keccak256(0) + index * 4`) |
| **Writers** | `submitRating` (L149-157: pushes new Rating) |
| **Readers** | `getRating` (L232-252), `getTotalRatings` (L258) |
| **Invariants** | (1) `ratings.length` is monotonically non-decreasing (append-only). (2) Each rating's `score` is in range [1, 5]. (3) Each rating's `rater != ratee`. (4) `contractIdHash` in each rating references a Completed agreement. |
| **Duplication risk** | None. This is the canonical store. |

**Rating struct storage layout (4 slots per entry):**

| Field | Type | Slot (relative) | Bytes | Notes |
|-------|------|-----------------|-------|-------|
| `rater` | `address` | 0 | 20 | Packed with score + isEmployerRating + timestamp |
| `score` | `uint8` | 0 | 1 | Packed |
| `isEmployerRating` | `bool` | 0 | 1 | Packed |
| `timestamp` | `uint48` | 0 | 6 | Packed (20+1+1+6 = 28/32 bytes) |
| `ratee` | `address` | 1 | 20 | 12 bytes wasted |
| `comment` | `string` | 2 | dynamic | |
| `contractIdHash` | `bytes32` | 3 | 32 | |

#### S18: `mapping(address => uint256[]) public userRatings`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256[]) public userRatings` (line 67) |
| **Meaning** | Indices into the `ratings` array for ratings received by each user |
| **Slot** | 1 (base slot) |
| **Writers** | `submitRating` (L160: `userRatings[ratee].push(ratingIndex)`) |
| **Readers** | `getUserRatingIndices` (L207), `getUserRatingCount` (L314) |
| **Invariants** | (1) Append-only. (2) Each rating index appears in exactly one user's `userRatings` array (the ratee). (3) `userRatings[addr].length` equals the number of ratings where `ratee == addr`. |
| **Duplication risk** | Indices are redundant with `ratings` array position. Needed for per-user enumeration. |

#### S19: `mapping(address => uint256[]) public givenRatings`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256[]) public givenRatings` (line 70) |
| **Meaning** | Indices into the `ratings` array for ratings given by each user |
| **Slot** | 2 (base slot) |
| **Writers** | `submitRating` (L161: `givenRatings[msg.sender].push(ratingIndex)`) |
| **Readers** | `getGivenRatingIndices` (L288), `getGivenRatingCount` (L321) |
| **Invariants** | (1) Append-only. (2) Each rating index appears in exactly one user's `givenRatings` array (the rater). |
| **Duplication risk** | Same as `userRatings`. |

#### S20: `mapping(bytes32 => bool) public ratingExists`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(bytes32 => bool) public ratingExists` (line 73) |
| **Meaning** | Duplicate prevention: maps `keccak256(abi.encodePacked(rater, ratee, contractIdHash))` to whether a rating has been submitted |
| **Slot** | 3 (base slot) |
| **Writers** | `submitRating` (L143: `ratingExists[ratingKey] = true`) |
| **Readers** | `submitRating` (L142: checks for duplicate), `hasRated` (L270) |
| **Invariants** | (1) Once `true`, never reverts to `false` (one-way flag). (2) For each (rater, ratee, contractIdHash) triple, at most one rating exists. |
| **Duplication risk** | **LOW.** This is technically derivable by scanning all ratings for a matching (rater, ratee, contractIdHash) triple, but that would be O(n) and impractical. The mapping is necessary for O(1) duplicate checking. |

#### S21: `mapping(address => uint256) public totalScore`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256) public totalScore` (line 76) |
| **Meaning** | Sum of all rating scores received by each user (used to compute average) |
| **Slot** | 4 (base slot) |
| **Writers** | `submitRating` (L165: `totalScore[ratee] += score`) |
| **Readers** | `getAverageRating` (L182) |
| **Invariants** | (1) `totalScore[addr]` equals the sum of `ratings[i].score` for all ratings where `ratee == addr`. (2) `totalScore[addr] >= ratingCount[addr]` (since minimum score is 1). (3) `totalScore[addr] <= ratingCount[addr] * 5` (since maximum score is 5). |
| **Duplication risk** | **HIGH.** Derivable by iterating `userRatings[addr]` and summing scores. A cached counter that can drift if `submitRating` is modified incorrectly. Currently safe. |

#### S22: `mapping(address => uint256) public ratingCount`

| Property | Detail |
|----------|--------|
| **Declaration** | `mapping(address => uint256) public ratingCount` (line 77) |
| **Meaning** | Number of ratings received by each user |
| **Slot** | 5 (base slot) |
| **Writers** | `submitRating` (L166: `ratingCount[ratee]++`) |
| **Readers** | `getAverageRating` (L181, L182), `getRatingCount` (L189) |
| **Invariants** | (1) `ratingCount[addr] == userRatings[addr].length`. (2) Monotonically non-decreasing. |
| **Duplication risk** | **HIGH.** This is a cached duplicate of `userRatings[addr].length`. Both are always updated together in `submitRating`, so they are in sync. However, if a future function modifies one without the other, they will diverge. `ratingCount` is used for O(1) average calculation without needing to load the array length. |

---

## 6. Cross-Contract Storage Invariants

These invariants span multiple contracts and rely on the backend relayer to maintain consistency:

### INV-1: Escrow Milestones <-> MilestoneRegistry Records
- For each milestone in `FreelanceEscrow.milestones[i]`, there should be a corresponding record in `MilestoneRegistry.milestones[milestoneIdHash]` (linked via the off-chain `contractId`).
- **Enforcement:** None on-chain. The backend relayer is responsible for creating matching MilestoneRegistry entries when FreelanceEscrow milestones are submitted.
- **Risk:** If the backend fails to create a MilestoneRegistry record, the escrow milestone can still be approved/disputed independently. The contracts are loosely coupled.

### INV-2: ContractAgreement Status <-> FreelanceEscrow Lifecycle
- A `ContractAgreement` with `status == Signed` should have a corresponding active `FreelanceEscrow`.
- A `ContractAgreement` with `status == Completed` should have `FreelanceEscrow.isActive == false`.
- **Enforcement:** None on-chain. The contracts do not reference each other.
- **Risk:** The agreement could be marked `Completed` while the escrow still has pending milestones, or vice versa.

### INV-3: DisputeResolution <-> FreelanceEscrow
- A dispute in `DisputeResolution` references a `milestoneId` that should correspond to a milestone in `FreelanceEscrow`.
- The `DisputeResolution.resolveDispute` and `FreelanceEscrow.resolveDispute` are independent functions that must be coordinated by the backend.
- **Enforcement:** None on-chain.
- **Risk:** The dispute could be resolved in DisputeResolution without the corresponding escrow dispute being resolved, or the split percentages could differ.

### INV-4: MilestoneRegistry.completedCount/totalEarned <-> FreelanceReputation
- Reputation ratings reference `contractIdHash` from `ContractAgreement`, not MilestoneRegistry directly.
- The `completedCount` and `totalEarned` in MilestoneRegistry are independent of the reputation system.
- **Risk:** Low. These systems serve different purposes (work history vs. peer ratings).

### INV-5: DisputeResolution.disputeStats <-> FreelanceReputation
- Dispute outcomes affect `disputeStats` but do not directly affect reputation ratings.
- A user's dispute record could be considered when evaluating their reputation, but this linkage is off-chain only.
- **Risk:** Low by design.

---

## 7. Storage Layout Summary

### ERC-7201 Namespaces
**Not used.** None of the five contracts implement ERC-7201 namespaced storage. All storage uses standard sequential slot allocation.

### Per-Contract Slot Allocation

#### FreelanceEscrow
| Slot | Variable | Notes |
|------|----------|-------|
| 0 | `releasedAmount` | uint256 |
| 1 | `refundedAmount` | uint256 |
| 2 | `pendingWithdrawals` | mapping base |
| 3 | `_status` + `isActive` | Packed: uint8 + bool = 2 bytes in 1 slot |
| 4 | `milestones` (length) | Dynamic array |
| 5+ | `contractId` | Dynamic string |
| 5+N | Milestone elements | 3 slots each starting at keccak256(4) |

#### ContractAgreement
| Slot | Variable | Notes |
|------|----------|-------|
| 0 | `agreements` | mapping base |
| 1 | `userAgreements` | mapping base |

#### MilestoneRegistry
| Slot | Variable | Notes |
|------|----------|-------|
| 0 | `milestones` | mapping base |
| 1 | `freelancerMilestones` | mapping base |
| 2 | `completedCount` | mapping base |
| 3 | `totalEarned` | mapping base |

#### DisputeResolution
| Slot | Variable | Notes |
|------|----------|-------|
| 0 | `disputes` | mapping base |
| 1 | `userDisputes` | mapping base |
| 2 | `disputeStats` | mapping base (DisputeStats fits in 1 slot) |

#### FreelanceReputation
| Slot | Variable | Notes |
|------|----------|-------|
| 0 | `ratings` (length) | Dynamic array |
| 1 | `userRatings` | mapping base |
| 2 | `givenRatings` | mapping base |
| 3 | `ratingExists` | mapping base |
| 4 | `totalScore` | mapping base |
| 5 | `ratingCount` | mapping base |

---

## 8. Unused or Potentially Redundant Variables

### 8.1 No truly unused variables detected
All declared state variables are read by at least one function in their respective contracts.

### 8.2 Potentially redundant variables

| Variable | Contract | Reason |
|----------|----------|--------|
| `ratingCount` (S22) | FreelanceReputation | Exact duplicate of `userRatings[addr].length`. Exists for gas optimization (avoids loading array length for average calculation). Acceptable tradeoff. |
| `completedCount` (S12) | MilestoneRegistry | Derivable from counting Approved milestones in `freelancerMilestones`. Exists for O(1) `getFreelancerStats`. Acceptable tradeoff. |
| `totalEarned` (S13) | MilestoneRegistry | Derivable from summing Approved milestone amounts. Exists for O(1) `getFreelancerStats`. Acceptable tradeoff. |
| `totalScore` (S21) | FreelanceReputation | Derivable from summing all ratings for a user. Exists for O(1) average calculation. Acceptable tradeoff. |

---

## 9. Duplication and Sync Risks

### Risk Matrix

| Cached Variable | Source of Truth | Sync Mechanism | Risk Level | Consequence of Desync |
|-----------------|----------------|----------------|------------|----------------------|
| `FreelanceEscrow.releasedAmount` | Milestone statuses in `milestones[]` | Manual (updated in same tx as status change) | LOW | Incorrect `getRemainingAmount()`, premature or delayed `isActive` deactivation |
| `FreelanceEscrow.refundedAmount` | Milestone statuses in `milestones[]` | Manual | LOW | Same as above |
| `FreelanceEscrow.isActive` | `releasedAmount + refundedAmount >= totalAmount` | Manual (checked in same tx) | LOW | Contract could remain active when complete, or become inactive prematurely |
| `MilestoneRegistry.completedCount` | Count of Approved milestones | Manual (incremented on approval) | MEDIUM | Incorrect freelancer stats displayed |
| `MilestoneRegistry.totalEarned` | Sum of Approved milestone amounts | Manual (incremented on approval) | MEDIUM | Incorrect earnings displayed |
| `DisputeResolution.disputeStats` | Resolved dispute outcomes | Manual (updated on resolution) | LOW | Incorrect win/loss stats |
| `FreelanceReputation.totalScore` | Sum of all ratings | Manual (incremented on submit) | MEDIUM | Incorrect average rating |
| `FreelanceReputation.ratingCount` | `userRatings[addr].length` | Manual (incremented on submit) | LOW-MEDIUM | Incorrect average rating, count mismatch |
| `FreelanceReputation.ratingExists` | Scan of all ratings | Manual (set on submit) | LOW | Duplicate ratings could be submitted |

### Mitigation Notes
- All cached variables are updated in the same transaction as their source-of-truth mutations, within the same function. This eliminates most race conditions.
- The primary risk is future code changes: if a new function modifies milestone status without updating the cached counters, desynchronization will occur.
- No admin or upgrade mechanism exists to repair desynchronized cached values.
- The `FreelanceEscrow` contract is most resilient because its cached values (`releasedAmount`, `refundedAmount`, `isActive`) are checked and updated in a single atomic operation with CEI (Checks-Effects-Interactions) pattern enforcement.
