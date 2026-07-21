# Stage 2: Milestone Tracking Domain -- Per-Function Audit

**Audit Date**: 2026-07-21
**Domain**: Milestone lifecycle management -- submission, approval, rejection, dispute resolution, and freelancer portfolio tracking
**Contracts Analyzed**:
- `MilestoneRegistry.sol` -- `constructor()`, `submitMilestone()`, `approveMilestone()`, `resolveDisputedMilestone()`, `rejectMilestone()`, `getMilestone()`, `getFreelancerStats()`, `getFreelancerMilestoneAt()`, `verifyWorkHash()`

---

## Per-Function Analysis

---

### constructor()

- **Rationale**: Initializes the contract by setting the deployer as the immutable `owner` address. This owner acts as the backend relayer that mediates off-chain workflows and has elevated privileges across all milestone operations.

- **State mutations**:
  - `owner` (immutable) -- set to `msg.sender` at line 63

- **Dependencies**:
  - Reads: `msg.sender`
  - Calls: none
  - Modifiers: none

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Owner is the backend relayer**. Per design decisions document, the owner is intended to be a trusted server wallet. Setting `owner = msg.sender` without a zero-address check is standard practice since `msg.sender` cannot be `address(0)` in normal EVM execution. The `owner` is immutable, so it cannot be changed after deployment.

  2. **INFO -- No validation that deployer is an EOA or trusted contract**. The constructor accepts any `msg.sender` without discrimination. If deployed by a compromised or malicious deployer key, the entire milestone registry is compromised. This is inherent to the immutable-owner pattern and is mitigated by operational security off-chain.

- **Verdict**: **SOUND**

---

### submitMilestone(bytes32 milestoneIdHash, bytes32 contractId, bytes32 workHash, address freelancer, address employer, uint256 amount, string calldata title)

- **Rationale**: Records a new milestone submission on-chain. This is the entry point for creating a milestone record that tracks the freelancer's work submission. The milestone starts in `Submitted` status and can subsequently be approved, rejected, or disputed. The function serves as the foundation for the freelancer's verifiable work history.

- **State mutations**:
  - `milestones[milestoneIdHash]` -- writes a complete `MilestoneRecord` struct (lines 86-96): `contractId`, `workHash`, `freelancer`, `status` (set to `Submitted`), `submittedAt` (set to `uint48(block.timestamp)`), `completedAt` (0), `employer`, `amount`, `title`
  - `freelancerMilestones[freelancer]` -- appends `milestoneIdHash` to the freelancer's index array (line 98)

- **Dependencies**:
  - Reads: `milestones[milestoneIdHash].submittedAt` (line 79), `msg.sender` (line 84)
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Owner can submit on behalf of any freelancer**. Lines 84: `msg.sender != freelancer && msg.sender != owner`. Per design decisions, the owner (backend relayer) is trusted to submit milestones with correct parameters. This is by design for server-mediated workflows where the backend relays the freelancer's submission.

  2. **MEDIUM -- Owner can supply arbitrary freelancer and employer addresses**. Lines 86-96: The `freelancer` and `employer` parameters are caller-supplied and not validated against `msg.sender` when `msg.sender == owner`. A compromised owner could register milestones attributed to any address pair, fabricating work history for a freelancer who never performed the work. This inflates the freelancer's `completedCount` and `totalEarned` when subsequently approved. While documented in the access control map (GAP-5), the impact on reputation integrity is significant.

  3. **LOW -- No validation on `contractId` parameter**. Line 87: `contractId` is accepted as-is with no non-zero check or format validation. A zero `contractId` (`bytes32(0)`) creates a milestone with no meaningful linkage to an off-chain contract. Downstream consumers relying on `contractId` to correlate with `ContractAgreement` records may malfunction.

  4. **LOW -- No validation on `workHash` parameter**. Line 88: `workHash` is accepted without a non-zero check. A zero `workHash` creates a milestone that cannot meaningfully verify work via `verifyWorkHash()`. While `verifyWorkHash` would technically return `true` for `bytes32(0)` against another `bytes32(0)`, this has no cryptographic meaning.

  5. **LOW -- No upper bound on `amount`**. Line 93: `amount` is only checked for `== 0`. Extremely large values (up to `type(uint256).max`) are accepted. Since this contract does not hold or transfer funds, the risk is limited to misleading off-chain displays and corrupted `totalEarned` aggregates. The `uint256` type prevents overflow in `totalEarned[fl] += amt` (Solidity 0.8.26 checked arithmetic).

  6. **LOW -- Unbounded `title` string allows gas-griefing**. Lines 77, 95: `title` is a `calldata string` with no length limit. An extremely long title string will increase storage costs for the milestone record. Since the caller pays gas, this is self-limiting, but it inflates on-chain storage permanently with no cleanup mechanism.

  7. **INFO -- Double-submit prevention via `submittedAt` timestamp**. Line 79: The existence check `milestones[milestoneIdHash].submittedAt != 0` prevents overwriting an existing milestone. Since `block.timestamp` is never 0 post-genesis, the default zero value for a non-existent milestone struct reliably indicates absence. This is a standard pattern.

  8. **INFO -- `uint48(block.timestamp)` truncation is safe**. Line 91: `uint48` can represent timestamps up to year ~8,921,556. No practical overflow risk.

- **Verdict**: **NEEDS_REVIEW**

---

### approveMilestone(bytes32 milestoneIdHash)

- **Rationale**: Approves a submitted milestone, transitioning it from `Submitted` to `Approved` status. This records the employer's acceptance of the freelancer's work and updates the freelancer's completion statistics. The approval represents the definitive on-chain record that work was accepted, forming the basis of the freelancer's verifiable reputation.

- **State mutations**:
  - `milestones[milestoneIdHash].status` -- set to `MilestoneStatus.Approved` (line 114)
  - `milestones[milestoneIdHash].completedAt` -- set to `uint40(block.timestamp)` (line 115)
  - `completedCount[fl]` -- incremented by 1 (line 122, unchecked)
  - `totalEarned[fl]` -- incremented by `amt` (line 124)

- **Dependencies**:
  - Reads: `milestones[milestoneIdHash].submittedAt` (line 110), `.status` (line 111), `.employer` (line 112), `.freelancer` (line 118), `.amount` (line 119)
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Employer or owner can approve**. Line 112: `msg.sender != m.employer && msg.sender != owner`. Per design decisions, both the milestone's employer and the backend relayer owner can approve. This enables the employer to directly approve work or the backend to mediate approvals.

  2. **LOW -- `uint40(block.timestamp)` truncation for `completedAt`**. Line 115: `uint40` can represent timestamps up to approximately year 36,812 (2^40 / 86400 / 365.25 + 1970). While practically safe for the foreseeable future, this is a narrower range than `submittedAt` which uses `uint48`. The 8-byte difference in range is negligible in practice but represents an inconsistency in temporal precision between the two timestamps.

  3. **INFO -- Unchecked increment on `completedCount` is safe**. Lines 121-123: The `unchecked` block for `completedCount[fl]++` is justified because a `uint256` counter incrementing by 1 per approval cannot overflow in any realistic scenario (2^256 approvals is impossible).

  4. **INFO -- Storage read caching is correct**. Lines 118-119: `fl` and `amt` are cached from storage before use in the subsequent lines. This is a gas optimization that avoids re-reading from storage slots. The cached values are used consistently for `completedCount`, `totalEarned`, and the event emission.

  5. **INFO -- Status guard prevents double-approval**. Line 111: The check `m.status != MilestoneStatus.Submitted` ensures only `Submitted` milestones can be approved. Once approved, the status changes to `Approved` and subsequent calls revert with `InvalidStatus()`.

  6. **INFO -- No on-chain verification that work was actually performed**. The approval is purely based on the caller's assertion. There is no mechanism to verify the `workHash` corresponds to actual deliverables. This is by design -- the employer (or trusted owner) is the arbiter of work acceptance.

- **Verdict**: **SOUND**

---

### resolveDisputedMilestone(bytes32 milestoneIdHash)

- **Rationale**: Provides the only path from `Disputed` to `Approved` status. Without this function, a milestone that enters `Disputed` status (set externally, e.g., by the backend or another contract) would be permanently stuck, under-counting the freelancer's `completedCount` and `totalEarned`. This function mirrors the accounting of `approveMilestone` for the dispute resolution path.

- **State mutations**:
  - `milestones[milestoneIdHash].status` -- set to `MilestoneStatus.Approved` (line 144)
  - `milestones[milestoneIdHash].completedAt` -- set to `uint40(block.timestamp)` (line 145)
  - `completedCount[fl]` -- incremented by 1 (line 152, unchecked)
  - `totalEarned[fl]` -- incremented by `amt` (line 154)

- **Dependencies**:
  - Reads: `msg.sender` (line 139), `milestones[milestoneIdHash].submittedAt` (line 141), `.status` (line 142), `.freelancer` (line 148), `.amount` (line 149)
  - Calls: none
  - Modifiers: none (inline access control: `msg.sender == owner`)

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Owner-only access for dispute resolution**. Line 139: `msg.sender != owner` check restricts this to the backend relayer. Per design decisions, dispute resolution is restricted to owner only. This matches the pattern in `DisputeResolution.sol` where `resolveDispute` is also owner-only.

  2. **MEDIUM -- Dispute resolution always favors the freelancer**. Lines 144-154: This function unconditionally transitions `Disputed -> Approved` and credits the freelancer's statistics. There is no path from `Disputed -> Rejected` within this contract. If the dispute outcome favors the employer, the backend has no on-chain function to record that the freelancer's work was rejected after dispute. The only available paths are: (a) resolve in freelancer's favor via this function, or (b) leave the milestone permanently in `Disputed` status, which means `completedCount` and `totalEarned` will not reflect the true outcome.

  3. **MEDIUM -- Emitted event is misleading**. Line 156: `emit MilestoneApproved(milestoneIdHash, fl, amt, block.timestamp)` reuses the same event as `approveMilestone`. Off-chain systems cannot distinguish between a normal employer approval and a dispute resolution by the owner. This makes it impossible to build accurate audit trails or dashboards that differentiate approval types. A dedicated `MilestoneDisputeResolved` event would be more appropriate.

  4. **INFO -- Accounting consistency with `approveMilestone`**. Lines 144-154: The state mutations (status, completedAt, completedCount, totalEarned) are identical to `approveMilestone` lines 114-124. This ensures that a dispute resolved in the freelancer's favor is treated equivalently to a direct approval for reputation and statistics purposes.

  5. **INFO -- Unchecked increment and storage caching mirror `approveMilestone`**. Lines 148-149, 151-153: Same patterns as `approveMilestone` -- storage reads cached into `fl` and `amt`, `completedCount` increment is unchecked.

- **Verdict**: **NEEDS_REVIEW**

---

### rejectMilestone(bytes32 milestoneIdHash, string calldata reason)

- **Rationale**: Allows the employer (or owner) to reject a submitted milestone, recording that the work was not accepted. This provides a negative signal in the freelancer's work history and prevents the milestone from being approved without re-submission.

- **State mutations**:
  - `milestones[milestoneIdHash].status` -- set to `MilestoneStatus.Rejected` (line 169)

- **Dependencies**:
  - Reads: `milestones[milestoneIdHash].submittedAt` (line 165), `.status` (line 166), `.employer` (line 167)
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Employer or owner can reject**. Line 167: Same access pattern as `approveMilestone` -- `msg.sender != m.employer && msg.sender != owner`. Consistent with the design decision that employer and owner share mutation authority.

  2. **LOW -- Rejection does not update `completedCount` or `totalEarned`**. Lines 163-171: Unlike `approveMilestone` and `resolveDisputedMilestone`, rejection does not touch the freelancer's aggregate statistics. This is correct behavior -- rejected milestones should not count toward completions or earnings. However, `getFreelancerStats()` returns `totalMilestones` from `freelancerMilestones[fl].length`, which includes rejected milestones. Callers must query individual milestone statuses to distinguish approved from rejected, which is not surfaced in the stats function.

  3. **LOW -- Rejected milestone has no recovery path**. Line 169: Once a milestone is rejected, there is no function to transition it back to `Submitted` or to any other status. The `approveMilestone` function requires `Submitted` status, and `resolveDisputedMilestone` requires `Disputed` status. A rejected milestone is permanently terminal. If rejection was erroneous, the only remedy is to submit a new milestone with a different `milestoneIdHash`, creating a duplicate entry in `freelancerMilestones`.

  4. **INFO -- `reason` parameter is event-only**. Line 170: The rejection `reason` string is emitted in the `MilestoneRejected` event but not stored on-chain. This means the reason cannot be queried via `getMilestone()` -- it is only available through event logs. This is a deliberate gas optimization (storing strings is expensive) but limits on-chain auditability.

  5. **INFO -- No `completedAt` update on rejection**. The `completedAt` field remains 0 after rejection. This is consistent with the invariant that `completedAt != 0` iff `status == Approved`.

- **Verdict**: **SOUND**

---

### getMilestone(bytes32 milestoneIdHash)

- **Rationale**: Returns the full details of a milestone record for off-chain consumption. This is the primary read interface for milestone data, used by frontends, indexers, and backend services to display milestone information.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `milestones[milestoneIdHash]` -- all fields (lines 185-186)
  - Calls: none
  - Modifiers: none

- **Findings**:
  1. **LOW -- `employer` address is not returned**. Lines 175-187: The return tuple includes `contractId`, `workHash`, `freelancer`, `amount`, `status`, `submittedAt`, `completedAt`, and `title` -- but omits the `employer` field. The `MilestoneRecord` struct (line 42) stores `employer` in slot 3, but `getMilestone()` does not expose it. Off-chain systems that need the employer address must either store it separately at submission time or access the contract's storage directly. This is an unnecessary omission that limits the function's utility.

  2. **INFO -- Returns 0 for non-existent milestones**. Line 185-186: If `milestoneIdHash` does not exist, the function returns all-zero values (empty bytes32, zero address, zero status, etc.) rather than reverting. Callers must check `submittedAt != 0` or `freelancer != address(0)` to distinguish a non-existent milestone from one with legitimately zero fields. This is consistent with the contract's existence-check pattern using `submittedAt`.

  3. **INFO -- `uint48` to `uint256` widening is safe**. Line 186: `uint256(m.submittedAt)` and `uint256(m.completedAt)` safely widen the packed timestamps without data loss.

- **Verdict**: **NEEDS_REVIEW**

---

### getFreelancerStats(address freelancer)

- **Rationale**: Returns aggregate statistics for a freelancer -- completed milestone count, total earnings, and total milestones submitted. Used by frontends and reputation systems to display a freelancer's on-chain track record.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `completedCount[freelancer]` (line 194), `totalEarned[freelancer]` (line 194), `freelancerMilestones[freelancer].length` (line 194)
  - Calls: none
  - Modifiers: none

- **Findings**:
  1. **LOW -- `totalMilestones` includes all statuses without breakdown**. Line 194: `freelancerMilestones[freelancer].length` counts all milestones regardless of status (Submitted, Approved, Rejected, Disputed). Callers cannot determine the breakdown of approved vs. rejected vs. pending milestones from this function alone. A freelancer with 10 milestones where 9 are rejected would show `totalMilestones = 10` alongside `completed = 1`, which could be misleading without additional context.

  2. **INFO -- No access control**. This is an unrestricted view function, consistent with the design that freelancer statistics are public information for reputation purposes.

  3. **INFO -- Cached counter consistency**. `completedCount` and `totalEarned` are updated in both `approveMilestone` and `resolveDisputedMilestone`. Per the state variable map, these are cached counters with MEDIUM drift risk if future functions modify milestone status without updating them. Currently safe.

- **Verdict**: **SOUND**

---

### getFreelancerMilestoneAt(address freelancer, uint256 index)

- **Rationale**: Returns the milestone ID hash at a specific index in a freelancer's milestone array. Enables paginated or indexed access to a freelancer's milestone portfolio for off-chain enumeration.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `freelancerMilestones[freelancer].length` (line 198), `freelancerMilestones[freelancer][index]` (line 199)
  - Calls: none
  - Modifiers: none

- **Findings**:
  1. **INFO -- Proper bounds checking**. Line 198: `index >= freelancerMilestones[freelancer].length` check reverts with `IndexOutOfBounds()` for out-of-range access. This prevents silent failures and provides a clear error for callers.

  2. **INFO -- No enumeration function exists**. The contract provides indexed access but no function to return the array length directly. Callers must use `getFreelancerStats()` to obtain `totalMilestones` (which is `freelancerMilestones[freelancer].length`) and then iterate with `getFreelancerMilestoneAt()`. This is a minor UX inconvenience but not a security issue.

- **Verdict**: **SOUND**

---

### verifyWorkHash(bytes32 milestoneIdHash, bytes32 workHash)

- **Rationale**: Verifies that a given work hash matches the one stored for a specific milestone. Used for on-chain or off-chain proof that a particular piece of work corresponds to a recorded milestone, enabling cryptographic verification without revealing the work content.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `milestones[milestoneIdHash].workHash` (line 205)
  - Calls: none
  - Modifiers: none

- **Findings**:
  1. **DESIGN_DECISION -- INFO -- Strict equality is intentional for cryptographic hash comparison**. Line 205: `milestones[milestoneIdHash].workHash == workHash` uses strict `==` comparison. Per design decisions, this is intentional and safe for `bytes32` cryptographic hashes where collision probability is negligible. The Slither suppression comment (line 203) confirms this was reviewed.

  2. **INFO -- Returns false for non-existent milestones**. If `milestoneIdHash` does not exist, `milestones[milestoneIdHash].workHash` returns `bytes32(0)`. The function returns `true` only if the caller also passes `bytes32(0)` as `workHash`. This is a valid edge case -- an attacker could not exploit this because a zero workHash has no meaningful cryptographic value.

- **Verdict**: **SOUND**

---

## Cross-Cutting Analysis

### Q1: Are related functions consistent in their state handling?

**Mostly consistent, with one significant gap.**

- `approveMilestone()` and `resolveDisputedMilestone()` perform identical accounting: both set `status = Approved`, set `completedAt`, increment `completedCount`, and add to `totalEarned`. This ensures dispute resolution in the freelancer's favor is equivalent to direct approval for reputation purposes.

- `rejectMilestone()` correctly does NOT update `completedCount` or `totalEarned`, maintaining the invariant that only approved milestones contribute to freelancer statistics.

- **Inconsistency**: `rejectMilestone()` only accepts `Submitted` milestones (line 166). There is no path from `Disputed` to `Rejected`. If a dispute is resolved in the employer's favor, the milestone remains permanently in `Disputed` status. This creates an asymmetry: disputes favoring the freelancer have a clean resolution path (`resolveDisputedMilestone`), but disputes favoring the employer have no corresponding function. The milestone becomes a permanent "zombie" in `Disputed` status.

### Q2: Do inverse operations correctly mirror each other?

**The approval paths mirror each other; the rejection path does not have a dispute-resolution counterpart.**

- `approveMilestone` (Submitted -> Approved) and `rejectMilestone` (Submitted -> Rejected) are proper inverses for the `Submitted` state. Both check the same preconditions (`submittedAt != 0`, `status == Submitted`) and use the same access control pattern (`employer || owner`).

- `resolveDisputedMilestone` (Disputed -> Approved) has no inverse (Disputed -> Rejected). This is the primary asymmetry identified in Q1.

- The state machine is:
  ```
  Submitted ──> Approved   (approveMilestone)
  Submitted ──> Rejected   (rejectMilestone)
  Submitted ──> Disputed   (set externally -- not in this contract)
  Disputed  ──> Approved   (resolveDisputedMilestone)
  Disputed  ──> Rejected   (NO PATH EXISTS)
  Rejected  ──> *          (TERMINAL -- no transitions out)
  ```

### Q3: Are there any invariants that span multiple functions in this domain?

**Yes, several:**

1. **`completedCount[fl]` invariant**: `completedCount[fl]` equals the count of milestones in the `milestones` mapping where `freelancer == fl` AND `status == Approved`. This is maintained by both `approveMilestone` (line 122) and `resolveDisputedMilestone` (line 152) incrementing the counter. If any future function changes a milestone's status to `Approved` without incrementing `completedCount`, this invariant breaks.

2. **`totalEarned[fl]` invariant**: `totalEarned[fl]` equals the sum of `milestones[id].amount` for all approved milestones where `freelancer == fl`. Same maintenance pattern as `completedCount`.

3. **`freelancerMilestones[fl].length` >= `completedCount[fl]`**: The total milestone count always exceeds or equals the completed count, since only a subset of submitted milestones get approved.

4. **`submittedAt != 0` is the existence sentinel**: All state-mutating functions use `submittedAt == 0` to detect non-existent milestones. This invariant is critical -- if any function were to set `submittedAt = 0` on an existing milestone, it would become invisible to the existence check and could be overwritten.

5. **No `Disputed` status setter in this contract**: The `Disputed` status must be set by an external caller (backend relayer or another contract). This means the `Disputed` state is introduced from outside, and `resolveDisputedMilestone` is the only consumer within this contract. The contract trusts that the external system correctly identifies disputes.

### Q4: Is the `employer` omission from `getMilestone()` a systemic issue?

The `employer` address is stored in the `MilestoneRecord` struct (line 42) and is used for access control in `approveMilestone` (line 112) and `rejectMilestone` (line 167), but is not exposed by `getMilestone()`. This forces off-chain systems to capture the employer address at submission time (from the `MilestoneSubmitted` event, which also does not include the employer). The only reliable way to retrieve the employer is to read contract storage directly or reconstruct it from off-chain records. This is a data availability gap.

---

## Summary of Findings

| # | Severity | Function | Finding |
|---|----------|----------|---------|
| 1 | MEDIUM | `submitMilestone` | Owner can supply arbitrary freelancer/employer addresses, enabling fabricated work history |
| 2 | MEDIUM | `resolveDisputedMilestone` | Dispute resolution always favors freelancer -- no path from Disputed to Rejected for employer-favorable outcomes |
| 3 | MEDIUM | `resolveDisputedMilestone` | Emits `MilestoneApproved` event instead of a distinct dispute-resolution event, preventing off-chain differentiation |
| 4 | LOW | `submitMilestone` | No validation on `contractId` parameter (zero value accepted) |
| 5 | LOW | `submitMilestone` | No validation on `workHash` parameter (zero value accepted) |
| 6 | LOW | `submitMilestone` | No upper bound on `amount` parameter |
| 7 | LOW | `submitMilestone` | Unbounded `title` string allows permanent storage bloat |
| 8 | LOW | `rejectMilestone` | Rejected milestone is permanently terminal with no recovery path |
| 9 | LOW | `rejectMilestone` | `getFreelancerStats().totalMilestones` includes rejected milestones without status breakdown |
| 10 | LOW | `getMilestone` | `employer` address is not returned despite being stored in the struct |
| 11 | LOW | `approveMilestone` | `completedAt` uses `uint40` while `submittedAt` uses `uint48` -- inconsistent temporal precision |
| 12 | INFO | `submitMilestone` | Double-submit prevention via `submittedAt != 0` check is correct |
| 13 | INFO | `constructor` | No zero-address check on `msg.sender` is safe since EVM guarantees `msg.sender != address(0)` |
| 14 | INFO | `approveMilestone` | Unchecked increment on `completedCount` is safe for `uint256` |
| 15 | INFO | `verifyWorkHash` | Strict equality for `bytes32` hash comparison is intentional and safe |

---

## Overall Domain Verdict: **NEEDS_REVIEW** (3 MEDIUM, 8 LOW, 4 INFO findings)

The MilestoneRegistry contract is a well-structured record-keeping system with clean separation from the fund-handling `FreelanceEscrow`. The primary concerns are:

1. **Owner privilege scope**: The owner can both submit and approve milestones for arbitrary address pairs, creating a single point of trust for work history integrity. A compromised owner key could fabricate an unlimited number of approved milestones for any freelancer.

2. **Asymmetric dispute resolution**: The state machine provides a clean path for freelancer-favorable dispute outcomes but has no mechanism for employer-favorable outcomes. Disputed milestones that should be rejected remain in limbo.

3. **Event and data gaps**: The reuse of `MilestoneApproved` for dispute resolutions and the omission of `employer` from `getMilestone()` create data availability issues for off-chain consumers.

These findings are consistent with the documented design decisions (trusted owner, backend-mediated workflows) but represent meaningful risks if the trust assumptions are violated.
