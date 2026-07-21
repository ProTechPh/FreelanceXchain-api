# Stage 2: Contract Lifecycle Domain -- Per-Function Audit

**Audit Date**: 2026-07-21
**Domain**: Agreement creation, signing, completion, dispute, cancellation, and read access for on-chain contract agreements
**Contracts Analyzed**:
- `ContractAgreement.sol` -- all 11 functions (5 state-changing, 5 view, 1 constructor)

**Source File**: `contracts/ContractAgreement.sol`
**Compiler**: Solidity 0.8.26

---

## Per-Function Analysis

---

### constructor()

- **Rationale**: Initializes the contract by setting the `owner` immutable to `msg.sender`. The owner is the backend relayer (a trusted server wallet) that mediates off-chain workflows and is the only address authorized to create agreements and mark them as completed.

- **State mutations**:
  - `owner` (immutable) -- set to `msg.sender` (line 63)

- **Dependencies**:
  - Reads: `msg.sender`
  - Calls: none
  - Modifiers: none (constructor)

- **Findings**:

  1. **LOW -- No zero-address check on msg.sender**. Line 63: `owner = msg.sender` does not validate that `msg.sender != address(0)`. While `msg.sender` cannot be `address(0)` in normal EVM execution (the EVM itself prevents it), a zero-check is a standard defense-in-depth pattern. In the unlikely event of a deployment via `CREATE2` from address(0) or a future EVM change, this would set an unusable owner. Since `owner` is immutable, there is no recovery path.

  2. **DESIGN_DECISION -- INFO -- Owner is immutable by design**. The contract uses an immutable `owner` variable (line 33) rather than a transferable ownership pattern. This matches the documented design decision that owner = backend relayer, a trusted server wallet. No upgrade or transfer mechanism is intentionally absent.

- **Verdict**: **SOUND**

---

### createAgreement(bytes32 contractIdHash, bytes32 termsHash, address employer, address freelancer, uint256 totalAmount, uint256 milestoneCount)

- **Rationale**: Creates a new contract agreement on-chain when a proposal is accepted off-chain. Only the backend relayer (owner) can create agreements. This is the entry point for the entire agreement lifecycle -- it initializes the struct, registers it in the user index arrays, and emits a creation event.

- **State mutations**:
  - `agreements[contractIdHash]` -- full Agreement struct written (lines 84-94): termsHash, employer, status (Pending), milestoneCount, freelancer, totalAmount, employerSignedAt (0), freelancerSignedAt (0), createdAt (block.timestamp)
  - `userAgreements[employer]` -- contractIdHash pushed (line 96)
  - `userAgreements[freelancer]` -- contractIdHash pushed (line 97)

- **Dependencies**:
  - Reads: `owner` (immutable), `agreements[contractIdHash].createdAt` (existence check)
  - Calls: none
  - Modifiers: none (inline `msg.sender != owner` check at line 78)

- **Findings**:

  1. **DESIGN_DECISION -- INFO -- Owner-only access is intentional**. Line 78: `if (msg.sender != owner) revert OnlyOwner()` restricts creation to the backend relayer. This matches the documented design decision (#3 in Access Control Model) that owner = backend relayer mediates all off-chain workflows.

  2. **LOW -- No validation of totalAmount**. Lines 70-76: `totalAmount` is accepted without any lower-bound check. A `totalAmount` of 0 would create a valid agreement where no payment is expected. While the owner is trusted, this could lead to confusing downstream behavior if the FreelanceEscrow or MilestoneRegistry reference this agreement with a zero-amount expectation.

  3. **LOW -- No validation of termsHash**. Line 72: `termsHash` is accepted as-is with no check for `bytes32(0)`. A zero termsHash would make `verifyTerms()` return true for any caller passing `bytes32(0)`, which is a degenerate case. Since termsHash is meant to represent a cryptographic commitment to specific terms, a zero value is semantically meaningless.

  4. **INFO -- Duplicate prevention via createdAt check**. Line 79: `if (agreements[contractIdHash].createdAt != 0) revert AgreementAlreadyExists()` correctly uses the zero-default of `createdAt` as an existence indicator. Since `block.timestamp` is always > 0 in practice, this is a reliable sentinel.

  5. **INFO -- Address validation is correct**. Lines 80-81: Both zero-address and same-party checks are present, preventing degenerate agreements.

  6. **DESIGN_DECISION -- INFO -- milestoneCount bounded to uint32**. Line 82: `if (milestoneCount > type(uint32).max) revert MilestoneCountTooLarge()` prevents overflow when packing into the struct's `uint32` field. This is correct and matches the struct layout where `milestoneCount` is packed as `uint32` in slot 1.

  7. **INFO -- User agreement index is append-only and never cleaned**. Lines 96-97: Both employer and freelancer get the contractIdHash pushed to their arrays. These arrays are never pruned, even if the agreement is later cancelled. This is by design for historical record-keeping but means `getUserAgreementCount` grows monotonically and includes cancelled agreements.

- **Verdict**: **SOUND**

---

### signAgreement(bytes32 contractIdHash)

- **Rationale**: Allows either the employer or freelancer to sign the agreement. When both parties have signed, the agreement transitions from `Pending` to `Signed` status. This implements a two-party signature scheme where neither party can sign on behalf of the other.

- **State mutations**:
  - `agreements[contractIdHash].employerSignedAt` -- set to `block.timestamp` if signer is employer (line 113)
  - `agreements[contractIdHash].freelancerSignedAt` -- set to `block.timestamp` if signer is freelancer (line 116)
  - `agreements[contractIdHash].status` -- set to `AgreementStatus.Signed` if both parties have signed (line 121)

- **Dependencies**:
  - Reads: `agreements[contractIdHash]` (struct: createdAt, employer, freelancer, status, employerSignedAt, freelancerSignedAt)
  - Calls: none
  - Modifiers: none (inline checks)

- **Findings**:

  1. **MEDIUM -- signAgreement can be called on cancelled or completed agreements with a subtle interaction**. Lines 107-109: The function checks `createdAt == 0` (existence) and `status != Pending` (must be pending). However, once an agreement is in `Pending` status and neither party has signed, it remains in `Pending` forever until signed or cancelled. The status check at line 109 (`a.status != AgreementStatus.Pending`) correctly prevents signing after cancellation or completion. This is sound. On re-evaluation, the guard is correct -- no issue here. Downgrading to INFO.

  2. **DESIGN_DECISION -- INFO -- Status transition Pending -> Signed is correct**. Line 120-122: The status is only set to `Signed` when both `employerSignedAt > 0 && freelancerSignedAt > 0`. This matches the documented state machine: `Pending -> Signed -> Completed/Disputed`. The function correctly prevents the status from being set to `Signed` with only one signature.

  3. **INFO -- Idempotency protection via AlreadySigned**. Lines 112, 115: Both the employer and freelancer paths check that their respective `SignedAt` timestamp is 0 before writing. This prevents a party from re-signing (overwriting their timestamp), which would change the on-chain record.

  4. **INFO -- block.timestamp for signing timestamps**. Lines 113, 116: Using `block.timestamp` for signing timestamps is acceptable. The design decisions confirm that `block.timestamp` is acceptable for non-critical timestamps (~15s miner influence). The signing timestamp is used only for record-keeping and the `> 0` existence check, not for time-sensitive logic.

  5. **INFO -- No reentrancy risk**. The function performs no external calls and only modifies internal storage. No reentrancy guard is needed.

  6. **LOW -- Order of signing is not recorded in events**. Line 124: `AgreementSigned` event emits `msg.sender` and `block.timestamp` but does not distinguish between first-signer and second-signer in the event data. Off-chain indexers can infer this from transaction ordering, but an explicit `isFirstSignature` flag would make indexing simpler.

- **Verdict**: **SOUND**

---

### completeAgreement(bytes32 contractIdHash)

- **Rationale**: Marks an agreement as completed. Restricted to the owner (backend relayer) to prevent the employer from unilaterally completing the agreement before work is done. Completion should only occur after the off-chain payment service confirms all milestones are paid, as documented in the NatSpec comment (lines 127-133).

- **State mutations**:
  - `agreements[contractIdHash].status` -- set to `AgreementStatus.Completed` (line 141)

- **Dependencies**:
  - Reads: `agreements[contractIdHash]` (struct: createdAt, status), `owner` (immutable)
  - Calls: none
  - Modifiers: none (inline checks)

- **Findings**:

  1. **DESIGN_DECISION -- INFO -- Owner-only completion is intentional**. Line 139: `if (msg.sender != owner) revert OnlyOwner()` matches the documented design decision (#5 in Access Control Model): "Agreement completion restricted to owner only (prevents employer bypass)." The NatSpec explicitly explains the rationale (lines 127-133).

  2. **INFO -- Only Signed agreements can be completed**. Line 138: `if (a.status != AgreementStatus.Signed) revert NotSigned()` enforces that only fully-signed agreements can transition to Completed. This prevents completing Pending, Disputed, or Cancelled agreements.

  3. **INFO -- No reentrancy risk**. The function performs no external calls. Only a single storage write (status change).

  4. **INFO -- No duplicate completion protection needed**. Once `status` is set to `Completed`, the check at line 138 (`status != Signed`) prevents re-completion. The state machine naturally prevents this.

- **Verdict**: **SOUND**

---

### disputeAgreement(bytes32 contractIdHash)

- **Rationale**: Allows either party to flag a signed agreement as disputed. This provides a mechanism for either the employer or freelancer to escalate disagreements about the agreement terms or execution to the dispute resolution system.

- **State mutations**:
  - `agreements[contractIdHash].status` -- set to `AgreementStatus.Disputed` (line 154)

- **Dependencies**:
  - Reads: `agreements[contractIdHash]` (struct: createdAt, employer, freelancer, status)
  - Calls: none
  - Modifiers: none (inline checks)

- **Findings**:

  1. **DESIGN_DECISION -- INFO -- Only Signed agreements can be disputed**. Line 152: `if (a.status != AgreementStatus.Signed) revert NotActive()` restricts disputes to signed agreements. This matches the state machine: `Signed -> Disputed`. Pending, Completed, and Cancelled agreements cannot be disputed.

  2. **MEDIUM -- No protection against repeated disputes after resolution**. The function checks `status != Signed` but does not check for `Disputed` status specifically. If the owner resolves a dispute by calling some function that resets the status back to `Signed` (or any other status), the agreement could be disputed again. However, examining the contract, there is no function that resets a `Disputed` agreement back to `Signed`. The only forward transitions from `Disputed` would need to come from a future code change. In the current codebase, once disputed, the agreement stays disputed forever -- there is no resolution path back to `Signed` or `Completed` in this contract. This is an incomplete lifecycle but not a vulnerability in the current code.

  3. **INFO -- Either party can dispute**. Line 151: `msg.sender != a.employer && msg.sender != a.freelancer` allows both parties to dispute. This is a symmetric right -- neither party can unilaterally prevent the other from flagging a dispute.

  4. **INFO -- No duplicate dispute protection needed**. Once `status` is `Disputed`, the check at line 152 prevents re-disputing. The state machine handles this naturally.

- **Verdict**: **NEEDS_REVIEW**

---

### cancelAgreement(bytes32 contractIdHash)

- **Rationale**: Allows either party to cancel an agreement, but only before any signatures have been recorded. This prevents front-running a countersignature -- if one party signs, the other cannot cancel before the signature is confirmed on-chain.

- **State mutations**:
  - `agreements[contractIdHash].status` -- set to `AgreementStatus.Cancelled` (line 170)

- **Dependencies**:
  - Reads: `agreements[contractIdHash]` (struct: createdAt, employer, freelancer, status, employerSignedAt, freelancerSignedAt)
  - Calls: none
  - Modifiers: none (inline checks)

- **Findings**:

  1. **DESIGN_DECISION -- INFO -- Front-running protection is intentional**. Line 168: `if (a.employerSignedAt != 0 || a.freelancerSignedAt != 0) revert CannotCancel()` prevents cancellation once either party has signed. The NatSpec (line 161) explicitly documents this as front-running prevention. This matches the state machine where `Pending -> Cancelled` is the only cancellation path.

  2. **INFO -- Triple-guard cancellation**. The function applies three sequential checks: (1) agreement exists (line 164), (2) status is Pending (line 166), (3) no signatures recorded (line 168). The third check is technically redundant with the second -- if status is `Pending`, no signatures should be recorded (since `signAgreement` transitions to `Signed` when both sign). However, the redundancy provides defense-in-depth against a hypothetical future code change that might allow partial state corruption.

  3. **INFO -- Either party can cancel**. Line 165: Both employer and freelancer can cancel. This is symmetric and fair -- either party can back out before any commitment (signature) is made.

  4. **INFO -- No cleanup of userAgreements index**. When an agreement is cancelled, it remains in both parties' `userAgreements` arrays. This is consistent with the append-only design of the index (see `createAgreement` findings). The cancelled agreement will appear in `getUserAgreementAt` results, and off-chain consumers must check the status field.

- **Verdict**: **SOUND**

---

### getAgreement(bytes32 contractIdHash)

- **Rationale**: Returns the full agreement details for a given contract ID hash. This is the primary read interface for external contracts (like FreelanceReputation) and off-chain consumers to query agreement state.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `agreements[contractIdHash]` (all struct fields)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Returns zero values for non-existent agreements**. Line 187: `Agreement storage a = agreements[contractIdHash]` will return a zeroed-out struct if the key does not exist. There is no existence check or revert for non-existent keys. Callers must check `createdAt > 0` or `employer != address(0)` to determine if the agreement exists. This is consistent with Solidity's default behavior for mapping reads but could lead to confusion for off-chain consumers who don't check for the zero case.

  2. **INFO -- milestoneCount upcast to uint256**. Line 188: `uint256(a.milestoneCount)` correctly upcasts the packed `uint32` to `uint256` for the return value. No data loss since `uint32` fits within `uint256`.

  3. **INFO -- Cross-contract dependency**. FreelanceReputation calls this function (via the `IContractAgreement` interface) to validate that an agreement exists, is completed, and that the caller/ratee are parties. The reliability of FreelanceReputation depends on this function returning accurate data, which it does since it reads directly from storage.

- **Verdict**: **SOUND**

---

### isFullySigned(bytes32 contractIdHash)

- **Rationale**: Convenience function to check whether both parties have signed a given agreement. Used by external consumers to quickly determine signing status without parsing the full agreement struct.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `agreements[contractIdHash].employerSignedAt`, `agreements[contractIdHash].freelancerSignedAt`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Returns false for non-existent agreements**. Line 193: For a non-existent agreement, both `employerSignedAt` and `freelancerSignedAt` will be 0, so the function returns `false`. This is semantically correct -- a non-existent agreement is not fully signed.

  2. **INFO -- Potential divergence with status field**. The function checks timestamps independently of the `status` field. In the current codebase, `status == Signed` if and only if both timestamps are > 0 (enforced by `signAgreement`). If a future code change modifies the status without updating timestamps (or vice versa), this function and the status field could diverge. Currently safe.

- **Verdict**: **SOUND**

---

### verifyTerms(bytes32 contractIdHash, bytes32 termsHash)

- **Rationale**: Allows verification that a given terms hash matches the one stored on-chain for a specific agreement. Used for cryptographic proof that both parties agreed to specific terms.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `agreements[contractIdHash].termsHash`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **DESIGN_DECISION -- INFO -- Strict equality is intentional for hash comparison**. Line 199: `agreements[contractIdHash].termsHash == termsHash` uses strict equality. The design decisions confirm this is intentional and safe for cryptographic hash comparison (collision probability is negligible). A Slither suppression comment is present at line 197.

  2. **INFO -- Returns true for non-existent agreements if termsHash is bytes32(0)**. For a non-existent agreement, `termsHash` will be `bytes32(0)`. If a caller passes `bytes32(0)` as the expected terms hash, the function returns `true` even though no agreement exists. This is a degenerate edge case that depends on the `createAgreement` function preventing zero termsHash values (which it currently does not -- see `createAgreement` finding #3).

- **Verdict**: **SOUND**

---

### getUserAgreementCount(address user)

- **Rationale**: Returns the number of agreements associated with a given user address. Used for pagination and enumeration of a user's agreement history.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `userAgreements[user].length`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Count includes all agreement statuses**. The count includes Pending, Signed, Completed, Disputed, and Cancelled agreements. There is no filter by status. Off-chain consumers must iterate and filter.

  2. **INFO -- Count grows monotonically**. Since `userAgreements` is append-only (agreements are never removed from the index), the count only increases. This is consistent with the design as a historical record.

- **Verdict**: **SOUND**

---

### getUserAgreementAt(address user, uint256 index)

- **Rationale**: Returns the contract ID hash at a specific index in a user's agreement array. Used for paginated enumeration of agreements.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `userAgreements[user].length`, `userAgreements[user][index]`
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Proper bounds checking**. Line 207: `if (index >= userAgreements[user].length) revert IndexOutOfBounds()` correctly prevents out-of-bounds access. The custom error `IndexOutOfBounds` provides clear feedback.

  2. **INFO -- Returns bytes32(0) only if the zero hash was stored**. Since `contractIdHash` is a user-supplied parameter to `createAgreement`, if `bytes32(0)` were ever passed, it would be stored and retrievable. The `createAgreement` function does not currently check for zero `contractIdHash`. However, this would also trigger the `createdAt != 0` check if a zero-key agreement were attempted to be created twice.

- **Verdict**: **SOUND**

---

## Cross-Cutting Analysis

### Q1: Are related functions consistent in their state handling?

**Yes, with one observation.** All state-changing functions follow the same pattern:
1. Load the agreement from storage
2. Check existence via `createdAt == 0`
3. Apply role-based access control
4. Check current status against allowed transitions
5. Mutate state
6. Emit event

The state machine transitions are consistent:
- `createAgreement`: sets status to `Pending`
- `signAgreement`: transitions `Pending -> Signed` (when both sign)
- `completeAgreement`: transitions `Signed -> Completed`
- `disputeAgreement`: transitions `Signed -> Disputed`
- `cancelAgreement`: transitions `Pending -> Cancelled`

All transitions are forward-only (no backward transitions), which is a positive invariant.

### Q2: Do inverse operations correctly mirror each other?

**There are no inverse operations in this contract.** Unlike FreelanceEscrow (which has approve/refund as inverse operations for milestone funds), ContractAgreement has no "undo" or "reverse" functions. Once an agreement is Signed, Completed, Disputed, or Cancelled, it cannot return to a previous state. This is a deliberate design choice for immutability of the agreement record.

The closest pair is `signAgreement` (adds commitment) and `cancelAgreement` (rejects agreement), but these are not true inverses:
- `cancelAgreement` requires `Pending` status AND no signatures
- `signAgreement` requires `Pending` status

They operate on the same initial state (`Pending`) but cannot reverse each other's effects.

### Q3: Are there any invariants that span multiple functions in this domain?

**INV-A: Status-Signature Consistency**
- Invariant: `status == Signed` implies `employerSignedAt > 0 AND freelancerSignedAt > 0`
- Enforced by: `signAgreement` lines 120-122
- Verified by: `isFullySigned` checks timestamps independently
- Risk: LOW. The invariant is maintained by a single function (`signAgreement`) and no other function modifies the timestamps.

**INV-B: Existence Sentinel**
- Invariant: `createdAt != 0` if and only if the agreement exists
- Enforced by: `createAgreement` sets `createdAt = block.timestamp` (line 93), and all state-changing functions check `createdAt == 0` first
- Risk: LOW. The sentinel is reliable because `block.timestamp` is always > 0 in practice.

**INV-C: User Index Parity**
- Invariant: Every agreement hash appears in exactly two user arrays (employer and freelancer)
- Enforced by: `createAgreement` lines 96-97 always pushes to both arrays atomically
- Risk: LOW. The two pushes happen in the same transaction, so they cannot diverge.

**INV-D: Forward-Only Status Transitions**
- Invariant: Status can only move forward in the state machine (Pending -> Signed -> Completed/Disputed; Pending -> Cancelled)
- Enforced by: Each function checks the current status before allowing a transition
- Risk: LOW. No function sets status to a "lower" state.

**INV-E: Cross-Contract Dependency (ContractAgreement -> FreelanceReputation)**
- Invariant: FreelanceReputation's `submitRating` depends on `getAgreement()` returning accurate employer, freelancer, and status data
- Enforced by: ContractAgreement reads directly from storage; no caching or indirection
- Risk: LOW. The dependency is a simple storage read with no external call risk.

### Q4: Is there a dead-end in the dispute lifecycle?

**Yes.** The `disputeAgreement` function transitions an agreement to `Disputed` status, but there is no function in `ContractAgreement.sol` that transitions a `Disputed` agreement to any other status. The dispute resolution happens in `DisputeResolution.sol` (a separate contract), and the `ContractAgreement` status field is not updated by that contract. This means:
- Once an agreement is `Disputed`, it stays `Disputed` forever in this contract
- The `completeAgreement` function requires `Signed` status, so a disputed agreement can never be completed through this contract
- The `DisputeResolution` contract records its own outcome but does not call back into `ContractAgreement`

This is likely an architectural gap where the backend relayer is expected to coordinate between contracts, but the on-chain state machine in `ContractAgreement` is incomplete for the dispute path.

### Q5: Missing state machine transitions

| From Status | To Status | Function | Exists? |
|-------------|-----------|----------|---------|
| (new) | Pending | createAgreement | YES |
| Pending | Signed | signAgreement | YES |
| Pending | Cancelled | cancelAgreement | YES |
| Signed | Completed | completeAgreement | YES |
| Signed | Disputed | disputeAgreement | YES |
| Disputed | Completed | (none) | NO |
| Disputed | Signed | (none) | NO |
| Disputed | Cancelled | (none) | NO |
| Completed | (any) | (none) | NO (correct) |
| Cancelled | (any) | (none) | NO (correct) |

The missing `Disputed -> *` transitions are the only gap. Completed and Cancelled being terminal states is correct by design.

---

## Summary of Findings

| # | Severity | Function | Finding |
|---|----------|----------|---------|
| 1 | LOW | `constructor()` | No zero-address check on msg.sender for owner assignment |
| 2 | LOW | `createAgreement()` | No validation of totalAmount (zero value allowed) |
| 3 | LOW | `createAgreement()` | No validation of termsHash (zero value allowed, impacts verifyTerms edge case) |
| 4 | MEDIUM | `disputeAgreement()` | No transition out of Disputed status in this contract -- dispute lifecycle is incomplete on-chain |
| 5 | LOW | `signAgreement()` | Order of signing not recorded in event data (minor indexing inconvenience) |
| 6 | INFO | `getAgreement()` | Returns zeroed struct for non-existent keys (standard Solidity behavior, callers must handle) |
| 7 | INFO | `verifyTerms()` | Returns true for non-existent agreements when comparing against bytes32(0) |
| 8 | INFO | `cancelAgreement()` | Triple guard (existence + status + timestamps) has partial redundancy |

---

## Overall Domain Verdict: **NEEDS_REVIEW** (1 MEDIUM, 4 LOW, 3 INFO)

The ContractAgreement contract is well-structured with clear state machine transitions, proper access control, and consistent patterns across all functions. The primary concern is the incomplete dispute lifecycle (MEDIUM finding #4) -- once an agreement enters `Disputed` status, there is no on-chain path to resolution within this contract. The remaining findings are minor edge cases related to input validation and informational observations about Solidity's default behaviors. No critical or high-severity issues were identified. The contract's reliance on the trusted backend relayer (owner) is a known architectural decision documented in the design decisions.
