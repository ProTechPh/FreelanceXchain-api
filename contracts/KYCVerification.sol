// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title KYCVerification
 * @dev Stores KYC verification status on-chain for transparency and immutability
 * @notice Only stores verification status and hashes, NOT personal data (GDPR compliant)
 */
contract KYCVerification {
    address public owner;
    address public verifier;

    enum VerificationStatus { None, Pending, Approved, Rejected, Expired }
    enum KycTier { None, Basic, Standard, Enhanced }

    struct Verification {
        VerificationStatus status;
        KycTier tier;
        bytes32 dataHash;          // Hash of KYC data (proof without revealing data)
        uint256 verifiedAt;        // Timestamp of verification
        uint256 expiresAt;         // Expiration timestamp
        address verifiedBy;        // Address of verifier
        string rejectionReason;    // Only set if rejected
    }

    // Mapping from wallet address to verification
    mapping(address => Verification) public verifications;
    
    // Mapping from userId (off-chain) to wallet address
    mapping(bytes32 => address) public userIdToWallet;

    // Events
    event VerificationSubmitted(address indexed wallet, bytes32 indexed userId, bytes32 dataHash);
    event VerificationApproved(address indexed wallet, KycTier tier, uint256 expiresAt);
    event VerificationRejected(address indexed wallet, string reason);
    event VerificationExpired(address indexed wallet);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier || msg.sender == owner, "Only verifier can call this function");
        _;
    }

    constructor() {
        owner = msg.sender;
        verifier = msg.sender;
    }

    /**
     * @dev Submit KYC verification request (called by user or backend)
     * @param wallet The wallet address to verify
     * @param userId Hash of the off-chain user ID
     * @param dataHash Hash of the KYC data (for proof)
     */
    function submitVerification(
        address wallet,
        bytes32 userId,
        bytes32 dataHash
    ) external {
        require(wallet != address(0), "Invalid wallet address");
        require(dataHash != bytes32(0), "Invalid data hash");
        
        Verification storage v = verifications[wallet];
        require(
            v.status == VerificationStatus.None || 
            v.status == VerificationStatus.Rejected ||
            v.status == VerificationStatus.Expired,
            "Verification already pending or approved"
        );

        v.status = VerificationStatus.Pending;
        v.dataHash = dataHash;
        v.verifiedAt = 0;
        v.expiresAt = 0;
        v.verifiedBy = address(0);
        v.rejectionReason = "";

        userIdToWallet[userId] = wallet;

        emit VerificationSubmitted(wallet, userId, dataHash);
    }

    /**
     * @dev Approve KYC verification (only verifier)
     * @param wallet The wallet address to approve
     * @param tier The KYC tier level
     * @param validityDays Number of days the verification is valid
     */
    function approveVerification(
        address wallet,
        KycTier tier,
        uint256 validityDays
    ) external onlyVerifier {
        require(wallet != address(0), "Invalid wallet address");
        require(tier != KycTier.None, "Invalid tier");
        require(validityDays > 0, "Validity must be positive");

        Verification storage v = verifications[wallet];
        require(v.status == VerificationStatus.Pending, "No pending verification");

        v.status = VerificationStatus.Approved;
        v.tier = tier;
        v.verifiedAt = block.timestamp;
        v.expiresAt = block.timestamp + (validityDays * 1 days);
        v.verifiedBy = msg.sender;

        emit VerificationApproved(wallet, tier, v.expiresAt);
    }

    /**
     * @dev Reject KYC verification (only verifier)
     * @param wallet The wallet address to reject
     * @param reason Rejection reason
     */
    function rejectVerification(
        address wallet,
        string calldata reason
    ) external onlyVerifier {
        require(wallet != address(0), "Invalid wallet address");

        Verification storage v = verifications[wallet];
        require(v.status == VerificationStatus.Pending, "No pending verification");

        v.status = VerificationStatus.Rejected;
        v.rejectionReason = reason;
        v.verifiedAt = block.timestamp;
        v.verifiedBy = msg.sender;

        emit VerificationRejected(wallet, reason);
    }

    /**
     * @dev Mark verification as expired (can be called by anyone)
     * @param wallet The wallet address to expire
     */
    function expireVerification(address wallet) external {
        Verification storage v = verifications[wallet];
        require(v.status == VerificationStatus.Approved, "Not approved");
        require(block.timestamp > v.expiresAt, "Not yet expired");

        v.status = VerificationStatus.Expired;
        emit VerificationExpired(wallet);
    }

    /**
     * @dev Check if a wallet is verified
     * @param wallet The wallet address to check
     * @return verified Whether the wallet is currently verified
     * @return tier The KYC tier level
     */
    function isVerified(address wallet) external view returns (bool verified, KycTier tier) {
        Verification storage v = verifications[wallet];
        if (v.status == VerificationStatus.Approved && block.timestamp <= v.expiresAt) {
            return (true, v.tier);
        }
        return (false, KycTier.None);
    }

    /**
     * @dev Get full verification details
     * @param wallet The wallet address
     */
    function getVerification(address wallet) external view returns (
        VerificationStatus status,
        KycTier tier,
        bytes32 dataHash,
        uint256 verifiedAt,
        uint256 expiresAt,
        address verifiedBy
    ) {
        Verification storage v = verifications[wallet];
        return (v.status, v.tier, v.dataHash, v.verifiedAt, v.expiresAt, v.verifiedBy);
    }

    /**
     * @dev Get wallet address by user ID hash
     * @param userId Hash of the user ID
     */
    function getWalletByUserId(bytes32 userId) external view returns (address) {
        return userIdToWallet[userId];
    }

    /**
     * @dev Update verifier address (only owner)
     * @param newVerifier New verifier address
     */
    function setVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Invalid verifier address");
        address oldVerifier = verifier;
        verifier = newVerifier;
        emit VerifierUpdated(oldVerifier, newVerifier);
    }

    /**
     * @dev Transfer ownership (only owner)
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
