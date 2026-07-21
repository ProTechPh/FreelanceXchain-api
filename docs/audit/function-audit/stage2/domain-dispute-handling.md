# Stage 2: Dispute Handling Domain -- Per-Function Audit

**Audit Date**: 2026-07-21
**Domain**: Dispute creation, evidence submission, dispute resolution, dispute status queries, user dispute statistics
**Contracts Analyzed**:
- `DisputeResolution.sol` -- all external, public, and internal functions

**Prior Art Read**:
- `stage1/state-variable-map.md` -- S14 (disputes), S15 (userDisputes), S16 (disputeStats)
- `stage1/access-control-map.md` -- Section 4 (DisputeResolution roles and access patterns)
- `stage1/external-call-map.md` -- Confirms zero external calls in DisputeResolution
- `stage0/design-decisions.md` -- Decisions #3 (owner = backend relayer), #4 (resolveDispute owner-only), state machine #3 (DisputeOutcome transitions), known trade-off #4 (Cancelled does NOT update stats)

---

## Per-Function Analysis

---

### constructor()

- **Rationale**: Deploys the DisputeResolution contract and sets the immutable `owner` address that will serve as the backend relayer / admin for all privileged operations (creating disputes on behalf of users, resolving disputes, submitting evidence).

- **State mutations**:
  - `owner` (immutable) -- set to `msg.sender` at line 68

- **Dependencies**:
  - Reads: `msg.sender`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- DESIGN_DECISION -- Owner set to msg.sender matches documented pattern**. Line 68: `owner = msg.sender`. This matches the design decision that `owner` is the backend relayer (immutable, set in constructor), consistent with ContractAgreement and MilestoneRegistry constructors. The `immutable` keyword saves ~2100 gas per `onlyOwner` check compared to a storage read.

  2. **INFO -- No zero-address check on msg.sender**. Line 68: `owner = msg.sender` does not validate `msg.sender != address(0)`. In practice, `msg.sender` cannot be `address(0)` in any valid EVM transaction, so this is not exploitable. Consistent with the same pattern in ContractAgreement and MilestoneRegistry constructors.

- **Verdict**: **SOUND**

---

### createDispute(bytes32 disputeIdHash, bytes32 contractId, bytes32 milestoneId, address initiator, address freelancer, address employer, uint256 amount)

- **Rationale**: Creates a new on-chain dispute record linking a contract and milestone to a dispute between a freelancer and employer. Serves as the immutable ledger entry for the dispute lifecycle. Both the initiator and the freelancer/employer are added to their respective `userDisputes` indices for enumeration.

- **State mutations**:
  - `disputes[disputeIdHash].contractId` -- set to `contractId` (line 92)
  - `disputes[disputeIdHash].milestoneId` -- set to `milestoneId` (line 93)
  - `disputes[disputeIdHash].initiator` -- set to `initiator` (line 94)
  - `disputes[disputeIdHash].outcome` -- set to `DisputeOutcome.Pending` (line 95)
  - `disputes[disputeIdHash].createdAt` -- set to `uint48(block.timestamp)` (line 96)
  - `disputes[disputeIdHash].resolvedAt` -- set to `0` (line 97)
  - `disputes[disputeIdHash].freelancer` -- set to `freelancer` (line 98)
  - `disputes[disputeIdHash].employer` -- set to `employer` (line 99)
  - `disputes[disputeIdHash].arbiter` -- set to `address(0)` (line 100)
  - `disputes[disputeIdHash].amount` -- set to `amount` (line 101)
  - `disputes[disputeIdHash].reasoning` -- set to `""` (line 102)
  - `userDisputes[freelancer]` -- `disputeIdHash` pushed (line 105)
  - `userDisputes[employer]` -- `disputeIdHash` pushed (line 106)

- **Dependencies**:
  - Reads: `disputes[disputeIdHash].createdAt` (existence check), `msg.sender`, `owner`
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:

  1. **INFO -- DESIGN_DECISION -- Access control matches documented pattern**. Lines 88-89: `msg.sender != initiator && msg.sender != owner` combined with `initiator != freelancer && initiator != employer`. The owner can create disputes on behalf of any party, matching design decision that owner is the backend relayer with full admin power. The `initiator` must be a dispute party (freelancer or employer), preventing creation of disputes with a non-party as initiator.

  2. **INFO -- Duplicate prevention via createdAt check is sound**. Line 84: `disputes[disputeIdHash].createdAt != 0` reverts with `DisputeAlreadyExists()`. Since `createdAt` is set to `block.timestamp` (non-zero for any mined block), this correctly prevents re-creation of the same dispute. The only theoretical edge case is if `block.timestamp == 0`, which cannot occur on any live chain.

  3. **MEDIUM -- No validation that contractId or milestoneId reference real on-chain data**. Lines 92-93: `contractId` and `milestoneId` are stored as opaque `bytes32` values with no cross-contract validation. The owner (backend relayer) could create disputes referencing non-existent contracts or milestones, producing orphaned dispute records. While the backend is trusted to supply correct values, there is no on-chain safety net. This is a trust assumption documented in the state variable map (S14 duplication risk).

  4. **INFO -- Zero-value parameter validation is present for addresses**. Lines 85-87: `initiator`, `freelancer`, and `employer` are all checked against `address(0)`. The `amount` parameter is NOT validated for zero, which means a dispute with `amount = 0` can be created. This may be intentional (the contract only records disputes, it does not hold funds), but consumers should be aware.

  5. **INFO -- DESIGN_DECISION -- Initiator must be a dispute party**. Line 89: `initiator != freelancer && initiator != employer` reverts with `InitiatorMustBeParty()`. This prevents the owner from creating disputes with a non-party as the named initiator, even though the owner can create disputes on behalf of parties.

  6. **LOW -- Initiator address is not validated against msg.sender when owner creates dispute**. When `msg.sender == owner`, the `initiator` parameter is accepted without verifying that the actual `initiator` address consented to the dispute. The owner could fabricate disputes attributed to any party. This is consistent with the owner's documented trust level but worth noting as an operational risk.

- **Verdict**: **NEEDS_REVIEW**

---

### submitEvidence(bytes32 disputeIdHash, bytes32 evidenceHash)

- **Rationale**: Allows dispute parties or the contract owner to append evidence hashes to an existing dispute's evidence log. The append-only design ensures evidence cannot be tampered with or removed once submitted, providing an immutable audit trail.

- **State mutations**:
  - `disputes[disputeIdHash].evidenceHashes` -- `evidenceHash` appended (line 121)

- **Dependencies**:
  - Reads: `disputes[disputeIdHash].createdAt` (existence check, line 117), `disputes[disputeIdHash].outcome` (resolution check, line 118), `disputes[disputeIdHash].freelancer` (access check, line 119), `disputes[disputeIdHash].employer` (access check, line 119), `msg.sender`, `owner`
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:

  1. **INFO -- Access control correctly restricts to dispute parties and owner**. Line 119: `msg.sender != d.freelancer && msg.sender != d.employer && msg.sender != owner`. This allows both parties to submit evidence and the owner (backend relayer) to submit on their behalf. Matches the documented access pattern.

  2. **INFO -- State machine transition enforced**. Line 118: `d.outcome != DisputeOutcome.Pending` reverts with `AlreadyResolved()`. Evidence can only be submitted while the dispute is in Pending state, preventing post-resolution evidence tampering. This matches the documented state machine: `Pending -> FreelancerFavor/EmployerFavor/Split/Cancelled`.

  3. **INFO -- Append-only design prevents evidence tampering**. Line 121: `d.evidenceHashes.push(evidenceHash)` only appends. There is no function to modify or delete evidence, ensuring the evidence log is immutable once the dispute is created.

  4. **LOW -- No evidence count limit**. The `evidenceHashes` array can grow without bound. A malicious party (or the owner) could submit an excessive number of evidence hashes, making the `evidenceHashes` array very large. While this does not affect contract security (no iteration over the array in any function), it increases storage costs and could cause `getEvidenceCount` / `getEvidenceAt` queries to return large datasets. The append-only nature means this cannot be undone.

  5. **INFO -- No duplicate evidence prevention**. The same `evidenceHash` can be submitted multiple times. This is likely intentional (evidence may be re-submitted for emphasis or after correction), but consumers should be aware that the evidence log is not de-duplicated.

  6. **INFO -- The initiator is NOT restricted from submitting evidence**. The access check at line 119 checks `d.freelancer` and `d.employer`, not `d.initiator`. Since the initiator is always one of these two parties (enforced in `createDispute`), this is functionally correct. The initiator can always submit evidence.

- **Verdict**: **SOUND**

---

### resolveDispute(bytes32 disputeIdHash, DisputeOutcome outcome, string calldata reasoning, address arbiter)

- **Rationale**: Allows the contract owner (backend relayer) to finalize a dispute with a specific outcome, record the arbiter who made the decision, attach reasoning, and update win/loss/split statistics for both parties. This is the terminal state transition for any dispute.

- **State mutations**:
  - `disputes[disputeIdHash].outcome` -- set to `outcome` (line 142)
  - `disputes[disputeIdHash].reasoning` -- set to `reasoning` (line 143)
  - `disputes[disputeIdHash].arbiter` -- set to `arbiter` (line 144)
  - `disputes[disputeIdHash].resolvedAt` -- set to `uint48(block.timestamp)` (line 145)
  - `disputeStats[_freelancer].won++` -- if `outcome == FreelancerFavor` (line 153)
  - `disputeStats[_employer].lost++` -- if `outcome == FreelancerFavor` (line 154)
  - `disputeStats[_employer].won++` -- if `outcome == EmployerFavor` (line 156)
  - `disputeStats[_freelancer].lost++` -- if `outcome == EmployerFavor` (line 157)
  - `disputeStats[_freelancer].split++` -- if `outcome == Split` (line 159)
  - `disputeStats[_employer].split++` -- if `outcome == Split` (line 160)
  - (No stats updated if `outcome == Cancelled` -- line 162 comment confirms intentional)

- **Dependencies**:
  - Reads: `msg.sender`, `owner`, `disputes[disputeIdHash]` (createdAt, outcome, freelancer, employer)
  - Calls: none
  - Modifiers: none (inline access control)

- **Findings**:

  1. **INFO -- DESIGN_DECISION -- Owner-only access matches documented pattern**. Line 135: `msg.sender != owner` reverts with `OnlyOwner()`. This matches design decision #4: "Dispute resolution restricted to owner only (not arbiter role)." The `arbiter` parameter is an address recorded for attribution only, not a role that can call this function.

  2. **INFO -- DESIGN_DECISION -- Cancelled outcome intentionally does not update stats**. Lines 161-163: The `else` branch for `DisputeOutcome.Cancelled` contains only a comment. This matches design decision: "DisputeOutcome.Cancelled intentionally does NOT update win/loss stats." The consequence is that `won + lost + split < userDisputes[user].length` when cancelled disputes exist.

  3. **MEDIUM -- Owner can set arbitrary arbiter address**. Line 144: `d.arbiter = arbiter` accepts any non-zero address as the arbiter of record. The owner could set themselves, a random address, or an address that was not the actual decision-maker. This is a trust assumption -- the owner is fully trusted -- but it means the `arbiter` field has no on-chain integrity guarantee. Consumers relying on the arbiter field for accountability should be aware. Matches GAP-6 from the access control map.

  4. **INFO -- State machine transition correctly enforced**. Lines 138-140: Three checks ensure valid transitions: dispute must exist (`createdAt != 0`), must be Pending, and outcome must not be Pending. This enforces the documented transition `Pending -> FreelancerFavor/EmployerFavor/Split/Cancelled` with no possibility of re-resolution.

  5. **INFO -- Gas optimization: cached storage reads**. Lines 148-149: `_freelancer` and `_employer` are cached in local variables to avoid repeated SLOAD operations when updating disputeStats. This is a documented gas optimization.

  6. **INFO -- DisputeStats uint64 overflow is not a practical concern**. The `DisputeStats` struct uses `uint64` fields (max ~1.8e19). Even at 1 million disputes per year, overflow would take approximately 18 billion years. No overflow protection is needed.

  7. **LOW -- Owner can resolve dispute with zero evidence submitted**. There is no requirement that at least one piece of evidence exists before resolution. The owner can resolve a dispute immediately after creation with no evidence. While this is consistent with the owner's full trust level, it means the evidence submission process is advisory only -- the owner can ignore it entirely.

  8. **INFO -- String reasoning is stored on-chain**. Line 143: `d.reasoning = reasoning` stores the full reasoning string in storage. Since `reasoning` is `calldata`, the string data is written to a new storage slot. For very long reasoning strings, this could be expensive in gas, but it provides an immutable on-chain record of the resolution rationale.

- **Verdict**: **NEEDS_REVIEW**

---

### getDispute(bytes32 disputeIdHash)

- **Rationale**: Public view function that returns the core dispute record fields for external consumers. Provides a structured read of the dispute state without exposing internal struct layout.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `disputes[disputeIdHash]` (all fields: contractId, milestoneId, initiator, freelancer, employer, amount, outcome, createdAt, resolvedAt)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Returns default values for non-existent disputes**. Line 182: If `disputeIdHash` does not exist, the mapping returns a zero-initialized `DisputeRecord`. All returned values will be zero/empty: `contractId = 0x0`, `initiator = address(0)`, `createdAt = 0`, etc. Callers must check `createdAt != 0` to distinguish a real dispute from a non-existent one. There is no explicit revert for missing disputes.

  2. **INFO -- Reasoning and arbiter are not exposed**. The return tuple does not include `reasoning` or `arbiter`. Consumers needing these fields would need to access the `disputes` mapping directly (the auto-generated getter for the mapping does expose all struct fields, but the named `getDispute` function does not).

  3. **INFO -- uint48 to uint256 upcasting is safe**. Lines 182: `uint256(d.createdAt)` and `uint256(d.resolvedAt)` safely widen the uint48 values to uint256 with no precision loss. This provides a consistent return type for consumers.

- **Verdict**: **SOUND**

---

### getEvidenceCount(bytes32 disputeIdHash)

- **Rationale**: Returns the number of evidence hashes submitted for a given dispute. Used by off-chain UIs and indexers to determine how many evidence items exist before iterating with `getEvidenceAt`.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `disputes[disputeIdHash].evidenceHashes.length`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **LOW -- Returns 0 for non-existent disputes, indistinguishable from zero-evidence disputes**. Line 186: If `disputeIdHash` does not exist, the mapping returns an empty `DisputeRecord` with `evidenceHashes.length == 0`. A dispute that exists but has no evidence submitted also returns 0. Callers cannot distinguish "dispute does not exist" from "dispute exists with no evidence" using this function alone. They must combine this with `getDispute()` to check existence first. Consider reverting with `DisputeNotFound()` when `createdAt == 0` for consistency with `submitEvidence` and `resolveDispute`.

- **Verdict**: **NEEDS_REVIEW**

---

### getEvidenceAt(bytes32 disputeIdHash, uint256 index)

- **Rationale**: Returns the evidence hash at a specific index in a dispute's evidence log. Used by off-chain UIs to display evidence items. Combined with `getEvidenceCount`, this enables full enumeration of the evidence log.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `disputes[disputeIdHash].evidenceHashes` (length for bounds check, element at index)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Bounds check correctly prevents out-of-range access**. Line 191: `index >= d.evidenceHashes.length` reverts with `IndexOutOfBounds()`. This correctly prevents reading beyond the array bounds, which would return uninitialized storage data.

  2. **LOW -- Returns default bytes32(0) for non-existent dispute with index 0**. If `disputeIdHash` does not exist, `d.evidenceHashes.length` is 0, so any index (including 0) will revert with `IndexOutOfBounds()`. This is actually correct behavior -- the bounds check handles the non-existent dispute case implicitly. No action needed; this finding documents the analysis.

- **Verdict**: **SOUND**

---

### getUserDisputeStats(address user)

- **Rationale**: Returns aggregated dispute statistics for a user: wins, losses, splits, and total dispute count. Used by off-chain UIs to display a user's dispute history summary.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `disputeStats[user]` (won, lost, split), `userDisputes[user].length`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- DESIGN_DECISION -- Total count includes cancelled and pending disputes**. Line 197: `total` returns `userDisputes[user].length`, which includes ALL disputes the user is party to (including pending and cancelled). The `won + lost + split` values only count resolved non-cancelled disputes. This means `won + lost + split < total` when cancelled or pending disputes exist. This is by design per the documented decision that Cancelled does not update stats.

  2. **LOW -- Mismatch between total and sum of resolved stats may confuse consumers**. A consumer expecting `won + lost + split == total` will find a discrepancy whenever cancelled or pending disputes exist. The function provides no way to determine how many disputes are cancelled vs. pending. Consider adding a `cancelled` or `pending` count for completeness, or documenting this clearly in the NatSpec.

  3. **INFO -- uint64 to uint256 upcasting is safe**. Line 196: `uint256(s.won)`, `uint256(s.lost)`, `uint256(s.split)` safely widen the uint64 values to uint256. No precision loss.

- **Verdict**: **SOUND**

---

### isResolved(bytes32 disputeIdHash)

- **Rationale**: Convenience function that checks whether a dispute has been resolved (outcome is no longer Pending). Used by off-chain systems to quickly determine dispute status without loading the full record.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `disputes[disputeIdHash].outcome`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **LOW -- Returns false for non-existent disputes**. Line 201: `disputes[disputeIdHash].outcome != DisputeOutcome.Pending` evaluates to `false` when the dispute does not exist (default outcome is `Pending`, which is enum value 0). A non-existent dispute and a pending dispute are indistinguishable. Callers should verify dispute existence via `getDispute().createdAt != 0` before relying on `isResolved`. Consider reverting with `DisputeNotFound()` when `createdAt == 0` for better safety.

  2. **INFO -- Functionally equivalent to checking outcome != Pending**. The function is a thin wrapper around a single storage read. It provides no additional logic beyond what `getDispute().outcome != Pending` would yield. Its value is convenience and gas savings (reads only 1 slot instead of 9).

- **Verdict**: **SOUND**

---

## Cross-Cutting Analysis

### Q1: Are related functions consistent in their state handling?

**Mostly yes, with one inconsistency.** The state-changing functions (`createDispute`, `submitEvidence`, `resolveDispute`) all use `createdAt == 0` as the existence check and `outcome != Pending` as the resolution check. These checks are consistent across all three functions.

However, the view functions (`getDispute`, `getEvidenceCount`, `getEvidenceAt`, `getUserDisputeStats`, `isResolved`) do NOT perform existence checks. They return default/zero values for non-existent disputes. This creates an inconsistency: `submitEvidence` reverts with `DisputeNotFound()` for a non-existent dispute, but `getEvidenceCount` returns 0 for the same non-existent dispute. This asymmetry could confuse off-chain consumers who use view functions to probe for dispute existence.

### Q2: Are there any invariants that span multiple functions in this domain?

**Yes, the following invariants hold:**

1. **Existence invariant**: `disputes[id].createdAt != 0` if and only if the dispute was created via `createDispute`. This is the universal existence check used by all state-changing functions.

2. **Resolution invariant**: `disputes[id].outcome != Pending` if and only if `resolveDispute` was called. Once resolved, the outcome cannot be changed (no re-resolution path exists).

3. **Party invariant**: `disputes[id].initiator` is always either `disputes[id].freelancer` or `disputes[id].employer`. Enforced at creation time (line 89) and never modified afterward.

4. **Stats invariant**: For any resolved dispute with outcome `FreelancerFavor`, `disputeStats[freelancer].won` and `disputeStats[employer].lost` are each incremented by exactly 1. For `EmployerFavor`, the reverse. For `Split`, both `split` counters are incremented. For `Cancelled`, no counters change.

5. **User index invariant**: Each created dispute appears in exactly two `userDisputes` arrays: the freelancer's and the employer's. The initiator's `userDisputes` array is NOT updated (the initiator is always one of the two parties, so they already get the entry via their party role).

6. **Evidence invariant**: `disputes[id].evidenceHashes` is append-only. No function exists to modify or delete entries. The array can only grow.

### Q3: Is there a risk of cross-function state corruption?

**No.** DisputeResolution makes zero external calls (confirmed by the external call map). All state mutations are atomic within a single transaction. The only writer functions (`createDispute`, `submitEvidence`, `resolveDispute`) do not call each other and have no shared intermediate state. The `disputeStats` mapping is only written by `resolveDispute`, eliminating cross-write contention.

### Q4: Does the DisputeResolution contract interact correctly with other contracts?

**By design, it does not interact with other contracts at all.** The `contractId` and `milestoneId` fields are opaque references stored for off-chain correlation. The actual fund distribution happens in `FreelanceEscrow.resolveDispute`, which is a separate function with separate access control (arbiter role). The backend relayer is responsible for coordinating the two resolution calls. This loose coupling is documented in the state variable map (INV-3: DisputeResolution <-> FreelanceEscrow).

---

## Summary of Findings

| # | Severity | Function | Finding |
|---|----------|----------|---------|
| 1 | MEDIUM | `createDispute()` | No validation that contractId or milestoneId reference real on-chain data; owner can create orphaned disputes |
| 2 | LOW | `createDispute()` | Owner can fabricate disputes attributed to any party without the initiator's consent |
| 3 | LOW | `submitEvidence()` | No evidence count limit; unbounded array growth possible |
| 4 | MEDIUM | `resolveDispute()` | Owner can set arbitrary arbiter address with no on-chain integrity guarantee |
| 5 | LOW | `resolveDispute()` | Owner can resolve disputes with zero evidence submitted |
| 6 | LOW | `getEvidenceCount()` | Returns 0 for non-existent disputes, indistinguishable from zero-evidence disputes |
| 7 | LOW | `getUserDisputeStats()` | `total` includes cancelled/pending disputes but `won + lost + split` does not, creating a mismatch |
| 8 | LOW | `isResolved()` | Returns false for non-existent disputes, indistinguishable from pending disputes |

---

## Overall Domain Verdict: **NEEDS_REVIEW** (2 MEDIUM, 6 LOW findings)

The DisputeResolution contract is a purely administrative record-keeping system with no fund handling, no external calls, and no reentrancy surface. The two MEDIUM findings relate to the owner's unchecked ability to create orphaned disputes and set arbitrary arbiters -- both of which are trust assumptions that match the documented design (owner = trusted backend relayer). The LOW findings are primarily about view function behavior for non-existent disputes and the absence of guardrails on evidence count and resolution evidence requirements. No CRITICAL or HIGH findings were identified. The contract's state machine is correctly enforced, and all state-changing functions have appropriate access control.
