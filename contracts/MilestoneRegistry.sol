// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MilestoneRegistry
 * @dev Records milestone completions on-chain for verifiable work history
 * Creates immutable proof of completed work
 */
contract MilestoneRegistry {
    address public owner;

    enum MilestoneStatus { Submitted, Approved, Rejected, Disputed }

    struct MilestoneRecord {
        bytes32 contractId;
        bytes32 milestoneId;
        bytes32 workHash;           // Hash of deliverables/proof
        address freelancer;
        address employer;
        uint256 amount;
        MilestoneStatus status;
        uint256 submittedAt;
        uint256 completedAt;
        string title;
    }

    // Mapping from milestone ID hash to record
    mapping(bytes32 => MilestoneRecord) public milestones;
    
    // Track milestones by freelancer for portfolio
    mapping(address => bytes32[]) public freelancerMilestones;
    
    // Track completed milestones count
    mapping(address => uint256) public completedCount;
    mapping(address => uint256) public totalEarned;

    // Events
    event MilestoneSubmitted(bytes32 indexed milestoneIdHash, bytes32 indexed contractId, address indexed freelancer, bytes32 workHash);
    event MilestoneApproved(bytes32 indexed milestoneIdHash, address indexed freelancer, uint256 amount, uint256 timestamp);
    event MilestoneRejected(bytes32 indexed milestoneIdHash, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Record milestone submission
     */
    function submitMilestone(
        bytes32 milestoneIdHash,
        bytes32 contractId,
        bytes32 workHash,
        address freelancer,
        address employer,
        uint256 amount,
        string calldata title
    ) external {
        require(milestones[milestoneIdHash].submittedAt == 0, "Already submitted");
        require(freelancer != address(0), "Invalid freelancer");

        milestones[milestoneIdHash] = MilestoneRecord({
            contractId: contractId,
            milestoneId: milestoneIdHash,
            workHash: workHash,
            freelancer: freelancer,
            employer: employer,
            amount: amount,
            status: MilestoneStatus.Submitted,
            submittedAt: block.timestamp,
            completedAt: 0,
            title: title
        });

        freelancerMilestones[freelancer].push(milestoneIdHash);
        emit MilestoneSubmitted(milestoneIdHash, contractId, freelancer, workHash);
    }

    /**
     * @dev Approve milestone completion
     */
    function approveMilestone(bytes32 milestoneIdHash) external {
        MilestoneRecord storage m = milestones[milestoneIdHash];
        require(m.submittedAt > 0, "Not found");
        require(m.status == MilestoneStatus.Submitted || m.status == MilestoneStatus.Disputed, "Invalid status");

        m.status = MilestoneStatus.Approved;
        m.completedAt = block.timestamp;
        
        completedCount[m.freelancer]++;
        totalEarned[m.freelancer] += m.amount;

        emit MilestoneApproved(milestoneIdHash, m.freelancer, m.amount, block.timestamp);
    }

    /**
     * @dev Reject milestone
     */
    function rejectMilestone(bytes32 milestoneIdHash, string calldata reason) external {
        MilestoneRecord storage m = milestones[milestoneIdHash];
        require(m.submittedAt > 0, "Not found");
        require(m.status == MilestoneStatus.Submitted, "Invalid status");

        m.status = MilestoneStatus.Rejected;
        emit MilestoneRejected(milestoneIdHash, reason);
    }

    // View functions

    function getMilestone(bytes32 milestoneIdHash) external view returns (
        bytes32 contractId,
        bytes32 workHash,
        address freelancer,
        uint256 amount,
        MilestoneStatus status,
        uint256 submittedAt,
        uint256 completedAt,
        string memory title
    ) {
        MilestoneRecord storage m = milestones[milestoneIdHash];
        return (m.contractId, m.workHash, m.freelancer, m.amount, m.status, m.submittedAt, m.completedAt, m.title);
    }

    function getFreelancerStats(address freelancer) external view returns (
        uint256 completed,
        uint256 earned,
        uint256 totalMilestones
    ) {
        return (completedCount[freelancer], totalEarned[freelancer], freelancerMilestones[freelancer].length);
    }

    function getFreelancerMilestoneAt(address freelancer, uint256 index) external view returns (bytes32) {
        require(index < freelancerMilestones[freelancer].length, "Index out of bounds");
        return freelancerMilestones[freelancer][index];
    }

    function verifyWorkHash(bytes32 milestoneIdHash, bytes32 workHash) external view returns (bool) {
        return milestones[milestoneIdHash].workHash == workHash;
    }
}
