// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DisputeResolution
 * @dev Records dispute outcomes on-chain for transparency
 * Creates immutable record of arbitration decisions
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
     */
    function updateEvidence(bytes32 disputeIdHash, bytes32 evidenceHash) external {
        DisputeRecord storage d = disputes[disputeIdHash];
        require(d.createdAt > 0, "Not found");
        require(d.outcome == DisputeOutcome.Pending, "Already resolved");

        d.evidenceHash = evidenceHash;
        emit EvidenceSubmitted(disputeIdHash, evidenceHash);
    }

    /**
     * @dev Resolve dispute with outcome
     */
    function resolveDispute(
        bytes32 disputeIdHash,
        DisputeOutcome outcome,
        string calldata reasoning,
        address arbiter
    ) external {
        DisputeRecord storage d = disputes[disputeIdHash];
        require(d.createdAt > 0, "Not found");
        require(d.outcome == DisputeOutcome.Pending, "Already resolved");
        require(outcome != DisputeOutcome.Pending, "Invalid outcome");

        d.outcome = outcome;
        d.reasoning = reasoning;
        d.arbiter = arbiter;
        d.resolvedAt = block.timestamp;

        // Update win/loss stats
        if (outcome == DisputeOutcome.FreelancerFavor) {
            disputesWon[d.freelancer]++;
            disputesLost[d.employer]++;
        } else if (outcome == DisputeOutcome.EmployerFavor) {
            disputesWon[d.employer]++;
            disputesLost[d.freelancer]++;
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

    function getUserDisputeStats(address user) external view returns (uint256 won, uint256 lost, uint256 total) {
        return (disputesWon[user], disputesLost[user], userDisputes[user].length);
    }

    function isResolved(bytes32 disputeIdHash) external view returns (bool) {
        return disputes[disputeIdHash].outcome != DisputeOutcome.Pending;
    }
}
