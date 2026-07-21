# External Call Map -- FreelanceXchain Smart Contracts

**Audit Date:** 2026-07-21
**Compiler:** Solidity 0.8.26
**Contracts Analyzed:** FreelanceEscrow, ContractAgreement, MilestoneRegistry, DisputeResolution, FreelanceReputation

---

## Summary

| Metric | Count |
|--------|-------|
| Total external calls | 6 |
| Low-level `.call{value:}` (ETH transfers) | 5 |
| Cross-contract view calls | 1 |
| Delegatecalls | 0 |
| Contracts with zero external calls | 3 |

**Contracts with NO external calls:**
- `ContractAgreement` -- purely state management
- `MilestoneRegistry` -- purely state management
- `DisputeResolution` -- purely state management

---

## Contract: FreelanceEscrow

All external calls in this contract are low-level `.call{value:}("")` invocations for ETH transfers. There are no ABI-encoded cross-contract calls. The contract uses a custom reentrancy guard (`_status` uint8 toggle) on all functions that perform external calls.

---

### Call #1 -- Constructor: Excess ETH Refund to `msg.sender`

| Field | Detail |
|-------|--------|
| **Caller function** | `constructor()` -- line 167 |
| **Target** | `msg.sender` (employer) |
| **Call syntax** | `msg.sender.call{value: excess}("")` |
| **Arguments** | Empty calldata `""`, value = `msg.value - totalAmount` |
| **Return handling** | `(bool refundSuccess, )` -- success flag checked; reverts with `ExcessRefundFailed()` on failure |

**State changes before call:**
- All milestone structs written to storage (lines 147-153)
- `totalAmount` set (immutable, line 156)
- `isActive` set to `true` (line 141)
- `_status` set to `ENTERED` (line 166) -- reentrancy guard engaged

**State changes after call:**
- `_status` set back to `NOT_ENTERED` (line 168)
- Event `ExcessRefunded` emitted (line 170)

**CEI Compliance:** PASS -- All state mutations occur before the external call. `_status` is explicitly set to `ENTERED` before the call and `NOT_ENTERED` after, wrapping the external call in the reentrancy guard even though no `nonReentrant` modifier exists on the constructor.

**Reentrancy Risk:** LOW -- The `_status` guard prevents re-entry into any `nonReentrant` function. However, there are no state-modifying functions callable during construction anyway. If `msg.sender` is a contract that re-enters the constructor logic, it would fail because the contract is already deployed. The guard is a defensive best practice.

**Trust Level:** MEDIUM -- `msg.sender` is the employer who deploys the contract. While typically an EOA, it could be a contract wallet. The reentrancy guard handles this case.

---

### Call #2 -- `approveMilestone`: Payment to Freelancer

| Field | Detail |
|-------|--------|
| **Caller function** | `approveMilestone(uint256 milestoneIndex)` -- line 205 |
| **Target** | `freelancer` (immutable address) |
| **Call syntax** | `freelancer.call{value: amt}("")` |
| **Arguments** | Empty calldata `""`, value = `milestone.amount` |
| **Return handling** | `(bool success, )` -- checked; reverts with `TransferFailed()` on failure |
| **Modifier chain** | `onlyEmployer`, `contractActive`, `nonReentrant` |

**State changes before call:**
- `milestone.status` set to `Approved` (line 195)
- `releasedAmount` incremented by `amt` (line 197)
- `isActive` set to `false` if total milestones settled (lines 200-202)
- `_status` set to `ENTERED` via `nonReentrant` modifier (line 89)

**State changes after call:**
- Event `MilestoneApproved` emitted (line 208)
- Event `ContractCompleted` emitted if `!isActive` (lines 210-212)
- `_status` restored to `NOT_ENTERED` via `nonReentrant` modifier (line 91)

**CEI Compliance:** PASS -- All state changes (status update, accounting, isActive flag) happen before the external call. Events are emitted after the call, which is acceptable since events are not state-dependent for security.

**Reentrancy Risk:** LOW -- The `nonReentrant` modifier prevents re-entry. The `freelancer` address is immutable (set at construction) so it cannot be changed. If the freelancer is a malicious contract, the worst case is it re-enters `approveMilestone` -- but the `nonReentrant` guard would revert. It could re-enter non-guarded functions like `submitMilestone` or `disputeMilestone`, but those do not move ETH.

**Trust Level:** MEDIUM -- The freelancer is set at construction and is immutable. The employer or platform must approve before funds move, so the freelancer cannot self-approve.

---

### Call #3 -- `withdraw`: Pull-Payment Withdrawal to Caller

| Field | Detail |
|-------|--------|
| **Caller function** | `withdraw()` -- line 284 |
| **Target** | `msg.sender` (any party with pending balance) |
| **Call syntax** | `msg.sender.call{value: amount}("")` |
| **Arguments** | Empty calldata `""`, value = `pendingWithdrawals[msg.sender]` |
| **Return handling** | `(bool ok, )` -- checked; reverts with `TransferFailed()` on failure |
| **Modifier chain** | `nonReentrant` |

**State changes before call:**
- `pendingWithdrawals[msg.sender]` read into `amount` (line 281)
- `pendingWithdrawals[msg.sender]` set to `0` (line 283) -- zeroed before transfer
- `_status` set to `ENTERED` via `nonReentrant` modifier

**State changes after call:**
- `_status` restored to `NOT_ENTERED` via `nonReentrant` modifier

**CEI Compliance:** PASS -- Balance zeroed before external call (classic checks-effects-interactions). The `nonReentrant` guard adds defense-in-depth.

**Reentrancy Risk:** LOW -- Even without the `nonReentrant` modifier, the balance is zeroed before the call, so a re-entrant call to `withdraw()` would read `amount = 0` and revert at the `require(amount > 0)` check. The `nonReentrant` modifier provides an additional layer.

**Trust Level:** LOW -- `msg.sender` is the caller. This is a standard pull-payment pattern. The amount is derived from contract-internal accounting, not user input.

**Note:** Uses `require(amount > 0, "Nothing to withdraw")` string-based revert instead of custom error. This is inconsistent with the rest of the contract which uses custom errors and costs more gas.

---

### Call #4 -- `refundMilestone`: Refund to Employer

| Field | Detail |
|-------|--------|
| **Caller function** | `refundMilestone(uint256 milestoneIndex)` -- line 319 |
| **Target** | `employer` (immutable address) |
| **Call syntax** | `employer.call{value: amt}("")` |
| **Arguments** | Empty calldata `""`, value = `milestone.amount` |
| **Return handling** | `(bool success, )` -- checked; reverts with `RefundFailed()` on failure |
| **Modifier chain** | `onlyEmployer`, `contractActive`, `nonReentrant` |

**State changes before call:**
- `milestone.status` set to `Refunded` (line 310)
- `refundedAmount` incremented by `amt` (line 312)
- `isActive` set to `false` if total milestones settled (lines 315-317)
- `_status` set to `ENTERED` via `nonReentrant` modifier

**State changes after call:**
- Event `MilestoneRefunded` emitted (line 322)
- Event `ContractCompleted` emitted if `!isActive` (lines 324-326)
- `_status` restored to `NOT_ENTERED` via `nonReentrant` modifier

**CEI Compliance:** PASS -- All state mutations (status, accounting, isActive) occur before the external call.

**Reentrancy Risk:** LOW -- `nonReentrant` guard prevents re-entry. The employer is calling this function themselves and receiving funds back, so the incentive to attack is low. The target (`employer`) is immutable.

**Trust Level:** LOW -- The employer is both the caller and the recipient. Self-refund with no trust boundary.

---

### Call #5 -- `cancelContract`: Remaining Funds Refund to Employer

| Field | Detail |
|-------|--------|
| **Caller function** | `cancelContract()` -- line 348 |
| **Target** | `employer` (immutable address) |
| **Call syntax** | `employer.call{value: remainingFunds}("")` |
| **Arguments** | Empty calldata `""`, value = `totalAmount - releasedAmount - refundedAmount` |
| **Return handling** | `(bool success, )` -- checked; reverts with `RefundFailed()` on failure |
| **Modifier chain** | `onlyEmployer`, `contractActive`, `nonReentrant` |

**State changes before call:**
- Loop checks all milestones for Submitted/Disputed status (lines 335-341)
- `remainingFunds` calculated from accounting (line 344)
- `isActive` set to `false` (line 345)
- `_status` set to `ENTERED` via `nonReentrant` modifier

**State changes after call:**
- Event `ContractCancelled` emitted (line 352)
- `_status` restored to `NOT_ENTERED` via `nonReentrant` modifier

**CEI Compliance:** PASS -- `isActive` is set to `false` before the external call. The `remainingFunds` calculation uses tracked accounting (`totalAmount - releasedAmount - refundedAmount`) rather than `address(this).balance`, which correctly prevents force-sent ETH from inflating the refund.

**Reentrancy Risk:** LOW -- `nonReentrant` guard active. The employer is both caller and recipient. The contract is deactivated before the transfer, preventing any further state-modifying calls.

**Trust Level:** LOW -- Employer-only, self-refund pattern.

---

## Contract: FreelanceReputation

---

### Call #6 -- `submitRating`: Cross-Contract View Call to ContractAgreement

| Field | Detail |
|-------|--------|
| **Caller function** | `submitRating(address, uint8, string, bytes32)` -- lines 117-127 |
| **Target** | `contractAgreement` (immutable `IContractAgreement` interface) |
| **Function called** | `getAgreement(contractIdHash)` |
| **Call syntax** | `contractAgreement.getAgreement(contractIdHash)` |
| **Arguments** | `contractIdHash` (bytes32 -- user-supplied) |
| **Return handling** | Destructured into 9 return values; `employer`, `freelancer`, and `status` are used for authorization checks |
| **Modifier chain** | None (access control is inline) |

**State changes before call:**
- Basic input validation: ratee address, score range, self-rating check (lines 112-114)

**State changes after call:**
- Agreement status checked against `Completed` (line 129)
- Caller verified as party to the contract (line 130)
- Ratee verified as party to the contract (line 131)
- `isEmployerRating` derived from on-chain data (line 136)
- Duplicate rating check via `ratingExists` mapping (lines 139-143)
- New rating pushed to `ratings` array (lines 148-157)
- Mappings updated (lines 160-161)
- Aggregate scores updated (lines 164-167)
- Event emitted (line 169)

**CEI Compliance:** PASS -- The external call is a `view` function (read-only), so it cannot modify state on the called contract. It occurs before the effects section, which is correct for a validation call.

**Reentrancy Risk:** NONE -- `getAgreement` is a `view` function on `ContractAgreement`. It performs no state changes and cannot trigger a callback. No reentrancy vector exists.

**Trust Level:** HIGH -- `contractAgreement` is an immutable address set at construction time, pointing to a known `ContractAgreement` contract. The call is to a `view` function with no side effects. The contract is trusted infrastructure.

**Data Validation:** The returned `employer` and `freelancer` addresses are used for authorization decisions (lines 130-131). This is safe because `ContractAgreement` is a trusted, immutable reference and `getAgreement` reads directly from storage. The `status` check ensures ratings can only be submitted for completed agreements.

**Design Note:** The `isEmployerRating` boolean is derived on-chain from `msg.sender == employer` (line 136) rather than accepting it as a parameter. This prevents employers from submitting ratings that appear to come from freelancers.

---

## Delegatecall Analysis

**No delegatecalls found in any contract.**

This is a positive security finding. None of the five contracts use `delegatecall`, which eliminates an entire class of storage collision and proxy-related vulnerabilities.

---

## Low-Level Call Success Check Analysis

All five low-level `.call{value:}` invocations in `FreelanceEscrow` properly check the boolean return value:

| Location | Check | Error |
|----------|-------|-------|
| Constructor (line 169) | `if (!refundSuccess) revert ExcessRefundFailed();` | Custom error |
| `approveMilestone` (line 206) | `if (!success) revert TransferFailed();` | Custom error |
| `withdraw` (line 285) | `if (!ok) revert TransferFailed();` | Custom error |
| `refundMilestone` (line 320) | `if (!success) revert RefundFailed();` | Custom error |
| `cancelContract` (line 349) | `if (!success) revert RefundFailed();` | Custom error |

**Assessment:** PASS -- No unchecked return values. All failed transfers cause the entire transaction to revert atomically.

---

## ETH Transfer Failure Handling

All ETH transfers in `FreelanceEscrow` use `.call{value:}("")` (the recommended pattern since Solidity 0.6.0). On failure, the transaction reverts, rolling back all state changes. This means:

- If the freelancer is a contract that reverts on receive, `approveMilestone` will revert, and the milestone stays in `Submitted` status. The employer can retry after the freelancer fixes their contract, or the dispute path can be used.
- If the employer is a contract that reverts on receive, `refundMilestone` and `cancelContract` will revert. This could lock funds if the employer is permanently unable to receive ETH.
- The `withdraw()` pull-payment function has the same behavior. If a party cannot receive ETH, they cannot withdraw, but other parties' funds are unaffected.

**Risk Assessment:** MEDIUM -- A malicious or broken recipient contract can grief by refusing ETH, causing functions to revert. However, this is a known limitation of ETH transfers to contracts and is standard in the ecosystem. The pull-payment pattern in `resolveDispute` mitigates the cross-contamination risk (one party's inability to receive does not block the other).

---

## Callback / Reentrancy Vector Analysis

### Reentrancy Surface Map

| Function | External Call | Reentrancy Guard | CEI Pattern | Risk |
|----------|--------------|-------------------|-------------|------|
| `constructor` (excess refund) | `msg.sender.call{value:}` | Manual `_status` toggle | Yes | LOW |
| `approveMilestone` | `freelancer.call{value:}` | `nonReentrant` | Yes | LOW |
| `withdraw` | `msg.sender.call{value:}` | `nonReentrant` | Yes | LOW |
| `refundMilestone` | `employer.call{value:}` | `nonReentrant` | Yes | LOW |
| `cancelContract` | `employer.call{value:}` | `nonReentrant` | Yes | LOW |
| `submitRating` | `contractAgreement.getAgreement()` | N/A (view call) | N/A | NONE |

### Cross-Function Reentrancy Analysis

Within `FreelanceEscrow`, all functions that perform external calls are protected by the same `nonReentrant` modifier (or manual `_status` toggle in the constructor). This means:

- A re-entrant call from `freelancer.call` in `approveMilestone` cannot re-enter `approveMilestone`, `withdraw`, `refundMilestone`, or `cancelContract`.
- A re-entrant call from `msg.sender.call` in `withdraw` cannot re-enter any guarded function.
- The constructor's manual guard uses the same `_status` variable, providing the same protection.

**However**, the following functions are NOT protected by `nonReentrant`:
- `submitMilestone` -- state change only (sets status to Submitted), no external call, no ETH movement. Safe.
- `disputeMilestone` -- state change only (sets status to Disputed), no external call, no ETH movement. Safe.

A re-entrant call from a `nonReentrant`-guarded function could theoretically call `submitMilestone` or `disputeMilestone`. This is not exploitable because:
1. `submitMilestone` only allows the freelancer to mark their own milestone as Submitted. No funds move.
2. `disputeMilestone` only allows employer/freelancer to mark as Disputed. No funds move.
3. The milestone status checks (e.g., `Submitted` required for `approveMilestone`) would prevent meaningful reordering attacks.

### Cross-Contract Reentrancy

- `FreelanceReputation.submitRating` calls `ContractAgreement.getAgreement` which is a `view` function. No reentrancy vector.
- No contract calls back into `FreelanceEscrow`. There are no cross-contract reentrancy paths.

### Force-Sent ETH Consideration

`FreelanceEscrow.getBalance()` returns `address(this).balance` (line 372), which includes force-sent ETH. However, the contract does not use `address(this).balance` for any accounting logic. All fund tracking uses `totalAmount`, `releasedAmount`, and `refundedAmount`. The `cancelContract` function explicitly uses `totalAmount - releasedAmount - refundedAmount` (line 344) rather than `address(this).balance`. This correctly prevents force-sent ETH from inflating refunds.

Force-sent ETH would be permanently locked in the contract with no recovery mechanism.

---

## Reentrancy Risk Summary

| Risk Level | Count | Details |
|------------|-------|---------|
| NONE | 1 | `FreelanceReputation.submitRating` -- view call only |
| LOW | 5 | All ETH transfers in `FreelanceEscrow` -- protected by `nonReentrant` + CEI |
| MEDIUM | 0 | -- |
| HIGH | 0 | -- |
| CRITICAL | 0 | -- |

### Key Findings

1. **All external calls follow CEI pattern.** State mutations precede every external call in `FreelanceEscrow`. No state depends on the return value of an external call.

2. **Reentrancy guard is comprehensive.** Every function that makes an external call is protected by `nonReentrant`. The constructor uses an equivalent manual guard. Cross-function reentrancy is blocked by the shared guard.

3. **Pull-payment pattern correctly implemented for disputes.** `resolveDispute` credits `pendingWithdrawals` without making external calls. `withdraw()` zeroes the balance before transfer. This eliminates the sequential-external-call reentrancy risk that existed in earlier designs.

4. **Force-sent ETH is handled correctly.** Accounting uses tracked variables, not `address(this).balance`. The `cancelContract` function is explicitly safe against this inflation vector.

5. **No delegatecalls.** Eliminates an entire vulnerability class.

6. **One minor inconsistency.** `withdraw()` uses `require(amount > 0, "Nothing to withdraw")` with a string error (line 282), while all other functions use custom errors. This costs more gas and is inconsistent with the codebase style. Consider changing to a custom error.

7. **No timeout/emergency mechanism.** If a recipient contract permanently refuses ETH (via reverting in `receive()`/`fallback()`), the associated funds are locked. This is documented in the contract comments (lines 296-303) as a known limitation with a suggested future upgrade path.
