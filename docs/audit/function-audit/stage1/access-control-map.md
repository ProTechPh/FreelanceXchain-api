# Access Control Map -- Stage 1

## Scope

Contracts analyzed:

- `FreelanceEscrow.sol`
- `ContractAgreement.sol`
- `MilestoneRegistry.sol`
- `DisputeResolution.sol`
- `FreelanceReputation.sol`

---

## 1. FreelanceEscrow

### Roles

| Role | Identity | Set In |
|------|----------|--------|
| `employer` | `immutable address` | constructor (`msg.sender`) |
| `freelancer` | `immutable address` | constructor (parameter) |
| `arbiter` | `immutable address` | constructor (parameter) |
| `platform` | `immutable address` | constructor (parameter) -- server wallet, can act on employer's behalf |

### Modifiers

| Modifier | Condition |
|----------|-----------|
| `onlyEmployer` | `msg.sender == employer` OR `msg.sender == platform`. Emits `PlatformActedAsEmployer` when platform acts. |
| `onlyFreelancer` | `msg.sender == freelancer` |
| `onlyArbiter` | `msg.sender == arbiter` |
| `onlyParties` | `msg.sender == employer` OR `msg.sender == freelancer` |
| `contractActive` | `isActive == true` |
| `nonReentrant` | `_status != ENTERED` (custom reentrancy guard) |

### Functions

#### `constructor(address _freelancer, address _arbiter, address _platform, string _contractId, uint256[] _milestoneAmounts, string[] _milestoneDescriptions) external payable`

- **Visibility:** constructor (not callable post-deploy)
- **Access:** deployer only
- **State changes:** Sets all immutable addresses, creates milestone array, sets `isActive = true`, sets `totalAmount`. Sends excess ETH back to `msg.sender`.
- **Trust:** deployer is the employer by definition.

---

#### `submitMilestone(uint256 milestoneIndex) external`

- **Modifiers:** `onlyFreelancer`, `contractActive`
- **Required role:** freelancer
- **State changes:** Sets `milestones[milestoneIndex].status = Submitted`
- **Trust:** freelancer accurately represents that work is done.

#### `approveMilestone(uint256 milestoneIndex) external`

- **Modifiers:** `onlyEmployer`, `contractActive`, `nonReentrant`
- **Required role:** employer (or platform)
- **State changes:** Sets milestone to `Approved`, increments `releasedAmount`, may set `isActive = false`. Transfers `milestone.amount` ETH to `freelancer`.
- **Trust:** employer/platform approves only genuinely completed work. Platform has full employer power here.

#### `disputeMilestone(uint256 milestoneIndex) external`

- **Modifiers:** `onlyParties`, `contractActive`
- **Required role:** employer OR freelancer
- **State changes:** Sets `milestones[milestoneIndex].status = Disputed`
- **Trust:** either party can dispute a submitted milestone.

#### `resolveDispute(uint256 milestoneIndex, uint256 freelancerBps) external`

- **Modifiers:** `onlyArbiter`, `contractActive`, `nonReentrant`
- **Required role:** arbiter
- **State changes:** Credits `pendingWithdrawals[freelancer]` and `pendingWithdrawals[employer]` per basis-point split. Sets milestone to `Approved`. May deactivate contract.
- **Trust:** arbiter is fully trusted to resolve disputes fairly. No bounds on re-resolution beyond status check.

#### `withdraw() external`

- **Modifiers:** `nonReentrant`
- **Required role:** any address with `pendingWithdrawals > 0`
- **State changes:** Zeroes `pendingWithdrawals[msg.sender]`, sends ETH to `msg.sender`.
- **Trust:** pull-payment pattern; no trust required beyond correct accounting.

#### `refundMilestone(uint256 milestoneIndex) external`

- **Modifiers:** `onlyEmployer`, `contractActive`, `nonReentrant`
- **Required role:** employer (or platform)
- **State changes:** Sets milestone to `Refunded`, increments `refundedAmount`, may deactivate contract. Sends ETH back to `employer`.
- **Trust:** employer can only refund `Pending` milestones. Cannot refund `Submitted` or `Disputed`.

#### `cancelContract() external`

- **Modifiers:** `onlyEmployer`, `contractActive`, `nonReentrant`
- **Required role:** employer (or platform)
- **State changes:** Iterates all milestones, reverts if any are `Submitted` or `Disputed`. Sets `isActive = false`. Refunds remaining balance to `employer`.
- **Trust:** employer can cancel at will if no milestones are in-flight. Platform also has this power.

#### `getMilestoneCount() external view`

- **Access:** unrestricted
- **Returns:** `milestones.length`

#### `getMilestone(uint256 index) external view`

- **Access:** unrestricted
- **Returns:** milestone amount, status, description

#### `getBalance() external view`

- **Access:** unrestricted
- **Returns:** `address(this).balance`

#### `getRemainingAmount() external view`

- **Access:** unrestricted
- **Returns:** `totalAmount - releasedAmount - refundedAmount`

---

## 2. ContractAgreement

### Roles

| Role | Identity | Set In |
|------|----------|--------|
| `owner` | `immutable address` | constructor (`msg.sender`) -- backend relayer |
| employer | per-agreement address | `createAgreement` parameter |
| freelancer | per-agreement address | `createAgreement` parameter |

### Modifiers

None defined as named modifiers. All access control is inline.

### Functions

#### `constructor()`

- **Visibility:** constructor
- **Access:** deployer only
- **State changes:** Sets `owner = msg.sender`

---

#### `createAgreement(bytes32 contractIdHash, bytes32 termsHash, address employer, address freelancer, uint256 totalAmount, uint256 milestoneCount) external`

- **Access:** `msg.sender == owner` (inline check)
- **Required role:** owner (backend relayer)
- **State changes:** Creates `Agreement` struct in `agreements[contractIdHash]`, pushes to `userAgreements` for both employer and freelancer.
- **Trust:** owner is fully trusted to create agreements with correct parameters. No validation of `termsHash` content, `totalAmount` reasonableness, or `milestoneCount` upper bound beyond `uint32` max.

#### `signAgreement(bytes32 contractIdHash) external`

- **Access:** `msg.sender == employer` OR `msg.sender == freelancer` of that agreement (inline check)
- **Required role:** employer or freelancer (party to the agreement)
- **State changes:** Sets `employerSignedAt` or `freelancerSignedAt`. If both signed, sets `status = Signed`.
- **Trust:** each party signs for themselves. Self-enforced by address check.

#### `completeAgreement(bytes32 contractIdHash) external`

- **Access:** `msg.sender == owner` (inline check, after existence and status checks)
- **Required role:** owner (backend relayer)
- **State changes:** Sets `status = Completed`
- **Trust:** owner is trusted to only complete after all milestones are paid. Comment explicitly states employer must NOT have this power.

#### `disputeAgreement(bytes32 contractIdHash) external`

- **Access:** `msg.sender == employer` OR `msg.sender == freelancer` (inline check)
- **Required role:** employer or freelancer
- **State changes:** Sets `status = Disputed`
- **Trust:** either party can flag a signed agreement as disputed.

#### `cancelAgreement(bytes32 contractIdHash) external`

- **Access:** `msg.sender == employer` OR `msg.sender == freelancer` (inline check)
- **Required role:** employer or freelancer
- **State changes:** Sets `status = Cancelled`
- **Trust:** either party can cancel, but only if status is `Pending` AND no one has signed yet.

#### `getAgreement(bytes32 contractIdHash) external view`

- **Access:** unrestricted
- **Returns:** full agreement details

#### `isFullySigned(bytes32 contractIdHash) external view`

- **Access:** unrestricted
- **Returns:** bool

#### `verifyTerms(bytes32 contractIdHash, bytes32 termsHash) external view`

- **Access:** unrestricted
- **Returns:** bool (strict equality comparison)

#### `getUserAgreementCount(address user) external view`

- **Access:** unrestricted
- **Returns:** count

#### `getUserAgreementAt(address user, uint256 index) external view`

- **Access:** unrestricted
- **Returns:** `bytes32` contract ID hash

---

## 3. MilestoneRegistry

### Roles

| Role | Identity | Set In |
|------|----------|--------|
| `owner` | `immutable address` | constructor (`msg.sender`) -- backend relayer |
| freelancer | per-milestone address | `submitMilestone` parameter |
| employer | per-milestone address | `submitMilestone` parameter |

### Modifiers

None defined as named modifiers. All access control is inline.

### Functions

#### `constructor()`

- **Visibility:** constructor
- **Access:** deployer only
- **State changes:** Sets `owner = msg.sender`

---

#### `submitMilestone(bytes32 milestoneIdHash, bytes32 contractId, bytes32 workHash, address freelancer, address employer, uint256 amount, string calldata title) external`

- **Access:** `msg.sender == freelancer` OR `msg.sender == owner` (inline check)
- **Required role:** freelancer or owner
- **State changes:** Creates `MilestoneRecord`, pushes to `freelancerMilestones[freelancer]`.
- **Trust:** owner can submit on behalf of any freelancer. Freelancer can submit their own. The `freelancer` and `employer` addresses are caller-supplied -- owner could pass arbitrary addresses.

#### `approveMilestone(bytes32 milestoneIdHash) external`

- **Access:** `msg.sender == m.employer` OR `msg.sender == owner` (inline check)
- **Required role:** employer of that milestone, or owner
- **State changes:** Sets status to `Approved`, sets `completedAt`, increments `completedCount[fl]`, adds to `totalEarned[fl]`.
- **Trust:** employer or owner can approve. Owner can approve any milestone regardless of actual completion.

#### `resolveDisputedMilestone(bytes32 milestoneIdHash) external`

- **Access:** `msg.sender == owner` (inline check)
- **Required role:** owner only
- **State changes:** Sets status from `Disputed` to `Approved`, sets `completedAt`, increments `completedCount[fl]`, adds to `totalEarned[fl]`.
- **Trust:** owner resolves disputed milestones. This is the only path from `Disputed` to `Approved`.

#### `rejectMilestone(bytes32 milestoneIdHash, string calldata reason) external`

- **Access:** `msg.sender == m.employer` OR `msg.sender == owner` (inline check)
- **Required role:** employer of that milestone, or owner
- **State changes:** Sets status to `Rejected`.
- **Trust:** employer or owner can reject.

#### `getMilestone(bytes32 milestoneIdHash) external view`

- **Access:** unrestricted

#### `getFreelancerStats(address freelancer) external view`

- **Access:** unrestricted

#### `getFreelancerMilestoneAt(address freelancer, uint256 index) external view`

- **Access:** unrestricted

#### `verifyWorkHash(bytes32 milestoneIdHash, bytes32 workHash) external view`

- **Access:** unrestricted

---

## 4. DisputeResolution

### Roles

| Role | Identity | Set In |
|------|----------|--------|
| `owner` | `immutable address` | constructor (`msg.sender`) -- backend relayer / admin |
| initiator | per-dispute address | `createDispute` parameter |
| freelancer | per-dispute address | `createDispute` parameter |
| employer | per-dispute address | `createDispute` parameter |
| arbiter | per-dispute address | `resolveDispute` parameter (set at resolution time) |

### Modifiers

None defined as named modifiers. All access control is inline.

### Functions

#### `constructor()`

- **Visibility:** constructor
- **Access:** deployer only
- **State changes:** Sets `owner = msg.sender`

---

#### `createDispute(bytes32 disputeIdHash, bytes32 contractId, bytes32 milestoneId, address initiator, address freelancer, address employer, uint256 amount) external`

- **Access:** `msg.sender == initiator` OR `msg.sender == owner` (inline check). Additionally `initiator` must be `freelancer` or `employer`.
- **Required role:** dispute party or owner
- **State changes:** Creates `DisputeRecord`, pushes to `userDisputes[freelancer]` and `userDisputes[employer]`.
- **Trust:** owner can create disputes on behalf of any party. The `initiator` address must be validated to be a party, but owner bypasses the `msg.sender == initiator` check.

#### `submitEvidence(bytes32 disputeIdHash, bytes32 evidenceHash) external`

- **Access:** `msg.sender == d.freelancer` OR `msg.sender == d.employer` OR `msg.sender == owner` (inline check)
- **Required role:** dispute party or owner
- **State changes:** Appends to `disputes[disputeIdHash].evidenceHashes`.
- **Trust:** any party or owner can submit evidence. Append-only, cannot be deleted.

#### `resolveDispute(bytes32 disputeIdHash, DisputeOutcome outcome, string calldata reasoning, address arbiter) external`

- **Access:** `msg.sender == owner` (inline check)
- **Required role:** owner only
- **State changes:** Sets outcome, reasoning, arbiter, resolvedAt. Updates `disputeStats` for both parties.
- **Trust:** owner is fully trusted to resolve disputes fairly. The `arbiter` address is owner-supplied and can be any address.

#### `getDispute(bytes32 disputeIdHash) external view`

- **Access:** unrestricted

#### `getEvidenceCount(bytes32 disputeIdHash) external view`

- **Access:** unrestricted

#### `getEvidenceAt(bytes32 disputeIdHash, uint256 index) external view`

- **Access:** unrestricted

#### `getUserDisputeStats(address user) external view`

- **Access:** unrestricted

#### `isResolved(bytes32 disputeIdHash) external view`

- **Access:** unrestricted

---

## 5. FreelanceReputation

### Roles

| Role | Identity | Set In |
|------|----------|--------|
| contractAgreement | `immutable IContractAgreement` | constructor parameter |
| rater | `msg.sender` | runtime (any address that was a party to a completed contract) |
| ratee | parameter | `submitRating` parameter |

### Modifiers

None. All access control is inline via cross-contract call to `IContractAgreement`.

### Functions

#### `constructor(address _contractAgreement)`

- **Visibility:** constructor
- **Access:** deployer only
- **State changes:** Sets `contractAgreement` address.

---

#### `submitRating(address ratee, uint8 score, string calldata comment, bytes32 contractIdHash) external returns (uint256)`

- **Access:** any address that is a party (employer or freelancer) to a `Completed` agreement, rating the other party.
- **Required condition:** `msg.sender` must be employer or freelancer of the agreement; agreement status must be `Completed`; ratee must be the other party; no duplicate rating per (rater, ratee, contractIdHash).
- **State changes:** Pushes to `ratings[]`, updates `userRatings[ratee]`, `givenRatings[msg.sender]`, sets `ratingExists[key] = true`, increments `totalScore[ratee]` and `ratingCount[ratee]`.
- **Trust:** no admin override. `isEmployerRating` is derived on-chain from `msg.sender == employer`, preventing spoofing. Score must be 1-5.

#### `getAverageRating(address user) external view`

- **Access:** unrestricted
- **Returns:** `(totalScore * 100) / ratingCount` or 0

#### `getRatingCount(address user) external view`

- **Access:** unrestricted

#### `getUserRatingIndices(address user, uint256 offset, uint256 limit) external view`

- **Access:** unrestricted. `limit` capped at 100.

#### `getRating(uint256 index) external view`

- **Access:** unrestricted

#### `getTotalRatings() external view`

- **Access:** unrestricted

#### `hasRated(address rater, address ratee, bytes32 contractIdHash) external view`

- **Access:** unrestricted

#### `getGivenRatingIndices(address user, uint256 offset, uint256 limit) external view`

- **Access:** unrestricted. `limit` capped at 100.

#### `getUserRatingCount(address user) external view`

- **Access:** unrestricted

#### `getGivenRatingCount(address user) external view`

- **Access:** unrestricted

---

## 6. Cross-Contract Role Summary

### 6.1 Role Hierarchy

```
Owner / Backend Relayer (ContractAgreement, MilestoneRegistry, DisputeResolution)
  |
  +-- Full admin power: create agreements, complete agreements, submit/approve/reject/resolve milestones,
  |   create/resolve disputes, set arbiter addresses
  |
  +-- Platform (FreelanceEscrow only)
  |     |
  |     +-- Delegated employer authority: can approve, refund, cancel on employer's behalf
  |     |
  |     +-- Employer
  |           |
  |           +-- Approve/dispute/refund milestones, dispute/cancel agreement
  |
  +-- Freelancer
  |     |
  |     +-- Submit milestones, dispute milestones, sign/cancel agreement
  |
  +-- Arbiter (FreelanceEscrow only)
  |     |
  |     +-- Resolve disputes with basis-point split
  |
  +-- Any Party (employer OR freelancer)
  |     |
  |     +-- Dispute milestones, dispute/cancel agreements, submit evidence
  |
  +-- Any Address
        |
        +-- Withdraw (if pending balance exists), submit ratings (if party to completed contract),
            all view functions
```

### 6.2 Owner Power Level Assessment

| Contract | Owner Powers | Risk Level |
|----------|-------------|------------|
| ContractAgreement | Create agreements, mark complete | HIGH -- can mark any agreement complete without actual payment verification |
| MilestoneRegistry | Submit, approve, reject, resolve disputed milestones for ANY user | HIGH -- can fabricate work history, inflate freelancer reputation |
| DisputeResolution | Create disputes on behalf of others, resolve disputes with any outcome, set arbiter | HIGH -- can fabricate disputes, set arbitrary outcomes |
| FreelanceEscrow | No owner role | N/A |
| FreelanceReputation | No owner role | N/A |

---

## 7. Access Control Gap Analysis

### 7.1 Critical Gaps

**GAP-1: No pause/emergency mechanism in any contract.** If a vulnerability is discovered mid-flight, there is no way to halt operations. FreelanceEscrow has `isActive` but it is per-instance and only employer-controlled.

**GAP-2: No timeout or liveness escape in FreelanceEscrow.** If a milestone is in `Submitted` or `Disputed` status and both parties stop interacting (and arbiter is unresponsive), funds are locked permanently. The contract's own comments acknowledge this.

**GAP-3: Owner is a single point of failure.** ContractAgreement, MilestoneRegistry, and DisputeResolution all trust a single `immutable owner` address. If this key is compromised, the attacker can:
- Mark any agreement as completed
- Fabricate milestone work history
- Resolve disputes arbitrarily
- Create disputes on behalf of users

**GAP-4: Platform has full employer power in FreelanceEscrow.** The `platform` address can approve, refund, and cancel -- identical powers to the employer. There is no granular permission separation.

**GAP-5: MilestoneRegistry `submitMilestone` accepts caller-supplied `freelancer` and `employer` addresses.** When `msg.sender == owner`, the owner can register milestones attributed to any freelancer/employer pair, potentially inflating a freelancer's on-chain record.

**GAP-6: DisputeResolution `resolveDispute` accepts a caller-supplied `arbiter` address.** The owner can set any address as the arbiter of record, which may not correspond to the actual decision-maker.

**GAP-7: No reentrancy guard in ContractAgreement, MilestoneRegistry, or DisputeResolution.** These contracts do not make external calls in state-modifying functions, so this is low risk currently, but any future addition of external calls would introduce vulnerability.

**GAP-8: FreelanceReputation has no owner or admin.** There is no mechanism to correct erroneous ratings, ban abusive users, or migrate the system. This is by design (immutability) but limits operational flexibility.

### 7.2 Modifier Consistency Issues

| Issue | Detail |
|-------|--------|
| Named vs inline | FreelanceEscrow uses named modifiers (`onlyEmployer`, `onlyFreelancer`, etc.). All other contracts use inline `require`/`revert` checks. This inconsistency makes auditing harder and increases risk of copy-paste errors. |
| `contractActive` scope | Only FreelanceEscrow has a pause/active concept. Other contracts have no equivalent. |
| `nonReentrant` scope | Only FreelanceEscrow uses a reentrancy guard. Others do not need it currently but lack defense-in-depth. |
| `onlyParties` in FreelanceEscrow | Includes employer AND freelancer but NOT platform. Platform cannot dispute milestones. This may be intentional but is asymmetric with `onlyEmployer`. |

### 7.3 Modifier Application Matrix (FreelanceEscrow)

| Function | onlyEmployer | onlyFreelancer | onlyArbiter | onlyParties | contractActive | nonReentrant |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| `submitMilestone` | | X | | | X | |
| `approveMilestone` | X | | | | X | X |
| `disputeMilestone` | | | | X | X | |
| `resolveDispute` | | | X | | X | X |
| `withdraw` | | | | | | X |
| `refundMilestone` | X | | | | X | X |
| `cancelContract` | X | | | | X | X |

### 7.4 Access Control Pattern Matrix (All Contracts)

| Contract | Pattern | Named Modifiers | Inline Checks | Reentrancy Guard | Pause | Owner Role |
|----------|---------|:---:|:---:|:---:|:---:|:---:|
| FreelanceEscrow | Per-instance roles | Yes | No | Yes | Per-instance (`isActive`) | No (employer) |
| ContractAgreement | Per-agreement + global owner | No | Yes | No | No | Yes |
| MilestoneRegistry | Per-milestone + global owner | No | Yes | No | No | Yes |
| DisputeResolution | Per-dispute + global owner | No | Yes | No | No | Yes |
| FreelanceReputation | Cross-contract gate | No | Yes | No | No | No |

---

## 8. Trust Assumptions Summary

| Trust Assumption | Risk | Mitigation Present |
|-----------------|------|--------------------|
| Owner/backend relayer acts honestly | HIGH | None beyond off-chain operational security |
| Arbiter resolves disputes fairly | MEDIUM | Basis-point split is transparent on-chain |
| Employer approves only completed work | MEDIUM | Freelancer can dispute if not approved |
| Platform acts in employer's interest | MEDIUM | Event emission (`PlatformActedAsEmployer`) for auditability |
| ContractAgreement owner marks complete only when appropriate | HIGH | None -- comment documents design rationale |
| FreelanceReputation relies on ContractAgreement status accuracy | HIGH | Cascading trust -- if agreement completion is gamed, reputation is gamed |
| No contract upgrade or migration path | LOW | Immutable design is intentional |

---

## 9. Summary Statistics

| Contract | State-Changing Functions | View Functions | Total | Owner-Only | Party-Restricted | Open |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| FreelanceEscrow | 7 | 4 | 11 | 0 | 7 | 1 |
| ContractAgreement | 5 | 5 | 10 | 2 | 3 | 0 |
| MilestoneRegistry | 4 | 4 | 8 | 1 | 3 | 0 |
| DisputeResolution | 3 | 5 | 8 | 1 | 2 | 0 |
| FreelanceReputation | 1 | 9 | 10 | 0 | 1 | 0 |
| **Total** | **20** | **27** | **47** | **4** | **16** | **1** |

- **47 functions** analyzed across 5 contracts.
- **4 functions** are owner-only (all on backend relayer contracts).
- **16 functions** are party-restricted (employer, freelancer, arbiter, or dispute party).
- **1 function** is fully open with conditional logic (`withdraw` -- requires pending balance).
- **27 view functions** are unrestricted.
