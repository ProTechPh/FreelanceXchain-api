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
    error InvalidArbiter();
    error IndexOutOfBounds();

    address public immutable owner;

    enum DisputeOutcome { Pending, FreelancerFavor, EmployerFavor, Split, Cancelled }

    struct DisputeRecord {
        bytes32 contractId;         // slot 0
        bytes32 milestoneId;        // slot 1
        address initiator;          // slot 2 — 20 bytes
        DisputeOutcome outcome;     // slot 2 — 1 byte (packed)
        uint48 createdAt;           // slot 2 — 6 bytes (packed)
        uint48 resolvedAt;          // slot 2 — 6 bytes (packed; matches createdAt width for consistency)
        address freelancer;         // slot 3
        address employer;           // slot 4
        address arbiter;            // slot 5
        uint256 amount;             // slot 6
        string reasoning;           // slot 7
        bytes32[] evidenceHashes;   // slot 8 — append-only evidence log
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
    event EvidenceSubmitted(bytes32 indexed disputeIdHash, bytes32 evidenceHash, address indexed submitter, uint256 timestamp);
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

        DisputeRecord storage d = disputes[disputeIdHash];
        d.contractId = contractId;
        d.milestoneId = milestoneId;
        d.initiator = initiator;
        d.outcome = DisputeOutcome.Pending;
        d.createdAt = uint48(block.timestamp);
        d.resolvedAt = 0;
        d.freelancer = freelancer;
        d.employer = employer;
        d.arbiter = address(0);
        d.amount = amount;
        d.reasoning = "";
        // evidenceHashes starts as an empty dynamic array

        userDisputes[freelancer].push(disputeIdHash);
        userDisputes[employer].push(disputeIdHash);

        emit DisputeCreated(disputeIdHash, contractId, initiator);
    }

    /**
     * @dev Submit evidence hash (append-only — prior evidence cannot be overwritten)
     * Only dispute parties or the contract owner can submit evidence
     */
    function submitEvidence(bytes32 disputeIdHash, bytes32 evidenceHash) external {
        DisputeRecord storage d = disputes[disputeIdHash];
        if (d.createdAt == 0) revert DisputeNotFound();
        if (d.outcome != DisputeOutcome.Pending) revert AlreadyResolved();
        if (msg.sender != d.freelancer && msg.sender != d.employer && msg.sender != owner) revert OnlyPartiesOrOwner();

        d.evidenceHashes.push(evidenceHash);
        emit EvidenceSubmitted(disputeIdHash, evidenceHash, msg.sender, block.timestamp);
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
        if (arbiter == address(0)) revert InvalidArbiter();
        DisputeRecord storage d = disputes[disputeIdHash];
        if (d.createdAt == 0) revert DisputeNotFound();
        if (d.outcome != DisputeOutcome.Pending) revert AlreadyResolved();
        if (outcome == DisputeOutcome.Pending) revert InvalidOutcome();

        d.outcome = outcome;
        d.reasoning = reasoning;
        d.arbiter = arbiter;
        d.resolvedAt = uint48(block.timestamp);

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
        } else {
            // DisputeOutcome.Cancelled — no win/loss recorded intentionally
        }

        emit DisputeResolved(disputeIdHash, outcome, arbiter, block.timestamp);
    }

    // View functions

    function getDispute(bytes32 disputeIdHash) external view returns (
        bytes32 contractId,
        bytes32 milestoneId,
        address initiator,
        address freelancer,
        address employer,
        uint256 amount,
        DisputeOutcome outcome,
        uint256 createdAt,
        uint256 resolvedAt
    ) {
        DisputeRecord storage d = disputes[disputeIdHash];
        return (d.contractId, d.milestoneId, d.initiator, d.freelancer, d.employer, d.amount, d.outcome, uint256(d.createdAt), uint256(d.resolvedAt));
    }

    function getEvidenceCount(bytes32 disputeIdHash) external view returns (uint256) {
        return disputes[disputeIdHash].evidenceHashes.length;
    }

    function getEvidenceAt(bytes32 disputeIdHash, uint256 index) external view returns (bytes32) {
        DisputeRecord storage d = disputes[disputeIdHash];
        if (index >= d.evidenceHashes.length) revert IndexOutOfBounds();
        return d.evidenceHashes[index];
    }

    function getUserDisputeStats(address user) external view returns (uint256 won, uint256 lost, uint256 split, uint256 total) {
        DisputeStats storage s = disputeStats[user];
        return (uint256(s.won), uint256(s.lost), uint256(s.split), userDisputes[user].length);
    }

    function isResolved(bytes32 disputeIdHash) external view returns (bool) {
        return disputes[disputeIdHash].outcome != DisputeOutcome.Pending;
    }
}
