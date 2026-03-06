// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title ContractAgreement
 * @dev Stores contract agreement signatures and terms hash on-chain
 * Creates immutable proof that both parties agreed to specific terms
 *
 * Gas optimizations:
 * - owner is immutable (saves ~2100 gas per onlyOwner call)
 * - Removed redundant contractId from struct (saves 1 storage slot per agreement)
 * - Packed status + milestoneCount with employer address (saves 2 storage slots)
 * - Custom errors replace require strings (saves ~200 gas per revert + deploy size)
 * - Inlined modifier checks to avoid redundant SLOADs
 */
contract ContractAgreement {
    // Custom errors
    error OnlyOwner();
    error AgreementNotFound();
    error AgreementAlreadyExists();
    error InvalidAddresses();
    error SameParty();
    error NotParty();
    error NotPending();
    error AlreadySigned();
    error NotSigned();
    error NotActive();
    error CannotCancel();
    error Unauthorized();
    error IndexOutOfBounds();

    address public immutable owner;

    enum AgreementStatus { Pending, Signed, Completed, Disputed, Cancelled }

    struct Agreement {
        bytes32 termsHash;          // slot 0 — 32 bytes
        address employer;           // slot 1 — 20 bytes
        AgreementStatus status;     // slot 1 — 1 byte (packed)
        uint32 milestoneCount;      // slot 1 — 4 bytes (packed)
        address freelancer;         // slot 2 — 20 bytes
        uint256 totalAmount;        // slot 3 — 32 bytes
        uint256 employerSignedAt;   // slot 4
        uint256 freelancerSignedAt; // slot 5
        uint256 createdAt;          // slot 6
    }

    // Mapping from contract ID hash to agreement
    mapping(bytes32 => Agreement) public agreements;
    
    // Track all agreements by address
    mapping(address => bytes32[]) public userAgreements;

    // Events
    event AgreementCreated(bytes32 indexed contractIdHash, address indexed employer, address indexed freelancer, bytes32 termsHash);
    event AgreementSigned(bytes32 indexed contractIdHash, address indexed signer, uint256 timestamp);
    event AgreementCompleted(bytes32 indexed contractIdHash, uint256 timestamp);
    event AgreementDisputed(bytes32 indexed contractIdHash, uint256 timestamp);
    event AgreementCancelled(bytes32 indexed contractIdHash, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Create a new contract agreement (called when proposal is accepted)
     * Only the contract owner (backend relayer) can create agreements
     */
    function createAgreement(
        bytes32 contractIdHash,
        bytes32 termsHash,
        address employer,
        address freelancer,
        uint256 totalAmount,
        uint256 milestoneCount
    ) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (agreements[contractIdHash].createdAt != 0) revert AgreementAlreadyExists();
        if (employer == address(0) || freelancer == address(0)) revert InvalidAddresses();
        if (employer == freelancer) revert SameParty();

        agreements[contractIdHash] = Agreement({
            termsHash: termsHash,
            employer: employer,
            status: AgreementStatus.Pending,
            milestoneCount: uint32(milestoneCount),
            freelancer: freelancer,
            totalAmount: totalAmount,
            employerSignedAt: 0,
            freelancerSignedAt: 0,
            createdAt: block.timestamp
        });

        userAgreements[employer].push(contractIdHash);
        userAgreements[freelancer].push(contractIdHash);

        emit AgreementCreated(contractIdHash, employer, freelancer, termsHash);
    }

    /**
     * @dev Sign the agreement (both parties must sign)
     */
    function signAgreement(bytes32 contractIdHash) external {
        Agreement storage a = agreements[contractIdHash];
        if (a.createdAt == 0) revert AgreementNotFound();
        if (msg.sender != a.employer && msg.sender != a.freelancer) revert NotParty();
        if (a.status != AgreementStatus.Pending) revert NotPending();

        if (msg.sender == a.employer) {
            if (a.employerSignedAt != 0) revert AlreadySigned();
            a.employerSignedAt = block.timestamp;
        } else {
            if (a.freelancerSignedAt != 0) revert AlreadySigned();
            a.freelancerSignedAt = block.timestamp;
        }

        // If both signed, mark as Signed
        if (a.employerSignedAt > 0 && a.freelancerSignedAt > 0) {
            a.status = AgreementStatus.Signed;
        }

        emit AgreementSigned(contractIdHash, msg.sender, block.timestamp);
    }

    /**
     * @dev Mark agreement as completed
     */
    function completeAgreement(bytes32 contractIdHash) external {
        Agreement storage a = agreements[contractIdHash];
        if (a.createdAt == 0) revert AgreementNotFound();
        if (a.status != AgreementStatus.Signed) revert NotSigned();
        if (msg.sender != a.employer && msg.sender != owner) revert Unauthorized();

        a.status = AgreementStatus.Completed;
        emit AgreementCompleted(contractIdHash, block.timestamp);
    }

    /**
     * @dev Mark agreement as disputed
     */
    function disputeAgreement(bytes32 contractIdHash) external {
        Agreement storage a = agreements[contractIdHash];
        if (a.createdAt == 0) revert AgreementNotFound();
        if (msg.sender != a.employer && msg.sender != a.freelancer) revert NotParty();
        if (a.status != AgreementStatus.Signed) revert NotActive();

        a.status = AgreementStatus.Disputed;
        emit AgreementDisputed(contractIdHash, block.timestamp);
    }

    /**
     * @dev Cancel agreement (only if not yet signed by both)
     */
    function cancelAgreement(bytes32 contractIdHash) external {
        Agreement storage a = agreements[contractIdHash];
        if (a.createdAt == 0) revert AgreementNotFound();
        if (msg.sender != a.employer && msg.sender != a.freelancer) revert NotParty();
        if (a.status != AgreementStatus.Pending) revert CannotCancel();

        a.status = AgreementStatus.Cancelled;
        emit AgreementCancelled(contractIdHash, block.timestamp);
    }

    // View functions

    function getAgreement(bytes32 contractIdHash) external view returns (
        bytes32 termsHash,
        address employer,
        address freelancer,
        uint256 totalAmount,
        uint256 milestoneCount,
        AgreementStatus status,
        uint256 employerSignedAt,
        uint256 freelancerSignedAt,
        uint256 createdAt
    ) {
        Agreement storage a = agreements[contractIdHash];
        return (a.termsHash, a.employer, a.freelancer, a.totalAmount, uint256(a.milestoneCount), a.status, a.employerSignedAt, a.freelancerSignedAt, a.createdAt);
    }

    function isFullySigned(bytes32 contractIdHash) external view returns (bool) {
        Agreement storage a = agreements[contractIdHash];
        return a.employerSignedAt > 0 && a.freelancerSignedAt > 0;
    }

    function verifyTerms(bytes32 contractIdHash, bytes32 termsHash) external view returns (bool) {
        return agreements[contractIdHash].termsHash == termsHash;
    }

    function getUserAgreementCount(address user) external view returns (uint256) {
        return userAgreements[user].length;
    }

    function getUserAgreementAt(address user, uint256 index) external view returns (bytes32) {
        if (index >= userAgreements[user].length) revert IndexOutOfBounds();
        return userAgreements[user][index];
    }
}
