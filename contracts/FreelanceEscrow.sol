// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FreelanceEscrow
 * @dev Escrow contract for freelance marketplace milestone payments
 * Holds funds and releases them upon milestone approval
 * Includes reentrancy protection for all payment functions
 */
contract FreelanceEscrow {
    address public employer;
    address public freelancer;
    address public arbiter; // For dispute resolution
    
    uint256 public totalAmount;
    uint256 public releasedAmount;
    
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
        
        // Check if all milestones are complete
        if (releasedAmount >= totalAmount) {
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
            
            (bool success, ) = employer.call{value: milestone.amount}("");
            require(success, "Refund failed");
            
            emit MilestoneRefunded(milestoneIndex, milestone.amount);
        }
        
        emit DisputeResolved(milestoneIndex, inFavorOfFreelancer);
    }
    
    /**
     * @dev Employer can refund a pending milestone
     */
    function refundMilestone(uint256 milestoneIndex) external onlyEmployer contractActive nonReentrant {
        require(milestoneIndex < milestones.length, "Invalid milestone index");
        Milestone storage milestone = milestones[milestoneIndex];
        require(milestone.status == MilestoneStatus.Pending, "Milestone not pending");
        
        milestone.status = MilestoneStatus.Refunded;
        
        (bool success, ) = employer.call{value: milestone.amount}("");
        require(success, "Refund failed");
        
        emit MilestoneRefunded(milestoneIndex, milestone.amount);
    }
    
    /**
     * @dev Cancel contract and refund remaining funds to employer
     */
    function cancelContract() external onlyEmployer contractActive nonReentrant {
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
        return totalAmount - releasedAmount;
    }
}
