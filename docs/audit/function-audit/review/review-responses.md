# Human Review Responses

**Reviewed**: 2026-07-21
**Reviewer**: Automated (developer delegated with "ikaw na bahala")

## Classification Summary

| Original Severity | BUG | DESIGN | DISPUTED | DISCUSS |
|-------------------|-----|--------|----------|---------|
| HIGH | 0 | 1 | 0 | 1 |
| MEDIUM | 4 | 3 | 2 | 5 |
| LOW | 2 | 5 | 0 | 0 |

## Detailed Classifications

| # | Severity | Finding | Classification | Reasoning |
|---|----------|---------|----------------|-----------|
| 1 | HIGH | Owner key compromise enables full reputation fabrication | DESIGN | Acknowledged trust assumption. Owner = backend relayer is a documented architectural decision. Risk is real but inherent to the centralized-relayer pattern. Mitigated by operational security (not on-chain). |
| 2 | HIGH | Owner key compromise: full reputation fabrication (SEQ-1) | DESIGN | Same root cause as #1. Duplicate from adversarial analysis. |
| 3 | MEDIUM | ContractAgreement `Disputed` status is a dead end | BUG | Legitimate FSM gap. No on-chain path to resolve a disputed agreement. Blocks reputation ratings for disputed-and-resolved contracts. Should add a `resolveDispute` transition or owner-mediated status update. |
| 4 | MEDIUM | MilestoneRegistry has no `Disputed -> Rejected` path | BUG | Legitimate FSM gap. Employer-favorable dispute outcomes leave milestones in permanent `Disputed` limbo. Should add `Disputed -> Rejected` transition callable by owner. |
| 5 | MEDIUM | Arbiter has unchecked split authority | DESIGN | By design — arbiter is trusted to resolve fairly. The BPS range (0-10000) is intentionally unconstrained. Documented trade-off. |
| 6 | MEDIUM | Platform wallet has full employer power | DESIGN | By design for backend automation. Platform acts as employer proxy. Documented in design decisions. |
| 7 | MEDIUM | Cross-contract lifecycle desync allows premature rating | BUG | `completeAgreement` has no on-chain check that escrow milestones are all settled. Should verify escrow `isActive == false` or similar before allowing completion. |
| 8 | MEDIUM | Employer-orchestrated fund lockout via dispute stall | DISPUTED | Requires employer + colluding/unresponsive arbiter. The employer chooses the arbiter at deploy time. While the attack is possible, it requires two-party collusion. The acknowledged gap (no timeout) is the real issue — classified as DESIGN trade-off. |
| 9 | MEDIUM | Owner can fabricate dispute records and manipulate stats | DESIGN | Owner is fully trusted per design decisions. Creating disputes is within the owner's documented power. |
| 10 | MEDIUM | Owner can set arbitrary arbiter address | DISPUTED | The owner is trusted to set correct arbiters. While technically arbitrary, this is within the documented trust model. |
| 11 | MEDIUM | Emitted event is misleading for dispute resolution | BUG | `MilestoneApproved` event reused for dispute resolution. Off-chain systems cannot distinguish approval types. Should emit a dedicated `MilestoneDisputeResolved` event. |
| 12 | MEDIUM | No zero-address check on _contractAgreement constructor | BUG | Irreversible deployment error if address(0) is passed. Simple defense-in-depth fix. |
| 13 | MEDIUM | submitRating has no per-contract cooldown | DISCUSS | Rate limiting could be added but may interfere with legitimate bulk rating workflows. Needs discussion on acceptable rate limits. |
| 14 | MEDIUM | disputeMilestone has no cooldown | DISCUSS | Employer could spam disputes but each dispute requires a Submitted milestone. Limited attack surface since milestones must be submitted first. |
| 15 | MEDIUM | getAgreement returns default data for non-existent agreements | DISCUSS | Callers should check `createdAt != 0`. Could add explicit revert but would break view-call patterns. |
| 16 | MEDIUM | createDispute does not validate contractId references real agreement | DISCUSS | DisputeResolution is loosely coupled by design. Adding cross-contract validation would tighten coupling. |
| 17 | LOW | No zero-address check on msg.sender for owner | DESIGN | msg.sender cannot be address(0) in normal EVM execution. Defense-in-depth only. |
| 18 | LOW | No validation of totalAmount (zero accepted) | DISCUSS | Zero-amount agreement is degenerate but not harmful. Owner is trusted. |
| 19 | LOW | No validation of termsHash (zero accepted) | DESIGN | Owner is trusted to provide meaningful terms hash. |
| 20 | LOW | Order of signing not recorded in events | DESIGN | Off-chain indexers can infer from tx ordering. Not a security issue. |
| 21 | LOW | Initiator address not validated when owner creates dispute | DESIGN | Owner is trusted per design decisions. |
| 22 | LOW | No evidence count limit | DESIGN | Append-only is by design. Caller pays gas. Self-limiting. |
| 23 | LOW | Owner can resolve dispute with zero evidence | DESIGN | Evidence is advisory. Owner is fully trusted. |
| 24 | LOW | getUserDisputeStats: mismatch between total and resolved stats | BUG | `won + lost + split != total` when cancelled disputes exist. Should add cancelled count or document clearly. |
| 25 | LOW | isResolved returns false for non-existent disputes | BUG | Non-existent dispute indistinguishable from pending. Should revert on non-existent dispute. |
| 26-31 | LOW | MilestoneRegistry input validation issues | DESIGN | Owner is trusted. Defense-in-depth only. |
| 32-35 | LOW | Cross-contract coordination issues | DESIGN | Backend-mediated coordination is by design. |
| 36 | LOW | withdraw() uses string require | BUG | Contradicts "custom errors replace require strings" design decision. Should use `revert` with custom error. |
| 37-38 | LOW | No zero-address validation, no global pause | DESIGN | Consistent with immutable design. |
| 39-40 | LOW | Generic Panic reverts, timestamp truncation | DESIGN | Cosmetic issues, not security-relevant. |
| 41-42 | LOW | Owner washing outcomes, platform front-run | DESIGN | Trust assumptions. |

## Disputed/Discussed Items (Full Context)

### Finding #8: Employer-Orchestrated Fund Lockout via Dispute Stall
**Status**: DISPUTED → Reclassified as DESIGN
**Reasoning**: Requires two-party collusion (employer + unresponsive arbiter). The real issue is the acknowledged lack of timeout mechanism, which is a documented design trade-off.

### Finding #10: Owner Can Set Arbitrary Arbiter Address
**Status**: DISPUTED → Reclassified as DESIGN
**Reasoning**: Owner is fully trusted per design decisions. Setting arbiters is within documented administrative scope.

### Finding #13: submitRating No Cooldown
**Status**: DISCUSS → Needs developer input on acceptable rate limits

### Finding #14: disputeMilestone No Cooldown
**Status**: DISCUSS → Limited attack surface, needs developer input

### Finding #15: getAgreement Returns Default Data
**Status**: DISCUSS → Trade-off between safety and view-call usability

### Finding #16: createDispute No ContractId Validation
**Status**: DISCUSS → Trade-off between validation and loose coupling
