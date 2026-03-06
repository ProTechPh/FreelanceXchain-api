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
 * - Extracted _checkCompletion to reduce bytecode duplication
 */
contract FreelanceEscrow {
    // Custom errors
    error InvalidFreelancerAddress();
    error InvalidArbiterAddress();
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

    address public immutable employer;
    address public immutable freelancer;
    address public immutable arbiter;
    uint256 public immutable totalAmount;

    uint256 public releasedAmount;
    uint256 public refundedAmount;

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
    event DisputeResolved(uint256 indexed milestoneIndex, bool inFavorOfFreelancer);
    event ContractCompleted();
    event ContractCancelled();
    event ExcessRefunded(address indexed to, uint256 amount);
    
    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
    
    modifier onlyEmployer() {
        if (msg.sender != employer) revert OnlyEmployer();
        _;
    }
    
    modifier onlyFreelancer() {
        if (msg.sender != freelancer) revert OnlyFreelancer();
        _;
    }
    
    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert OnlyArbiter();
        _;
    }
    
    modifier onlyParties() {
        if (msg.sender != employer && msg.sender != freelancer) revert OnlyParties();
        _;
    }
    
    modifier contractActive() {
        if (!isActive) revert ContractNotActive();
        _;
    }
    
    constructor(
        address _freelancer,
        address _arbiter,
        string memory _contractId,
        uint256[] memory _milestoneAmounts,
        string[] memory _milestoneDescriptions
    ) payable {
        if (_freelancer == address(0)) revert InvalidFreelancerAddress();
        if (_arbiter == address(0)) revert InvalidArbiterAddress();
        if (_arbiter == msg.sender) revert ArbiterCannotBeEmployer();
        if (_arbiter == _freelancer) revert ArbiterCannotBeFreelancer();
        if (_milestoneAmounts.length == 0) revert MustHaveAtLeastOneMilestone();
        if (_milestoneAmounts.length != _milestoneDescriptions.length) revert AmountsDescriptionsMismatch();
        
        employer = msg.sender;
        freelancer = _freelancer;
        arbiter = _arbiter;
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
        
        // Initialize reentrancy guard
        _status = NOT_ENTERED;
        
        emit FundsDeposited(msg.sender, msg.value);

        // Refund excess ETH immediately
        if (msg.value > total) {
            uint256 excess = msg.value - total;
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            if (!refundSuccess) revert ExcessRefundFailed();
            emit ExcessRefunded(msg.sender, excess);
        }
    }

    
    /**
     * @dev Freelancer submits milestone for approval
     */
    function submitMilestone(uint256 milestoneIndex) external onlyFreelancer contractActive {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();
        
        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(milestoneIndex);
    }
    
    /**
     * @dev Employer approves milestone and releases payment
     */
    function approveMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();
        
        milestone.status = MilestoneStatus.Approved;
        uint256 amt = milestone.amount;
        releasedAmount += amt;
        
        // Transfer funds to freelancer
        (bool success, ) = freelancer.call{value: amt}("");
        if (!success) revert TransferFailed();
        
        emit MilestoneApproved(milestoneIndex, amt);
        
        _checkCompletion();
    }
    
    /**
     * @dev Either party can dispute a submitted milestone
     */
    function disputeMilestone(uint256 milestoneIndex) external onlyParties contractActive {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert MilestoneNotSubmitted();
        
        milestone.status = MilestoneStatus.Disputed;
        emit MilestoneDisputed(milestoneIndex);
    }
    
    /**
     * @dev Arbiter resolves dispute
     */
    function resolveDispute(
        uint256 milestoneIndex,
        bool inFavorOfFreelancer
    ) external onlyArbiter contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert MilestoneNotDisputed();
        
        uint256 amt = milestone.amount;
        
        if (inFavorOfFreelancer) {
            milestone.status = MilestoneStatus.Approved;
            releasedAmount += amt;
            
            (bool success, ) = freelancer.call{value: amt}("");
            if (!success) revert TransferFailed();
            
            emit MilestoneApproved(milestoneIndex, amt);
        } else {
            milestone.status = MilestoneStatus.Refunded;
            refundedAmount += amt;
            
            (bool success, ) = employer.call{value: amt}("");
            if (!success) revert RefundFailed();
            
            emit MilestoneRefunded(milestoneIndex, amt);
        }
        
        emit DisputeResolved(milestoneIndex, inFavorOfFreelancer);

        _checkCompletion();
    }
    
    /**
     * @dev Employer can refund a pending milestone
     */
    function refundMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        if (milestoneIndex >= milestones.length) revert InvalidMilestoneIndex();
        Milestone storage milestone = milestones[milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();
        
        milestone.status = MilestoneStatus.Refunded;
        uint256 amt = milestone.amount;
        refundedAmount += amt;
        
        (bool success, ) = employer.call{value: amt}("");
        if (!success) revert RefundFailed();
        
        emit MilestoneRefunded(milestoneIndex, amt);

        _checkCompletion();
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

        uint256 remainingFunds = address(this).balance;
        isActive = false;
        
        if (remainingFunds > 0) {
            (bool success, ) = employer.call{value: remainingFunds}("");
            if (!success) revert RefundFailed();
        }
        
        emit ContractCancelled();
    }

    /**
     * @dev Internal helper to check if all milestones are completed/refunded
     */
    function _checkCompletion() internal {
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
            emit ContractCompleted();
        }
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
