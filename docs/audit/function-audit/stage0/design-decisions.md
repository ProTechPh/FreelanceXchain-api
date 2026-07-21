# Design Decisions

**Generated**: 2026-07-21
**Project**: D:\FreelanceXchain\FreelanceXchain-api
**Source**: Automated extraction + developer confirmation (confirmed by developer — "ikaw na bahala")

## Access Control Model

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | Custom modifiers (no OpenZeppelin Ownable/AccessControl) | code-detected | All contracts | Confirmed |
| 2 | `onlyEmployer` modifier grants access to both `employer` AND `platform` wallet | code-detected | FreelanceEscrow:94-97 | Confirmed |
| 3 | `owner` = backend relayer (immutable, set in constructor) | code-detected | ContractAgreement:63, DisputeResolution:69, MilestoneRegistry:63 | Confirmed |
| 4 | Dispute resolution restricted to owner only (not arbiter role) | code-detected | DisputeResolution:135 | Confirmed |
| 5 | Agreement completion restricted to owner only (prevents employer bypass) | code-detected | ContractAgreement:139 | Confirmed |
| 6 | Milestone submission: freelancer OR owner | code-detected | MilestoneRegistry:84 | Confirmed |
| 7 | Milestone approval: employer OR owner | code-detected | MilestoneRegistry:112 | Confirmed |

Developer notes: Owner is the backend relayer — a trusted server wallet that mediates off-chain workflows. Platform wallet acts as employer proxy for automated operations.

## Reentrancy Approach

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | `nonReentrant` on all payment functions: approveMilestone, resolveDispute, withdraw, refundMilestone, cancelContract | code-detected | FreelanceEscrow:87-92 | Confirmed |
| 2 | submitMilestone and disputeMilestone intentionally omit nonReentrant (no external calls) | code-detected | FreelanceEscrow:178, 218 | Confirmed |
| 3 | Pull-payment pattern in resolveDispute — credits pendingWithdrawals instead of direct transfer | code-detected | FreelanceEscrow:258-267 | Confirmed |
| 4 | Constructor excess refund guarded by reentrancy (sets ENTERED before call) | code-detected | FreelanceEscrow:166-168 | Confirmed |

Developer notes: Pull-payment in resolveDispute eliminates the sequential-external-call reentrancy window.

## CEI (Checks-Effects-Interactions) Pattern

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | approveMilestone: state updates before freelancer.call | code-detected | FreelanceEscrow:196-206 | Confirmed |
| 2 | refundMilestone: state updates before employer.call | code-detected | FreelanceEscrow:311-319 | Confirmed |
| 3 | cancelContract: state updates before employer.call | code-detected | FreelanceEscrow:344-349 | Confirmed |
| 4 | resolveDispute: all state changes before crediting withdrawals (no external calls) | code-detected | FreelanceEscrow:248-267 | Confirmed |

Developer notes: All payment functions follow CEI. Combined with nonReentrant for defense-in-depth.

## Rounding Policy

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | Basis-point division (amt * freelancerBps) / 10000 rounds DOWN (employer-favorable on dust) | code-detected | FreelanceEscrow:245 | Confirmed |
| 2 | employerAmt = amt - freelancerAmt (exact remainder, no rounding loss) | code-detected | FreelanceEscrow:246 | Confirmed |
| 3 | getAverageRating multiplies by 100 before dividing to preserve precision | developer-confirmed | FreelanceReputation:177-182 | Confirmed |

Developer notes: Rounding favors the employer (protocol side) on dispute resolution dust amounts.

## Strict Equality (Hash Comparisons)

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | verifyTerms: strict == on bytes32 hash — intentional for cryptographic comparison | developer-confirmed + slither-suppressed | ContractAgreement:197-199 | Confirmed |
| 2 | verifyWorkHash: strict == on bytes32 hash — same rationale | developer-confirmed + slither-suppressed | MilestoneRegistry:203-205 | Confirmed |

Developer notes: Cryptographic hash comparisons are safe with strict equality — collision probability is negligible.

## State Machine Transitions

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | MilestoneStatus: Pending → Submitted → Approved/Disputed/Refunded | code-detected | FreelanceEscrow:63 | Confirmed |
| 2 | AgreementStatus: Pending → Signed → Completed/Disputed/Cancelled | code-detected | ContractAgreement:35 | Confirmed |
| 3 | DisputeOutcome: Pending → FreelancerFavor/EmployerFavor/Split/Cancelled | code-detected | DisputeResolution:35 | Confirmed |
| 4 | isEmployerRating derived on-chain from msg.sender vs stored employer | developer-confirmed | FreelanceReputation:100-103, 136 | Confirmed |

Developer notes: No Submitted → Refunded path exists by design. Disputed milestones must go through arbiter resolution.

## Known Trade-offs

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | No timeout or emergency escape for unresponsive arbiter | developer-confirmed (NatSpec) | FreelanceEscrow:298-303 | Confirmed |
| 2 | block.timestamp acceptable for non-critical timestamps (~15s miner influence) | developer-confirmed (NatSpec) | FreelanceReputation:148 | Confirmed |
| 3 | Platform wallet has full employer powers — by design for backend automation | code-detected | FreelanceEscrow:48, 94-97 | Confirmed |
| 4 | DisputeOutcome.Cancelled intentionally does NOT update win/loss stats | developer-confirmed | DisputeResolution:162 | Confirmed |

Developer notes: Acknowledged gap — future upgrade should add arbiter-replacement mechanism or time-locked emergency escape.

## Gas Optimizations

| # | Decision | Source | Location | Status |
|---|----------|--------|----------|--------|
| 1 | Immutable addresses (employer, freelancer, arbiter, platform, owner) | developer-confirmed (NatSpec) | All contracts | Confirmed |
| 2 | Packed structs (MilestoneRecord, DisputeRecord, Agreement) | developer-confirmed (NatSpec) | Multiple | Confirmed |
| 3 | Custom errors replace require strings | developer-confirmed (NatSpec) | All contracts | Confirmed |
| 4 | Unchecked increments where overflow impossible | developer-confirmed (NatSpec) | FreelanceEscrow:153, MilestoneRegistry:121 | Confirmed |

## Additional Context

- ETH-only protocol — no ERC20 token handling, no fee-on-transfer or rebasing token risks
- No proxy/upgrade patterns — all contracts are immutable once deployed
- No oracle dependencies — all values are user-supplied or computed on-chain
- DisputeResolution records outcomes; FreelanceEscrow handles actual fund distribution
- MilestoneRegistry is a parallel record-keeping system; FreelanceEscrow is the source of truth for funds
