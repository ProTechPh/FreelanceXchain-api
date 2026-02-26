// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DisputeResolution
 * @dev Records dispute outcomes on-chain for transparency
 * Creates immutable record of arbitration decisions
 * 
 * FIXED: Added access control - only designated parties can create/resolve disputes
 * FIXED: Split outcome now updates stats for both parties
 * FIXED: Only contract parties can update evidence
 */
contract DisputeResolution {
    address public owner;

    enum DisputeOutcome { Pending, FreelancerFavor, EmployerFavor, Split, Cancelled }

    struct DisputeRecord {
        bytes32 disputeId;
        bytes32 contractId;
        bytes32 milestoneId;
        bytes32 evidenceHash;       // Hash of all evidence
        address initiator;
        address freelancer;
        address employer;
        address arbiter;
        uint256 amount;
        DisputeOutcome outcome;
        string reasoning;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    mapping(bytes32 => DisputeRecord) public disputes;
    mapping(address => bytes32[]) public userDisputes;
    mapping(address => uint256) public disputesWon;
    mapping(address => uint256) public disputesLost;
    mapping(address => uint256) public disputesSplit;

    event DisputeCreated(bytes32 indexed disputeIdHash, bytes32 indexed contractId, address indexed initiator);
    event EvidenceSubmitted(bytes32 indexed disputeIdHash, bytes32 evidenceHash);
    event DisputeResolved(bytes32 indexed disputeIdHash, DisputeOutcome outcome, address arbiter, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Create dispute record on-chain
     * ACCESS CONTROL: Only the initiator themselves or the contract owner (backend relayer) can create
     */
    function createDispute(
        bytes32 disputeIdHash,
        bytes32 contractId,
        bytes32 milestoneId,
        address initiator,
        address freelancer,
        address employer,
        uint256 amount
    ) external {
        require(disputes[disputeIdHash].createdAt == 0, "Dispute exists");
        require(initiator != address(0), "Invalid initiator");
        require(freelancer != address(0), "Invalid freelancer");
        require(employer != address(0), "Invalid employer");
        // Access control: only the initiator or the contract owner can create disputes
        require(
            msg.sender == initiator || msg.sender == owner,
            "Only initiator or owner can create disputes"
        );
        // Verify initiator is a party to the contract
        require(
            initiator == freelancer || initiator == employer,
            "Initiator must be a contract party"
        );

        disputes[disputeIdHash] = DisputeRecord({
            disputeId: disputeIdHash,
            contractId: contractId,
            milestoneId: milestoneId,
            evidenceHash: bytes32(0),
            initiator: initiator,
            freelancer: freelancer,
            employer: employer,
            arbiter: address(0),
            amount: amount,
            outcome: DisputeOutcome.Pending,
            reasoning: "",
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        userDisputes[freelancer].push(disputeIdHash);
        userDisputes[employer].push(disputeIdHash);

        emit DisputeCreated(disputeIdHash, contractId, initiator);
    }

    /**
     * @dev Update evidence hash (aggregated hash of all evidence)
     * ACCESS CONTROL: Only dispute parties or the contract owner can update evidence
     */
    function updateEvidence(bytes32 disputeIdHash, bytes32 evidenceHash) external {
        DisputeRecord storage d = disputes[disputeIdHash];
        require(d.createdAt > 0, "Not found");
        require(d.outcome == DisputeOutcome.Pending, "Already resolved");
        // Access control: only parties to the dispute or owner can submit evidence
        require(
            msg.sender == d.freelancer || msg.sender == d.employer || msg.sender == owner,
            "Only dispute parties or owner can update evidence"
        );

        d.evidenceHash = evidenceHash;
        emit EvidenceSubmitted(disputeIdHash, evidenceHash);
    }

    /**
     * @dev Resolve dispute with outcome
     * ACCESS CONTROL: Only the contract owner (acting as arbiter/admin) can resolve disputes
     */
    function resolveDispute(
        bytes32 disputeIdHash,
        DisputeOutcome outcome,
        string calldata reasoning,
        address arbiter
    ) external onlyOwner {
        DisputeRecord storage d = disputes[disputeIdHash];
        require(d.createdAt > 0, "Not found");
        require(d.outcome == DisputeOutcome.Pending, "Already resolved");
        require(outcome != DisputeOutcome.Pending, "Invalid outcome");

        d.outcome = outcome;
        d.reasoning = reasoning;
        d.arbiter = arbiter;
        d.resolvedAt = block.timestamp;

        // Update win/loss/split stats
        if (outcome == DisputeOutcome.FreelancerFavor) {
            disputesWon[d.freelancer]++;
            disputesLost[d.employer]++;
        } else if (outcome == DisputeOutcome.EmployerFavor) {
            disputesWon[d.employer]++;
            disputesLost[d.freelancer]++;
        } else if (outcome == DisputeOutcome.Split) {
            // FIXED: Split now updates stats for both parties
            disputesSplit[d.freelancer]++;
            disputesSplit[d.employer]++;
        }

        emit DisputeResolved(disputeIdHash, outcome, arbiter, block.timestamp);
    }

    // View functions

    function getDispute(bytes32 disputeIdHash) external view returns (
        bytes32 contractId,
        bytes32 milestoneId,
        bytes32 evidenceHash,
        address initiator,
        address freelancer,
        address employer,
        uint256 amount,
        DisputeOutcome outcome,
        uint256 createdAt,
        uint256 resolvedAt
    ) {
        DisputeRecord storage d = disputes[disputeIdHash];
        return (d.contractId, d.milestoneId, d.evidenceHash, d.initiator, d.freelancer, d.employer, d.amount, d.outcome, d.createdAt, d.resolvedAt);
    }

    function getUserDisputeStats(address user) external view returns (uint256 won, uint256 lost, uint256 split, uint256 total) {
        return (disputesWon[user], disputesLost[user], disputesSplit[user], userDisputes[user].length);
    }

    function isResolved(bytes32 disputeIdHash) external view returns (bool) {
        return disputes[disputeIdHash].outcome != DisputeOutcome.Pending;
    }
}
