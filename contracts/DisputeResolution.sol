// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title DisputeResolution
 * @dev Records dispute outcomes on-chain for transparency
 * Creates immutable record of arbitration decisions
 *
 * Gas optimizations:
 * - owner is immutable (saves ~2100 gas per onlyOwner call)
 * - Removed redundant disputeId from struct (saves 1 storage slot)
 * - Packed outcome + createdAt + resolvedAt with initiator (saves 3 storage slots)
 * - Packed disputesWon/Lost/Split into single DisputeStats struct (saves 2 slots per user)
 * - Custom errors replace require strings
 * - Cached storage reads in resolveDispute
 */
contract DisputeResolution {
    // Custom errors
    error OnlyOwner();
    error DisputeAlreadyExists();
    error InvalidInitiator();
    error InvalidFreelancer();
    error InvalidEmployer();
    error OnlyInitiatorOrOwner();
    error InitiatorMustBeParty();
    error DisputeNotFound();
    error AlreadyResolved();
    error OnlyPartiesOrOwner();
    error InvalidOutcome();

    address public immutable owner;

    enum DisputeOutcome { Pending, FreelancerFavor, EmployerFavor, Split, Cancelled }

    struct DisputeRecord {
        bytes32 contractId;         // slot 0
        bytes32 milestoneId;        // slot 1
        bytes32 evidenceHash;       // slot 2
        address initiator;          // slot 3 — 20 bytes
        DisputeOutcome outcome;     // slot 3 — 1 byte (packed)
        uint48 createdAt;           // slot 3 — 6 bytes (packed)
        uint40 resolvedAt;          // slot 3 — 5 bytes (packed)
        address freelancer;         // slot 4
        address employer;           // slot 5
        address arbiter;            // slot 6
        uint256 amount;             // slot 7
        string reasoning;           // slot 8
    }

    mapping(bytes32 => DisputeRecord) public disputes;
    mapping(address => bytes32[]) public userDisputes;

    // Packed dispute stats per user (3 values in 1 slot instead of 3 slots)
    struct DisputeStats {
        uint64 won;
        uint64 lost;
        uint64 split;
    }
    mapping(address => DisputeStats) public disputeStats;

    event DisputeCreated(bytes32 indexed disputeIdHash, bytes32 indexed contractId, address indexed initiator);
    event EvidenceSubmitted(bytes32 indexed disputeIdHash, bytes32 evidenceHash);
    event DisputeResolved(bytes32 indexed disputeIdHash, DisputeOutcome outcome, address arbiter, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Create dispute record on-chain
     * Only the initiator themselves or the contract owner (backend relayer) can create
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
        if (disputes[disputeIdHash].createdAt != 0) revert DisputeAlreadyExists();
        if (initiator == address(0)) revert InvalidInitiator();
        if (freelancer == address(0)) revert InvalidFreelancer();
        if (employer == address(0)) revert InvalidEmployer();
        if (msg.sender != initiator && msg.sender != owner) revert OnlyInitiatorOrOwner();
        if (initiator != freelancer && initiator != employer) revert InitiatorMustBeParty();

        disputes[disputeIdHash] = DisputeRecord({
            contractId: contractId,
            milestoneId: milestoneId,
            evidenceHash: bytes32(0),
            initiator: initiator,
            outcome: DisputeOutcome.Pending,
            createdAt: uint48(block.timestamp),
            resolvedAt: 0,
            freelancer: freelancer,
            employer: employer,
            arbiter: address(0),
            amount: amount,
            reasoning: ""
        });

        userDisputes[freelancer].push(disputeIdHash);
        userDisputes[employer].push(disputeIdHash);

        emit DisputeCreated(disputeIdHash, contractId, initiator);
    }

    /**
     * @dev Update evidence hash (aggregated hash of all evidence)
     * Only dispute parties or the contract owner can update evidence
     */
    function updateEvidence(bytes32 disputeIdHash, bytes32 evidenceHash) external {
        DisputeRecord storage d = disputes[disputeIdHash];
        if (d.createdAt == 0) revert DisputeNotFound();
        if (d.outcome != DisputeOutcome.Pending) revert AlreadyResolved();
        if (msg.sender != d.freelancer && msg.sender != d.employer && msg.sender != owner) revert OnlyPartiesOrOwner();

        d.evidenceHash = evidenceHash;
        emit EvidenceSubmitted(disputeIdHash, evidenceHash);
    }

    /**
     * @dev Resolve dispute with outcome
     * Only the contract owner (acting as arbiter/admin) can resolve disputes
     */
    function resolveDispute(
        bytes32 disputeIdHash,
        DisputeOutcome outcome,
        string calldata reasoning,
        address arbiter
    ) external {
        if (msg.sender != owner) revert OnlyOwner();
        DisputeRecord storage d = disputes[disputeIdHash];
        if (d.createdAt == 0) revert DisputeNotFound();
        if (d.outcome != DisputeOutcome.Pending) revert AlreadyResolved();
        if (outcome == DisputeOutcome.Pending) revert InvalidOutcome();

        d.outcome = outcome;
        d.reasoning = reasoning;
        d.arbiter = arbiter;
        d.resolvedAt = uint40(block.timestamp);

        // Cache addresses to avoid repeated SLOADs
        address _freelancer = d.freelancer;
        address _employer = d.employer;

        // Update win/loss/split stats
        if (outcome == DisputeOutcome.FreelancerFavor) {
            disputeStats[_freelancer].won++;
            disputeStats[_employer].lost++;
        } else if (outcome == DisputeOutcome.EmployerFavor) {
            disputeStats[_employer].won++;
            disputeStats[_freelancer].lost++;
        } else if (outcome == DisputeOutcome.Split) {
            disputeStats[_freelancer].split++;
            disputeStats[_employer].split++;
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
        return (d.contractId, d.milestoneId, d.evidenceHash, d.initiator, d.freelancer, d.employer, d.amount, d.outcome, uint256(d.createdAt), uint256(d.resolvedAt));
    }

    function getUserDisputeStats(address user) external view returns (uint256 won, uint256 lost, uint256 split, uint256 total) {
        DisputeStats storage s = disputeStats[user];
        return (uint256(s.won), uint256(s.lost), uint256(s.split), userDisputes[user].length);
    }

    function isResolved(bytes32 disputeIdHash) external view returns (bool) {
        return disputes[disputeIdHash].outcome != DisputeOutcome.Pending;
    }
}
