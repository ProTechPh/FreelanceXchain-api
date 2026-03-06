// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title MilestoneRegistry
 * @dev Records milestone completions on-chain for verifiable work history
 * Creates immutable proof of completed work
 *
 * Gas optimizations:
 * - owner is immutable (saves ~2100 gas per call)
 * - Removed redundant milestoneId from struct (saves 1 storage slot)
 * - Packed status + submittedAt + completedAt with freelancer (saves 3 storage slots)
 * - Custom errors replace require strings
 * - Cached storage reads (m.freelancer, m.amount)
 */
contract MilestoneRegistry {
    // Custom errors
    error OnlyOwner();
    error AlreadySubmitted();
    error InvalidFreelancer();
    error InvalidEmployer();
    error FreelancerEmployerSame();
    error AmountMustBePositive();
    error OnlyFreelancerOrOwner();
    error MilestoneNotFound();
    error InvalidStatus();
    error OnlyEmployerOrOwner();
    error IndexOutOfBounds();

    address public immutable owner;

    enum MilestoneStatus { Submitted, Approved, Rejected, Disputed }

    struct MilestoneRecord {
        bytes32 contractId;          // slot 0
        bytes32 workHash;            // slot 1
        address freelancer;          // slot 2 — 20 bytes
        MilestoneStatus status;      // slot 2 — 1 byte (packed)
        uint48 submittedAt;          // slot 2 — 6 bytes (packed)
        uint40 completedAt;          // slot 2 — 5 bytes (packed)
        address employer;            // slot 3 — 20 bytes
        uint256 amount;              // slot 4
        string title;                // slot 5
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

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Record milestone submission
     * Only the freelancer themselves or the contract owner can submit
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
        if (milestones[milestoneIdHash].submittedAt != 0) revert AlreadySubmitted();
        if (freelancer == address(0)) revert InvalidFreelancer();
        if (employer == address(0)) revert InvalidEmployer();
        if (freelancer == employer) revert FreelancerEmployerSame();
        if (amount == 0) revert AmountMustBePositive();
        if (msg.sender != freelancer && msg.sender != owner) revert OnlyFreelancerOrOwner();

        milestones[milestoneIdHash] = MilestoneRecord({
            contractId: contractId,
            workHash: workHash,
            freelancer: freelancer,
            status: MilestoneStatus.Submitted,
            submittedAt: uint48(block.timestamp),
            completedAt: 0,
            employer: employer,
            amount: amount,
            title: title
        });

        freelancerMilestones[freelancer].push(milestoneIdHash);
        emit MilestoneSubmitted(milestoneIdHash, contractId, freelancer, workHash);
    }

    /**
     * @dev Approve milestone completion
     * Only the employer of the milestone or the contract owner can approve
     */
    function approveMilestone(bytes32 milestoneIdHash) external {
        MilestoneRecord storage m = milestones[milestoneIdHash];
        if (m.submittedAt == 0) revert MilestoneNotFound();
        if (m.status != MilestoneStatus.Submitted && m.status != MilestoneStatus.Disputed) revert InvalidStatus();
        if (msg.sender != m.employer && msg.sender != owner) revert OnlyEmployerOrOwner();

        m.status = MilestoneStatus.Approved;
        m.completedAt = uint40(block.timestamp);
        
        // Cache storage reads
        address fl = m.freelancer;
        uint256 amt = m.amount;
        
        completedCount[fl]++;
        totalEarned[fl] += amt;

        emit MilestoneApproved(milestoneIdHash, fl, amt, block.timestamp);
    }

    /**
     * @dev Reject milestone
     * Only the employer of the milestone or the contract owner can reject
     */
    function rejectMilestone(bytes32 milestoneIdHash, string calldata reason) external {
        MilestoneRecord storage m = milestones[milestoneIdHash];
        if (m.submittedAt == 0) revert MilestoneNotFound();
        if (m.status != MilestoneStatus.Submitted) revert InvalidStatus();
        if (msg.sender != m.employer && msg.sender != owner) revert OnlyEmployerOrOwner();

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
        return (m.contractId, m.workHash, m.freelancer, m.amount, m.status, uint256(m.submittedAt), uint256(m.completedAt), m.title);
    }

    function getFreelancerStats(address freelancer) external view returns (
        uint256 completed,
        uint256 earned,
        uint256 totalMilestones
    ) {
        return (completedCount[freelancer], totalEarned[freelancer], freelancerMilestones[freelancer].length);
    }

    function getFreelancerMilestoneAt(address freelancer, uint256 index) external view returns (bytes32) {
        if (index >= freelancerMilestones[freelancer].length) revert IndexOutOfBounds();
        return freelancerMilestones[freelancer][index];
    }

    function verifyWorkHash(bytes32 milestoneIdHash, bytes32 workHash) external view returns (bool) {
        return milestones[milestoneIdHash].workHash == workHash;
    }
}
