// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title FreelanceEscrow
 * @dev Escrow contract for freelance marketplace milestone payments
 * Holds funds and releases them upon milestone approval
 * Includes reentrancy protection for all payment functions
 *
 * Gas optimizations:
 * - employer, freelancer, arbiter, totalAmount are immutable (saves ~2100 gas per modifier)
 * - Packed _status (uint8) and isActive (bool) into same slot
 * - Custom errors replace require strings
 * - Loop optimizations: cached length, unchecked ++i
 * - Cached milestone.amount in local variable to avoid repeated SLOADs
 * - Inlined completion checks to follow checks-effects-interactions pattern
 */
contract FreelanceEscrow {
    // Custom errors
    error InvalidFreelancerAddress();
    error InvalidArbiterAddress();
    error InvalidPlatformAddress();
    error ArbiterCannotBeEmployer();
    error ArbiterCannotBeFreelancer();
    error MustHaveAtLeastOneMilestone();
    error AmountsDescriptionsMismatch();
    error MilestoneAmountMustBePositive();
    error InsufficientFunds();
    error ExcessRefundFailed();
    error OnlyEmployer();
    error OnlyFreelancer();
    error OnlyArbiter();
    error OnlyParties();
    error ContractNotActive();
    error ReentrantCall();
    error InvalidMilestoneIndex();
    error MilestoneNotPending();
    error MilestoneNotSubmitted();
    error MilestoneNotDisputed();
    error TransferFailed();
    error RefundFailed();
    error CannotCancelSubmittedOrDisputed();
    error InvalidResolutionBps();
    error NothingToWithdraw();
    error DisputeTimeoutNotElapsed();

    address public immutable employer;
    address public immutable freelancer;
    address public immutable arbiter;
    address public immutable platform; // Server wallet that can act on employer's behalf
    uint256 public immutable totalAmount;

    uint256 public releasedAmount;
    uint256 public refundedAmount;

    // Pull-payment: amounts owed to each address after dispute resolution
    mapping(address => uint256) public pendingWithdrawals;

    // Timelock escape hatch: timeout duration and timestamps for disputed milestones
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    mapping(uint256 => uint256) public disputeTimestamps;

    // Reentrancy guard (packed with isActive in same slot)
    uint8 private constant NOT_ENTERED = 1;
    uint8 private constant ENTERED = 2;
    uint8 private _status;
    bool public isActive;

    enum MilestoneStatus { Pending, Submitted, Approved, Disputed, Refunded }

    struct Milestone {
        uint256 amount;
        MilestoneStatus status;
        string description;
    }

    Milestone[] public milestones;
    string public contractId; // Off-chain contract reference

    // Events
    event FundsDeposited(address indexed from, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneIndex);
    event MilestoneApproved(uint256 indexed milestoneIndex, uint256 amount);
    event MilestoneDisputed(uint256 indexed milestoneIndex);
    event MilestoneRefunded(uint256 indexed milestoneIndex, uint256 amount);
    event DisputeResolved(uint256 indexed milestoneIndex, uint256 freelancerBps);
    event DisputeDeadlockResolved(uint256 indexed milestoneIndex, address indexed resolvedBy);
    event ContractCompleted();
    event ContractCancelled();
    event ExcessRefunded(address indexed to, uint256 amount);
    // Emitted when platform wallet acts on employer's behalf for auditability
    event PlatformActedAsEmployer(address indexed platform);

    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }

    modifier onlyEmployer() {
        if (msg.sender != employer && msg.sender != platform) revert OnlyEmployer();
        if (msg.sender == platform) emit PlatformActedAsEmployer(msg.sender);
        _;
    }

    modifier onlyFreelancerOrPlatform() {
        if (msg.sender != freelancer && msg.sender != platform) revert OnlyFreelancer();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert OnlyArbiter();
        _;
    }

    modifier onlyParties() {
        if (msg.sender != employer && msg.sender != freelancer && msg.sender != platform) revert OnlyParties();
        _;
    }

    modifier contractActive() {
        if (!isActive) revert ContractNotActive();
        _;
    }

    function _validateConstructorParams(
        address _freelancer,
        address _arbiter,
        address _platform,
        uint256 amountsLen,
        uint256 descriptionsLen
    ) private view {
        if (_freelancer == address(0)) revert InvalidFreelancerAddress();
        if (_arbiter == address(0)) revert InvalidArbiterAddress();
        if (_platform == address(0)) revert InvalidPlatformAddress();
        if (_arbiter == msg.sender) revert ArbiterCannotBeEmployer();
        if (_arbiter == _freelancer) revert ArbiterCannotBeFreelancer();
        if (amountsLen == 0) revert MustHaveAtLeastOneMilestone();
        if (amountsLen != descriptionsLen) revert AmountsDescriptionsMismatch();
    }

    constructor(
        address _freelancer,
        address _arbiter,
        address _platform,
        string memory _contractId,
        uint256[] memory _milestoneAmounts,
        string[] memory _milestoneDescriptions
    ) payable {
        _validateConstructorParams(
            _freelancer,
            _arbiter,
            _platform,
            _milestoneAmounts.length,
            _milestoneDescriptions.length
        );

        employer = msg.sender;
        freelancer = _freelancer;
        arbiter = _arbiter;
        platform = _platform;
        contractId = _contractId;
        isActive = true;

        uint256 total = 0;
        uint256 len = _milestoneAmounts.length;
        for (uint256 i = 0; i < len; ) {
            if (_milestoneAmounts[i] == 0) revert MilestoneAmountMustBePositive();
            milestones.push(Milestone({
                amount: _milestoneAmounts[i],
                status: MilestoneStatus.Pending,
                description: _milestoneDescriptions[i]
            }));
            total += _milestoneAmounts[i];
            unchecked { ++i; }
        }

        totalAmount = total;
        if (msg.value < total) revert InsufficientFunds();

        _status = NOT_ENTERED;

        emit FundsDeposited(msg.sender, msg.value);

        // Refund excess ETH immediately; guard against re-entry from contract wallets
        if (msg.value > total) {
            uint256 excess = msg.value - total;
            _status = ENTERED;
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            _status = NOT_ENTERED;
            if (!refundSuccess) revert ExcessRefundFailed();
            emit ExcessRefunded(msg.sender, excess);
        }
    }


    /**
     * @dev Freelancer submits milestone for approval. The platform may also
     * submit on the freelancer's behalf (server-signed workflow); the DB is the
     * source of truth for who requested the submission.
     */
    function submitMilestone(uint256 milestoneIndex) external onlyFreelancerOrPlatform contractActive {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();

        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(milestoneIndex);
    }

    /**
     * @dev Employer approves a submitted milestone and releases payment
     */
    function approveMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();

        milestone.status = MilestoneStatus.Approved;
        uint256 amt = milestone.amount;
        releasedAmount += amt;

        // Check completion and update state BEFORE external call
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
        }

        // Transfer funds to freelancer; fallback to pull-payment if recipient reverts or rejects push
        (bool success, ) = freelancer.call{value: amt}("");
        if (!success) {
            pendingWithdrawals[freelancer] += amt;
        }

        emit MilestoneApproved(milestoneIndex, amt);

        if (!isActive) {
            emit ContractCompleted();
        }
    }

    /**
     * @dev Either party can dispute a submitted milestone
     */
    function disputeMilestone(uint256 milestoneIndex) external onlyParties contractActive {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted && milestone.status != MilestoneStatus.Pending) revert MilestoneNotSubmitted();

        milestone.status = MilestoneStatus.Disputed;
        disputeTimestamps[milestoneIndex] = block.timestamp;
        emit MilestoneDisputed(milestoneIndex);
    }

    /**
     * @dev Arbiter resolves dispute with a split expressed in basis points.
     * Uses pull-payment pattern: amounts are credited to pendingWithdrawals
     * instead of pushed directly, eliminating the sequential-external-call
     * reentrancy window that existed when both parties were called in one tx.
     * @param freelancerBps Portion awarded to freelancer (0–10000). 10000 = full to freelancer,
     *                      0 = full to employer, 5000 = 50/50 split.
     */
    function resolveDispute(
        uint256 milestoneIndex,
        uint256 freelancerBps
    ) external onlyArbiter contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        if (freelancerBps > 10000) revert InvalidResolutionBps();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert MilestoneNotDisputed();

        uint256 amt = milestone.amount;
        uint256 freelancerAmt = (amt * freelancerBps) / 10000;
        uint256 employerAmt = amt - freelancerAmt;

        // All state changes before any external interaction (CEI pattern)
        milestone.status = MilestoneStatus.Approved;
        releasedAmount += freelancerAmt;
        refundedAmount += employerAmt;

        // Check completion and update state BEFORE transferring
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
        }

        // Credit funds to pendingWithdrawals using the pull-payment pattern
        if (freelancerAmt > 0) {
            pendingWithdrawals[freelancer] += freelancerAmt;
            emit MilestoneApproved(milestoneIndex, freelancerAmt);
        }

        if (employerAmt > 0) {
            pendingWithdrawals[employer] += employerAmt;
            emit MilestoneRefunded(milestoneIndex, employerAmt);
        }

        emit DisputeResolved(milestoneIndex, freelancerBps);

        if (!isActive) {
            emit ContractCompleted();
        }
    }

    /**
     * @dev Withdraw funds credited via dispute resolution (pull-payment).
     * Each party calls this independently to receive their allocation.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /**
     * @dev Emergency escape hatch: if a dispute remains unresolved for longer than DISPUTE_TIMEOUT (30 days),
     * either party or the platform can resolve the deadlock by splitting funds 50/50.
     * Funds are credited via pull-payment (pendingWithdrawals) for safe independent withdrawal.
     */
    function resolveDeadlockedDispute(uint256 milestoneIndex) external onlyParties contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert MilestoneNotDisputed();

        uint256 disputedAt = disputeTimestamps[milestoneIndex];
        if (disputedAt == 0 || block.timestamp < disputedAt + DISPUTE_TIMEOUT) {
            revert DisputeTimeoutNotElapsed();
        }

        uint256 amt = milestone.amount;
        uint256 freelancerAmt = amt / 2;
        uint256 employerAmt = amt - freelancerAmt;

        // All state changes before any external interaction (CEI pattern)
        milestone.status = MilestoneStatus.Approved;
        releasedAmount += freelancerAmt;
        refundedAmount += employerAmt;

        // Check completion and update state BEFORE transferring
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
        }

        // Credit funds to pendingWithdrawals using the pull-payment pattern
        if (freelancerAmt > 0) {
            pendingWithdrawals[freelancer] += freelancerAmt;
            emit MilestoneApproved(milestoneIndex, freelancerAmt);
        }

        if (employerAmt > 0) {
            pendingWithdrawals[employer] += employerAmt;
            emit MilestoneRefunded(milestoneIndex, employerAmt);
        }

        emit DisputeResolved(milestoneIndex, 5000);
        emit DisputeDeadlockResolved(milestoneIndex, msg.sender);

        if (!isActive) {
            emit ContractCompleted();
        }
    }

    /**
     * @dev Employer can refund a pending milestone.
     *
     * @notice This function only refunds milestones in Pending status.
     * Milestones in Submitted or Disputed status cannot be refunded directly by the employer,
     * and `cancelContract` also blocks cancellation when such milestones exist.
     *
     * Expected resolution paths for non-Pending milestones:
     * - Submitted: the employer must either approve (approveMilestone) or dispute (disputeMilestone).
     * - Disputed: the arbiter must resolve the dispute via resolveDispute, which uses pull-payment
     *   so each party can withdraw their allocation independently via withdraw(). If the arbiter
     *   remains unresponsive for DISPUTE_TIMEOUT (30 days), either party or the platform can call
     *   `resolveDeadlockedDispute` to execute a 50/50 emergency resolution.
     */
    function refundMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();

        milestone.status = MilestoneStatus.Refunded;
        uint256 amt = milestone.amount;
        refundedAmount += amt;

        // Check completion and update state BEFORE external call
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
        }

        // Transfer funds to employer; fallback to pull-payment if recipient reverts or rejects push
        (bool success, ) = employer.call{value: amt}("");
        if (!success) {
            pendingWithdrawals[employer] += amt;
        }

        emit MilestoneRefunded(milestoneIndex, amt);

        if (!isActive) {
            emit ContractCompleted();
        }
    }

    /**
     * @dev Cancel contract and refund remaining funds to employer
     * Cannot cancel if any milestones are Submitted or Disputed
     */
    function cancelContract() external onlyEmployer contractActive nonReentrant {
        uint256 len = milestones.length;
        for (uint256 i = 0; i < len; ) {
            MilestoneStatus s = milestones[i].status;
            if (s == MilestoneStatus.Submitted || s == MilestoneStatus.Disputed) {
                revert CannotCancelSubmittedOrDisputed();
            }
            unchecked { ++i; }
        }

        // Use accounting-tracked remainder to prevent force-sent ETH from inflating refund
        uint256 remainingFunds = totalAmount - releasedAmount - refundedAmount;
        isActive = false;

        if (remainingFunds > 0) {
            (bool success, ) = employer.call{value: remainingFunds}("");
            if (!success) {
                pendingWithdrawals[employer] += remainingFunds;
            }
        }

        emit ContractCancelled();
    }

    // View functions

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 index) external view returns (
        uint256 amount,
        MilestoneStatus status,
        string memory description
    ) {
        if (index >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage m = milestones[index];
        return (m.amount, m.status, m.description);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getRemainingAmount() external view returns (uint256) {
        return totalAmount - releasedAmount - refundedAmount;
    }
}
