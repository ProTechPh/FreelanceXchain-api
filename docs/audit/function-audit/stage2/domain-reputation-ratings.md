# Stage 2: Reputation & Ratings Domain -- Per-Function Audit

**Audit Date**: 2026-07-21
**Domain**: On-chain reputation system for freelance marketplace -- rating submission, aggregation, pagination, and duplicate prevention
**Contracts Analyzed**:
- `FreelanceReputation.sol` -- all external and public functions

**Prior Context Read**:
- `stage1/state-variable-map.md` -- S17-S22 (ratings, userRatings, givenRatings, ratingExists, totalScore, ratingCount)
- `stage1/access-control-map.md` -- Section 5 (FreelanceReputation roles and functions)
- `stage1/external-call-map.md` -- Call #6 (submitRating cross-contract view call)
- `stage0/design-decisions.md` -- isEmployerRating derivation, unchecked math, block.timestamp, getAverageRating precision

---

## Per-Function Analysis

---

### constructor(address _contractAgreement)

- **Rationale**: Initializes the reputation contract with an immutable reference to the ContractAgreement contract. This reference is the sole dependency for gating rating submissions -- every call to `submitRating` cross-calls this contract to verify agreement status and party membership. The address is immutable for gas savings (~2100 gas per call) and to prevent post-deployment re-targeting.

- **State mutations**:
  - `contractAgreement` (immutable) -- set to `IContractAgreement(_contractAgreement)` at line 89

- **Dependencies**:
  - Reads: none
  - Calls: none
  - Modifiers: none (constructor)

- **Findings**:
  1. **LOW -- No zero-address validation on `_contractAgreement`**. Line 89: `contractAgreement = IContractAgreement(_contractAgreement);` accepts `address(0)` without revert. If deployed with a zero address, all subsequent `submitRating` calls will revert at line 127 when calling `contractAgreement.getAgreement()`, rendering the contract permanently non-functional. Since the contract has no admin or upgrade mechanism (GAP-8 from access control map), there is no recovery path. A constructor revert on zero address would prevent this irreversible deployment error. The risk is LOW because deployment is a controlled, one-time operation typically performed by a trusted deployer.

  2. **DESIGN_DECISION -- No owner or admin role**. The contract intentionally has no owner, admin, pause, or upgrade mechanism. This is consistent with the design philosophy of immutable, tamper-proof on-chain reputation. However, it means any deployment error (like the zero-address issue above) is permanent.

- **Verdict**: **NEEDS_REVIEW**

---

### submitRating(address ratee, uint8 score, string calldata comment, bytes32 contractIdHash)

- **Rationale**: Core state-modifying function of the reputation domain. Allows a party to a completed contract agreement to rate the other party. Enforces: agreement completion, party membership, non-self-rating, score range, and duplicate prevention. Derives `isEmployerRating` on-chain rather than accepting it as input to prevent reputation data corruption. This is the only function that mutates state in the entire contract.

- **State mutations**:
  - `ratingExists[ratingKey]` -- set to `true` at line 143 (duplicate prevention flag)
  - `ratings[]` -- new `Rating` struct pushed at lines 149-157 (rater, score, isEmployerRating, timestamp, ratee, comment, contractIdHash)
  - `userRatings[ratee]` -- `ratingIndex` appended at line 160 (received ratings index)
  - `givenRatings[msg.sender]` -- `ratingIndex` appended at line 161 (given ratings index)
  - `totalScore[ratee]` -- incremented by `score` at line 165 (within `unchecked` block)
  - `ratingCount[ratee]` -- incremented by 1 at line 166 (within `unchecked` block)

- **Dependencies**:
  - Reads: `contractAgreement` (immutable, line 127)
  - Calls: `contractAgreement.getAgreement(contractIdHash)` -- external view call to ContractAgreement (line 127)
  - Modifiers: none (inline access control)

- **Findings**:

  1. **DESIGN_DECISION -- `isEmployerRating` derived on-chain from agreement data**. Line 136: `bool isEmployerRating = (msg.sender == employer);`. The comment at lines 99-103 and 133-135 explicitly documents that accepting `isEmployerRating` as a caller-supplied parameter would allow employers to submit ratings that appear to come from freelancers. This matches the design decision documented in `design-decisions.md` (State Machine Transitions #4). Correctly implemented.

  2. **DESIGN_DECISION -- Unchecked arithmetic for totalScore and ratingCount**. Lines 164-167: `unchecked { totalScore[ratee] += score; ratingCount[ratee]++; }`. The contract comment states "overflow impossible" and this is documented as a gas optimization in `design-decisions.md` (Gas Optimizations #4). The reasoning: each `score` is a `uint8` in range [1,5], and `totalScore` and `ratingCount` are `uint256`. To overflow `uint256`, a user would need approximately 2^256 / 5 ratings, which is physically impossible given gas constraints. The `ratingCount` increment is similarly bounded. This is safe.

  3. **DESIGN_DECISION -- `block.timestamp` used for non-critical timestamps**. Line 153: `timestamp: uint48(block.timestamp)`. The contract comment at line 148 notes "~15s miner influence acceptable" for reputation timestamps. This matches `design-decisions.md` (Known Trade-offs #2). The `uint48` type stores Unix timestamps and will not overflow until approximately year 8,900,000. No issue.

  4. **LOW -- No length limit on `comment` string parameter**. Line 109: `string calldata comment` has no length validation. A caller can submit an arbitrarily long comment, which will be stored in the `Rating` struct at slot 2 (dynamic storage). The gas cost of storing a long string provides a natural economic bound (approximately 200 gas per byte of calldata + SSTORE costs), but there is no explicit protocol-level cap. This could result in unexpectedly high gas costs for the caller, and the stored data is permanently on-chain. Consider adding a maximum length check (e.g., 1024 bytes) for UX predictability and to prevent accidental excessive gas expenditure.

  5. **LOW -- No validation that `contractIdHash` is non-zero**. Line 111: `bytes32 contractIdHash` is not checked against `bytes32(0)`. If a caller passes `bytes32(0)`, the call to `contractAgreement.getAgreement(bytes32(0))` at line 127 will likely return zero/default values, and the status check at line 129 will revert with `ContractNotCompleted()` (assuming no agreement exists at key 0). This is a defense-in-depth concern rather than an exploitable vulnerability -- the revert still occurs, just with a potentially confusing error message. Adding an explicit `if (contractIdHash == bytes32(0)) revert` would provide clearer error reporting.

  6. **INFO -- Cross-contract view call is safe**. Line 127: `contractAgreement.getAgreement(contractIdHash)` is a `view` function on an immutable contract reference. As documented in `external-call-map.md` (Call #6), this cannot modify state, cannot trigger callbacks, and carries zero reentrancy risk. The returned `employer`, `freelancer`, and `status` values are used for authorization decisions (lines 129-131) and are trusted because the ContractAgreement contract is immutable infrastructure.

  7. **INFO -- Duplicate prevention is correctly keyed**. Lines 139-142: The rating key `keccak256(abi.encodePacked(msg.sender, ratee, contractIdHash))` uniquely identifies a (rater, ratee, contract) triple. This prevents a rater from rating the same ratee twice for the same contract, while allowing the same rater to rate the same ratee for different completed contracts. The `abi.encodePacked` usage is safe here because all three arguments have fixed-size types (`address`, `address`, `bytes32` = 20 + 20 + 32 = 72 bytes), eliminating the hash collision risk that exists with dynamic types.

  8. **INFO -- CEI pattern is correctly followed**. The external view call to `contractAgreement.getAgreement()` occurs at line 127 (Checks phase), before any state mutations (Effects phase, lines 143-167). Since the call is `view`-only, the ordering is technically flexible, but the current ordering is correct and consistent with best practices.

  9. **INFO -- Ratee validation ensures party membership**. Line 131: `if (ratee != employer && ratee != freelancer) revert InvalidRatee();` prevents rating addresses that were not parties to the agreement. This is an important validation that was not present in the Stage 1 access control analysis function signature -- it was correctly added to prevent rating arbitrary addresses.

- **Verdict**: **NEEDS_REVIEW**

---

### getAverageRating(address user)

- **Rationale**: Returns the average rating score for a user, scaled by 100 to preserve two decimal places of precision (e.g., 450 = 4.50 stars). This is the primary reputation metric that external consumers (UI, other contracts) use to evaluate a user's standing. Returns 0 for users with no ratings.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `ratingCount[user]` (line 181), `totalScore[user]` (line 182)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **DESIGN_DECISION -- Multiply-by-100 before division for precision preservation**. Line 182: `return (totalScore[user] * 100) / ratingCount[user]`. This is documented in `design-decisions.md` (Rounding Policy #3) and confirmed by the developer. The multiplication-before-division pattern preserves two decimal places of precision. For example, a user with one rating of score 4 would return 400 (4.00), and a user with scores [4, 5] would return `(9 * 100) / 2 = 450` (4.50). Integer division truncates, which means the displayed average is always rounded down -- a conservative representation.

  2. **INFO -- Division by zero is correctly guarded**. Line 181: `if (ratingCount[user] == 0) return 0;` prevents a division-by-zero revert for users who have never received ratings. The early return with 0 is the correct behavior for an empty reputation state.

  3. **INFO -- Rounding direction is DOWN (conservative)**. The integer division `(totalScore * 100) / ratingCount` truncates toward zero. This means a user with scores [4, 4, 5] has `totalScore = 13`, and the average is `(13 * 100) / 3 = 433` (4.33) rather than the mathematical 4.333... This is conservative -- the displayed reputation is never inflated beyond the true mathematical average.

  4. **INFO -- No overflow risk in multiplication**. Line 182: `totalScore[user] * 100` could theoretically overflow if `totalScore` exceeds `type(uint256).max / 100`. Since each rating contributes at most 5 to `totalScore`, overflow requires approximately `2^256 / 500` ratings, which is physically impossible.

- **Verdict**: **SOUND**

---

### getRatingCount(address user)

- **Rationale**: Returns the cached count of ratings received by a user. This is an O(1) accessor for the `ratingCount` mapping, which is a cached duplicate of `userRatings[user].length`. It exists for gas efficiency -- callers (including `getAverageRating`) can query the count without loading the dynamic array length from storage.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `ratingCount[user]` (line 189)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Returns cached value, not array length**. Line 189: `return ratingCount[user]` reads from the mapping, not from `userRatings[user].length`. Per the state variable map (S22), `ratingCount` is manually synchronized with `userRatings[user].length` in `submitRating`. Both are always updated in the same transaction (lines 160 and 166), so they remain in sync. However, this creates a coupling dependency: any future function that modifies `userRatings` without updating `ratingCount` will cause divergence.

  2. **INFO -- Consistent with getUserRatingCount but uses different storage**. Both `getRatingCount` (line 189, reads `ratingCount[user]`) and `getUserRatingCount` (line 314, reads `userRatings[user].length`) return the same logical value. See cross-cutting analysis for consistency discussion.

- **Verdict**: **SOUND**

---

### getUserRatingIndices(address user, uint256 offset, uint256 limit)

- **Rationale**: Returns a paginated slice of rating indices for ratings received by a user. Enables off-chain consumers to enumerate a user's ratings without loading the entire array in a single call. The 100-item cap prevents unbounded gas usage for users with many ratings.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `userRatings[user]` (line 207 -- storage array)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Pagination cap of 100 is correctly enforced**. Line 205: `if (limit == 0 || limit > 100) revert InvalidPaginationParams();` prevents both zero-limit queries (which would return empty arrays wastefully) and unbounded queries (which could exceed block gas limits for users with many ratings). The cap of 100 is a reasonable balance between usability and gas safety.

  2. **INFO -- Empty result for out-of-bounds offset is handled gracefully**. Lines 210-212: `if (offset >= total) { return new uint256[](0); }` returns an empty array when the offset exceeds the array length, rather than reverting. This is a clean API design for paginated consumers that may request beyond the end.

  3. **INFO -- End index clamping prevents out-of-bounds access**. Lines 214-216: `if (end > total) { end = total; }` ensures the loop at lines 222-224 never accesses beyond the array bounds. This correctly handles the case where `offset + limit > total`.

  4. **INFO -- No overflow in offset + limit calculation**. Line 214: `uint256 end = offset + limit`. Since `limit <= 100` (enforced at line 205), and `offset` is a `uint256`, the sum could theoretically overflow if `offset` is near `type(uint256).max`. However, `offset >= total` is checked first (line 210), and `total` is the length of a storage array that cannot practically reach `type(uint256).max`. Safe in practice.

- **Verdict**: **SOUND**

---

### getRating(uint256 index)

- **Rationale**: Returns the full details of a single rating by its global index in the `ratings` array. This is the primary data accessor for individual ratings -- consumers use indices returned by `getUserRatingIndices` or `getGivenRatingIndices` to fetch full rating data.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `ratings.length` (line 241), `ratings[index]` (line 242 -- storage struct)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Bounds check prevents out-of-bounds access**. Line 241: `if (index >= ratings.length) revert InvalidRatingIndex();` correctly validates the index before accessing the storage array. This prevents reading uninitialized storage slots.

  2. **INFO -- Return tuple correctly unpacks packed struct**. Lines 243-251: The function reads from the storage struct and returns individual fields. The `uint256(r.timestamp)` cast at line 249 correctly widens the `uint48` storage value to `uint256` for the return type. The `isEmployerRating` bool is correctly returned as the last field.

  3. **INFO -- Storage reads are minimal**. The function reads exactly 4 storage slots per call (the Rating struct occupies 4 slots as documented in the state variable map). No unnecessary storage reads.

- **Verdict**: **SOUND**

---

### getTotalRatings()

- **Rationale**: Returns the total number of ratings ever submitted in the system. This is a simple length accessor for the `ratings` array, useful for off-chain indexing and pagination calculations.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `ratings.length` (line 258)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Simple and correct**. Line 258: `return ratings.length;` directly returns the dynamic array length. No bounds check needed (length is always valid). No overflow concern (array length is `uint256`).

- **Verdict**: **SOUND**

---

### hasRated(address rater, address ratee, bytes32 contractIdHash)

- **Rationale**: Checks whether a specific (rater, ratee, contractIdHash) triple already has a submitted rating. This is the read-side interface for the `ratingExists` duplicate-prevention mapping. Off-chain systems use this to check eligibility before calling `submitRating`.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `ratingExists[ratingKey]` (line 272 -- mapping lookup)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Hash key construction is consistent with submitRating**. Lines 269-271: `keccak256(abi.encodePacked(rater, ratee, contractIdHash))` uses the identical encoding as `submitRating` at lines 139-141. This guarantees that `hasRated` returns accurate results for any triple that was rated via `submitRating`.

  2. **INFO -- No input validation on parameters**. The function accepts any address and bytes32 values without validation. For a `view` function, this is acceptable -- invalid inputs simply return `false` (the default mapping value), which is the correct "not rated" response.

- **Verdict**: **SOUND**

---

### getGivenRatingIndices(address user, uint256 offset, uint256 limit)

- **Rationale**: Returns a paginated slice of rating indices for ratings given by a user. Symmetric counterpart to `getUserRatingIndices` -- enables enumeration of a user's outbound rating activity.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `givenRatings[user]` (line 288 -- storage array)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Pagination logic is identical to getUserRatingIndices**. Lines 286-307 implement the same pagination pattern: limit validation (0 < limit <= 100), offset bounds check, end index clamping, and bounded loop. This consistency is good -- both functions behave identically for the same inputs.

  2. **INFO -- No code duplication concern**. The pagination logic is duplicated between `getUserRatingIndices` (lines 200-227) and `getGivenRatingIndices` (lines 281-308). While an internal helper function could reduce code size, the gas overhead of an internal function call (JUMP + stack manipulation) would negate the code-size savings for view functions. The current approach is acceptable.

- **Verdict**: **SOUND**

---

### getUserRatingCount(address user)

- **Rationale**: Returns the number of ratings received by a user by reading directly from the `userRatings` dynamic array length. This is an alternative to `getRatingCount` that reads from the source-of-truth array rather than the cached mapping.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `userRatings[user].length` (line 314)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Reads from source-of-truth array**. Line 314: `return userRatings[user].length` reads the dynamic array length directly. Unlike `getRatingCount` which reads the cached `ratingCount` mapping, this function reads from the canonical array. Both values are synchronized by `submitRating` (line 160 pushes to array, line 166 increments counter), so they always match.

- **Verdict**: **SOUND**

---

### getGivenRatingCount(address user)

- **Rationale**: Returns the number of ratings given by a user by reading from the `givenRatings` dynamic array length. Symmetric counterpart to `getUserRatingCount` for outbound ratings.

- **State mutations**: None (view function).

- **Dependencies**:
  - Reads: `givenRatings[user].length` (line 321)
  - Calls: none
  - Modifiers: none

- **Findings**:

  1. **INFO -- Simple and correct**. Line 321: `return givenRatings[user].length` reads directly from the dynamic array. No cached counter exists for given ratings (unlike received ratings which have both `userRatings[].length` and `ratingCount`), so this is the only way to query this value.

- **Verdict**: **SOUND**

---

## Cross-Cutting Analysis

### Q1: Are related functions consistent in their state handling?

**Yes, with a minor redundancy worth noting.** The contract maintains two sources of truth for "how many ratings has user X received":

- `userRatings[user].length` (read by `getUserRatingCount` at line 314)
- `ratingCount[user]` (read by `getRatingCount` at line 189 and `getAverageRating` at line 181)

Both are written in the same function (`submitRating`, lines 160 and 166), in the same `unchecked` block, within the same transaction. They cannot desynchronize unless a future function modifies one without the other. The cached `ratingCount` exists for gas optimization -- `getAverageRating` would otherwise need to load the dynamic array length from storage to check for zero, adding ~2100 gas (cold SLOAD) per call.

For given ratings, there is no cached counter -- only `givenRatings[user].length` (read by `getGivenRatingCount`). This is consistent because no function needs to compute aggregates over given ratings.

### Q2: Are there any invariants that span multiple functions in this domain?

**Invariant 1: `ratingCount[user] == userRatings[user].length` for all users.**
- Maintained by: `submitRating` (line 160: push to array, line 166: increment counter)
- Read by: `getRatingCount` vs `getUserRatingCount`
- Risk: LOW -- both writes occur in the same function, no external calls between them

**Invariant 2: `totalScore[user] >= ratingCount[user]` (since minimum score is 1).**
- Maintained by: `submitRating` score validation (line 114: `score < 1` reverts)
- Implication: `getAverageRating` will always return >= 100 (1.00) for any user with ratings

**Invariant 3: `totalScore[user] <= ratingCount[user] * 5` (since maximum score is 5).**
- Maintained by: `submitRating` score validation (line 114: `score > 5` reverts)
- Implication: `getAverageRating` will always return <= 500 (5.00)

**Invariant 4: `ratings[]` array is append-only.**
- No function modifies or deletes existing ratings
- No function removes entries from `userRatings` or `givenRatings`
- `ratingExists` flags are one-way (set to `true`, never reset)
- Implication: The reputation system is fully immutable once a rating is submitted, consistent with the contract's stated purpose ("ratings and reviews that cannot be tampered with")

**Invariant 5: Each (rater, ratee, contractIdHash) triple maps to at most one rating.**
- Maintained by: `ratingExists` mapping check (line 142) and set (line 143)
- The key construction uses `abi.encodePacked(address, address, bytes32)` which is collision-free for fixed-size types

**Invariant 6: Every rating's `contractIdHash` references a Completed agreement where both rater and ratee were parties.**
- Maintained by: `submitRating` checks at lines 129-131
- This is a cross-contract invariant that depends on `ContractAgreement.getAgreement()` returning accurate data, which it does because `ContractAgreement` is trusted infrastructure with an immutable address

### Q3: Dual count functions -- potential consumer confusion

The contract exposes two ways to get a user's received rating count: `getRatingCount` (cached mapping) and `getUserRatingCount` (array length). While both return the same value, a consumer who is aware of both might wonder which to trust. This is a minor API design concern -- both are correct, but documenting the relationship (cached vs source-of-truth) in NatSpec would help integrators.

---

## Summary of Findings

| # | Severity | Function | Finding |
|---|----------|----------|---------|
| 1 | LOW | `constructor` | No zero-address validation on `_contractAgreement` -- irreversible deployment error if address(0) is passed |
| 2 | LOW | `submitRating` | No length limit on `comment` string -- no explicit protocol cap on review size |
| 3 | LOW | `submitRating` | No validation that `contractIdHash` is non-zero -- defense-in-depth concern |
| 4 | INFO | `submitRating` | `isEmployerRating` correctly derived on-chain (DESIGN_DECISION) |
| 5 | INFO | `submitRating` | Unchecked arithmetic for totalScore/ratingCount is safe (DESIGN_DECISION) |
| 6 | INFO | `submitRating` | `block.timestamp` acceptable for non-critical timestamps (DESIGN_DECISION) |
| 7 | INFO | `submitRating` | Cross-contract view call is safe, no reentrancy vector |
| 8 | INFO | `submitRating` | Duplicate prevention key uses `abi.encodePacked` with fixed-size types (collision-free) |
| 9 | INFO | `submitRating` | CEI pattern correctly followed |
| 10 | INFO | `submitRating` | Ratee validation ensures party membership |
| 11 | INFO | `getAverageRating` | Multiply-by-100 precision preservation is correct (DESIGN_DECISION) |
| 12 | INFO | `getAverageRating` | Division by zero correctly guarded |
| 13 | INFO | `getAverageRating` | Rounding direction is DOWN (conservative, never inflates reputation) |
| 14 | INFO | `getRatingCount` | Returns cached value synchronized with array length |
| 15 | INFO | `getUserRatingIndices` | Pagination cap of 100 correctly enforced, empty/out-of-bounds handled |
| 16 | INFO | `getRating` | Bounds check correct, struct unpacking correct |
| 17 | INFO | `getTotalRatings` | Simple and correct |
| 18 | INFO | `hasRated` | Hash key construction consistent with submitRating |
| 19 | INFO | `getGivenRatingIndices` | Pagination logic identical to getUserRatingIndices |
| 20 | INFO | `getUserRatingCount` | Reads from source-of-truth array |
| 21 | INFO | `getGivenRatingCount` | Simple and correct |

---

## Overall Domain Verdict: **NEEDS_REVIEW** (3 LOW findings, 17 INFO findings)

The Reputation & Ratings domain is well-implemented with strong security fundamentals. All 3 LOW findings are defense-in-depth improvements rather than exploitable vulnerabilities:

- The zero-address constructor check (Finding 1) prevents an irreversible deployment mistake but requires a misconfiguration during deployment to trigger.
- The uncapped comment field (Finding 2) is bounded by gas economics but lacks explicit protocol-level limits.
- The zero `contractIdHash` (Finding 3) still results in a revert, just with a less specific error message.

The contract's core security properties are sound: party-gated rating submission via cross-contract verification, on-chain `isEmployerRating` derivation to prevent spoofing, duplicate prevention via keyed mapping, append-only immutability, and conservative rounding in average calculation. The view functions are all correctly bounded with appropriate pagination caps. No CRITICAL or HIGH findings were identified.
