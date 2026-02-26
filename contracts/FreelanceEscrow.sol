// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FreelanceEscrow
 * @dev Escrow contract for freelance marketplace milestone payments
 * Holds funds and releases them upon milestone approval
 * Includes reentrancy protection for all payment functions
 * 
 * FIXED:
 * - Track refundedAmount separately so contract can complete after refunds
 * - Validate arbiter is not address(0), not employer, not freelancer
 * - Block cancelContract when milestones are in submitted/disputed state
 * - Refund excess ETH on deployment
 * - Validate milestone amounts > 0
 */
contract FreelanceEscrow {
    address public employer;
    address public freelancer;
    address public arbiter; // For dispute resolution
    
    uint256 public totalAmount;
    uint256 public releasedAmount;
    uint256 public refundedAmount;  // FIXED: Track refunds separately
    
    // Reentrancy guard
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    
    enum MilestoneStatus { Pending, Submitted, Approved, Disputed, Refunded }
    
    struct Milestone {
        uint256 amount;
        MilestoneStatus status;
        string description;
    }
    
    Milestone[] public milestones;
    
    bool public isActive;
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
    
    /**
     * @dev Prevents reentrancy attacks
     */
    modifier nonReentrant() {
        require(_status != ENTERED, "ReentrancyGuard: reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
    
    modifier onlyEmployer() {
        require(msg.sender == employer, "Only employer can call this");
        _;
    }
    
    modifier onlyFreelancer() {
        require(msg.sender == freelancer, "Only freelancer can call this");
        _;
    }
    
    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }
    
    modifier onlyParties() {
        require(
            msg.sender == employer || msg.sender == freelancer,
            "Only contract parties can call this"
        );
        _;
    }
    
    modifier contractActive() {
        require(isActive, "Contract is not active");
        _;
    }
    
    constructor(
        address _freelancer,
        address _arbiter,
        string memory _contractId,
        uint256[] memory _milestoneAmounts,
        string[] memory _milestoneDescriptions
    ) payable {
        require(_freelancer != address(0), "Invalid freelancer address");
        // FIXED: Validate arbiter address
        require(_arbiter != address(0), "Invalid arbiter address");
        require(_arbiter != msg.sender, "Arbiter cannot be the employer");
        require(_arbiter != _freelancer, "Arbiter cannot be the freelancer");
        require(_milestoneAmounts.length > 0, "Must have at least one milestone");
        require(
            _milestoneAmounts.length == _milestoneDescriptions.length,
            "Amounts and descriptions length mismatch"
        );
        
        employer = msg.sender;
        freelancer = _freelancer;
        arbiter = _arbiter;
        contractId = _contractId;
        isActive = true;
        
        uint256 total = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            // FIXED: Validate milestone amounts > 0
            require(_milestoneAmounts[i] > 0, "Milestone amount must be greater than zero");
            milestones.push(Milestone({
                amount: _milestoneAmounts[i],
                status: MilestoneStatus.Pending,
                description: _milestoneDescriptions[i]
            }));
            total += _milestoneAmounts[i];
        }
        
        totalAmount = total;
        require(msg.value >= total, "Insufficient funds sent");
        
        // Initialize reentrancy guard
        _status = NOT_ENTERED;
        
        emit FundsDeposited(msg.sender, msg.value);

        // FIXED: Refund excess ETH immediately
        if (msg.value > total) {
            uint256 excess = msg.value - total;
            (bool refundSuccess, ) = msg.sender.call{value: excess}("");
            require(refundSuccess, "Excess refund failed");
            emit ExcessRefunded(msg.sender, excess);
        }
    }

    
    /**
     * @dev Freelancer submits milestone for approval
     */
    function submitMilestone(uint256 milestoneIndex) external onlyFreelancer contractActive {
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Pending, "Milestone not pending");
        
        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(milestoneIndex);
    }
    
    /**
     * @dev Employer approves milestone and releases payment
     */
    function approveMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(
            milestone.status == MilestoneStatus.Submitted,
            "Milestone not submitted"
        );
        
        milestone.status = MilestoneStatus.Approved;
        releasedAmount += milestone.amount;
        
        // Transfer funds to freelancer
        (bool success, ) = freelancer.call{value: milestone.amount}("");
        require(success, "Transfer failed");
        
        emit MilestoneApproved(milestoneIndex, milestone.amount);
        
        // FIXED: Check completion including refunded milestones
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
            emit ContractCompleted();
        }
    }
    
    /**
     * @dev Either party can dispute a submitted milestone
     */
    function disputeMilestone(uint256 milestoneIndex) external onlyParties contractActive {
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(
            milestone.status == MilestoneStatus.Submitted,
            "Can only dispute submitted milestones"
        );
        
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
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Disputed, "Milestone not disputed");
        
        if (inFavorOfFreelancer) {
            milestone.status = MilestoneStatus.Approved;
            releasedAmount += milestone.amount;
            
            (bool success, ) = freelancer.call{value: milestone.amount}("");
            require(success, "Transfer failed");
            
            emit MilestoneApproved(milestoneIndex, milestone.amount);
        } else {
            milestone.status = MilestoneStatus.Refunded;
            refundedAmount += milestone.amount;  // FIXED: Track refunded amount
            
            (bool success, ) = employer.call{value: milestone.amount}("");
            require(success, "Refund failed");
            
            emit MilestoneRefunded(milestoneIndex, milestone.amount);
        }
        
        emit DisputeResolved(milestoneIndex, inFavorOfFreelancer);

        // FIXED: Check completion including refunded milestones
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
            emit ContractCompleted();
        }
    }
    
    /**
     * @dev Employer can refund a pending milestone
     */
    function refundMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Pending, "Milestone not pending");
        
        milestone.status = MilestoneStatus.Refunded;
        refundedAmount += milestone.amount;  // FIXED: Track refunded amount
        
        (bool success, ) = employer.call{value: milestone.amount}("");
        require(success, "Refund failed");
        
        emit MilestoneRefunded(milestoneIndex, milestone.amount);

        // FIXED: Check completion including refunded milestones
        if (releasedAmount + refundedAmount >= totalAmount) {
            isActive = false;
            emit ContractCompleted();
        }
    }
    
    /**
     * @dev Cancel contract and refund remaining funds to employer
     * FIXED: Cannot cancel if any milestones are Submitted or Disputed
     * (protects freelancers who have submitted work)
     */
    function cancelContract() external onlyEmployer contractActive nonReentrant {
        // FIXED: Block cancellation if any milestone has been submitted or is under dispute
        for (uint256 i = 0; i < milestones.length; i++) {
            require(
                milestones[i].status != MilestoneStatus.Submitted &&
                milestones[i].status != MilestoneStatus.Disputed,
                "Cannot cancel: milestone is submitted or disputed"
            );
        }

        uint256 remainingFunds = address(this).balance;
        isActive = false;
        
        if (remainingFunds > 0) {
            (bool success, ) = employer.call{value: remainingFunds}("");
            require(success, "Refund failed");
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
        require(index < milestones.length, "Invalid index");
        Milestone storage m = milestones[index];
        return (m.amount, m.status, m.description);
    }
    
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    function getRemainingAmount() external view returns (uint256) {
        // FIXED: Account for both released and refunded amounts
        return totalAmount - releasedAmount - refundedAmount;
    }
}
