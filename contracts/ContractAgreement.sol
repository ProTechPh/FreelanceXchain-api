// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ContractAgreement
 * @dev Stores contract agreement signatures and terms hash on-chain
 * Creates immutable proof that both parties agreed to specific terms
 */
contract ContractAgreement {
    address public owner;

    enum AgreementStatus { Pending, Signed, Completed, Disputed, Cancelled }

    struct Agreement {
        bytes32 contractId;         // Hash of off-chain contract ID
        bytes32 termsHash;          // Hash of contract terms
        address employer;
        address freelancer;
        uint256 totalAmount;
        uint256 milestoneCount;
        AgreementStatus status;
        uint256 employerSignedAt;
        uint256 freelancerSignedAt;
        uint256 createdAt;
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

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier agreementExists(bytes32 contractIdHash) {
        require(agreements[contractIdHash].createdAt > 0, "Agreement not found");
        _;
    }

    modifier onlyParty(bytes32 contractIdHash) {
        Agreement storage a = agreements[contractIdHash];
        require(msg.sender == a.employer || msg.sender == a.freelancer, "Not a party");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Create a new contract agreement (called when proposal is accepted)
     * FIXED: Added access control - only the contract owner (backend relayer) can create agreements
     * This prevents anyone from creating fake agreements with arbitrary employer/freelancer addresses
     */
    function createAgreement(
        bytes32 contractIdHash,
        bytes32 termsHash,
        address employer,
        address freelancer,
        uint256 totalAmount,
        uint256 milestoneCount
    ) external onlyOwner {
        require(agreements[contractIdHash].createdAt == 0, "Agreement exists");
        require(employer != address(0) && freelancer != address(0), "Invalid addresses");
        require(employer != freelancer, "Same party");

        agreements[contractIdHash] = Agreement({
            contractId: contractIdHash,
            termsHash: termsHash,
            employer: employer,
            freelancer: freelancer,
            totalAmount: totalAmount,
            milestoneCount: milestoneCount,
            status: AgreementStatus.Pending,
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
    function signAgreement(bytes32 contractIdHash) external agreementExists(contractIdHash) onlyParty(contractIdHash) {
        Agreement storage a = agreements[contractIdHash];
        require(a.status == AgreementStatus.Pending, "Not pending");

        if (msg.sender == a.employer) {
            require(a.employerSignedAt == 0, "Already signed");
            a.employerSignedAt = block.timestamp;
        } else {
            require(a.freelancerSignedAt == 0, "Already signed");
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
    function completeAgreement(bytes32 contractIdHash) external agreementExists(contractIdHash) {
        Agreement storage a = agreements[contractIdHash];
        require(a.status == AgreementStatus.Signed, "Not signed");
        require(msg.sender == a.employer || msg.sender == owner, "Unauthorized");

        a.status = AgreementStatus.Completed;
        emit AgreementCompleted(contractIdHash, block.timestamp);
    }

    /**
     * @dev Mark agreement as disputed
     */
    function disputeAgreement(bytes32 contractIdHash) external agreementExists(contractIdHash) onlyParty(contractIdHash) {
        Agreement storage a = agreements[contractIdHash];
        require(a.status == AgreementStatus.Signed, "Not active");

        a.status = AgreementStatus.Disputed;
        emit AgreementDisputed(contractIdHash, block.timestamp);
    }

    /**
     * @dev Cancel agreement (only if not yet signed by both)
     */
    function cancelAgreement(bytes32 contractIdHash) external agreementExists(contractIdHash) onlyParty(contractIdHash) {
        Agreement storage a = agreements[contractIdHash];
        require(a.status == AgreementStatus.Pending, "Cannot cancel");

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
        return (a.termsHash, a.employer, a.freelancer, a.totalAmount, a.milestoneCount, a.status, a.employerSignedAt, a.freelancerSignedAt, a.createdAt);
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
        require(index < userAgreements[user].length, "Index out of bounds");
        return userAgreements[user][index];
    }
}
