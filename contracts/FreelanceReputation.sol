// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IContractAgreement {
    enum AgreementStatus { Pending, Signed, Completed, Disputed, Cancelled }

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
    );
}

/**
 * @title FreelanceReputation
 * @dev Immutable on-chain reputation system for freelance marketplace
 * Stores ratings and reviews that cannot be tampered with
 * Ratings are gated: the referenced contract must be Completed and
 * the caller must have been a party to it.
 *
 * Gas optimizations:
 * - contractAgreement is immutable (saves ~2100 gas per call)
 * - Packed Rating struct: rater + score + isEmployerRating + timestamp in 1 slot (saves 3 slots per rating)
 * - Custom errors replace require strings
 * - Unchecked math for totalScore/ratingCount (overflow impossible)
 * - Pagination on array returns (max 100 items) prevents unbounded gas usage
 *
 * Security notes:
 * - block.timestamp used for non-critical timestamps (~15s miner influence acceptable)
 * - All view functions have O(1) or bounded O(n) complexity
 * - No unbounded loops in state-modifying functions
 */
contract FreelanceReputation {
    // Custom errors
    error InvalidRateeAddress();
    error CannotRateSelf();
    error InvalidScore();
    error AlreadyRated();
    error InvalidRatingIndex();
    error InvalidPaginationParams();
    error ContractNotCompleted();
    error NotPartyToContract();
    error InvalidRatee();
    error InvalidContractAgreementAddress();

    IContractAgreement public immutable contractAgreement;

    struct Rating {
        address rater;              // slot 0 — 20 bytes
        uint8 score;                // slot 0 — 1 byte (packed)
        bool isEmployerRating;      // slot 0 — 1 byte (packed)
        uint48 timestamp;           // slot 0 — 6 bytes (packed) = 28/32 bytes
        address ratee;              // slot 1 — 20 bytes
        string comment;             // slot 2
        bytes32 contractIdHash;     // slot 3
    }

    // All ratings stored on-chain
    Rating[] public ratings;

    // Mapping from user address to their received rating indices
    mapping(address => uint256[]) public userRatings;

    // Mapping from user address to their given rating indices
    mapping(address => uint256[]) public givenRatings;

    // Mapping to prevent duplicate ratings per contract
    mapping(bytes32 => bool) public ratingExists;

    // Aggregate scores (cached for gas efficiency)
    mapping(address => uint256) public totalScore;
    mapping(address => uint256) public ratingCount;

    // Events
    event RatingSubmitted(
        uint256 indexed ratingIndex,
        address indexed rater,
        address indexed ratee,
        uint8 score,
        bytes32 contractIdHash
    );

    constructor(address _contractAgreement) {
        if (_contractAgreement == address(0)) revert InvalidContractAgreementAddress();
        contractAgreement = IContractAgreement(_contractAgreement);
    }

    /**
     * @dev Submit a rating for a completed contract
     * @param ratee Address of the user being rated
     * @param score Rating score (1-5)
     * @param comment Review comment
     * @param contractIdHash On-chain contract reference (must be Completed)
     *
     * Note: isEmployerRating is derived on-chain from msg.sender vs the contract's employer
     * address. It is NOT accepted as a caller-supplied parameter — accepting it as input
     * would allow an employer to submit a rating with isEmployerRating=false, corrupting
     * reputation data that consumers use to separate employer-given from freelancer-given ratings.
     *
     * Gas complexity: O(1) - only performs constant-time operations
     */
    function submitRating(
        address ratee,
        uint8 score,
        string calldata comment,
        bytes32 contractIdHash
    ) external returns (uint256) {
        if (ratee == address(0)) revert InvalidRateeAddress();
        if (ratee == msg.sender) revert CannotRateSelf();
        if (score < 1 || score > 5) revert InvalidScore();

        // Verify the contract exists, is completed, and caller was a party
        // slither-disable-next-line unused-return
        (
            ,
            address employer,
            address freelancer,
            ,
            ,
            IContractAgreement.AgreementStatus status,
            ,
            ,

        ) = contractAgreement.getAgreement(contractIdHash);

        if (status != IContractAgreement.AgreementStatus.Completed) revert ContractNotCompleted();
        if (msg.sender != employer && msg.sender != freelancer) revert NotPartyToContract();
        if (ratee != employer && ratee != freelancer) revert InvalidRatee();

        // Derive isEmployerRating from on-chain agreement data rather than trusting the
        // caller-supplied boolean. An employer could otherwise pass isEmployerRating=false
        // to make their rating appear to be from the freelancer, corrupting reputation data.
        bool isEmployerRating = (msg.sender == employer);

        // Check for duplicate rating
        bytes32 ratingKey = keccak256(
            abi.encodePacked(msg.sender, ratee, contractIdHash)
        );
        if (ratingExists[ratingKey]) revert AlreadyRated();
        ratingExists[ratingKey] = true;

        // Create rating
        uint256 ratingIndex = ratings.length;
        // Note: block.timestamp can be influenced by miners within ~15 seconds
        // This is acceptable for reputation timestamps as precision is not critical
        ratings.push(Rating({
            rater: msg.sender,
            score: score,
            isEmployerRating: isEmployerRating,
            timestamp: uint48(block.timestamp),
            ratee: ratee,
            comment: comment,
            contractIdHash: contractIdHash
        }));

        // Update mappings
        userRatings[ratee].push(ratingIndex);
        givenRatings[msg.sender].push(ratingIndex);

        // Update aggregate scores (unchecked: overflow impossible with uint8 scores and uint256 accumulators)
        unchecked {
            totalScore[ratee] += score;
            ratingCount[ratee]++;
        }

        emit RatingSubmitted(ratingIndex, msg.sender, ratee, score, contractIdHash);

        return ratingIndex;
    }

    /**
     * @dev Get average rating for a user (multiplied by 100 for precision)
     * @return Average rating scaled by 100 (e.g., 450 = 4.5 stars)
     * Note: Integer division is intentional - we multiply first to preserve precision
     */
    function getAverageRating(address user) external view returns (uint256) {
        if (ratingCount[user] == 0) return 0;
        // Multiply by 100 before division to preserve 2 decimal places
        return (totalScore[user] * 100) / ratingCount[user];
    }

    /**
     * @dev Get number of ratings received by a user
     */
    function getRatingCount(address user) external view returns (uint256) {
        return ratingCount[user];
    }

    /**
     * @dev Get rating indices for a user with pagination
     * @param user Address of the user
     * @param offset Starting index
     * @param limit Maximum number of results (max 100)
     *
     * Gas complexity: O(n) where n <= 100 (bounded)
     */
    function getUserRatingIndices(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        if (limit == 0 || limit > 100) revert InvalidPaginationParams();

        uint256[] storage allRatings = userRatings[user];
        uint256 total = allRatings.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allRatings[offset + i];
        }

        return result;
    }

    /**
     * @dev Get rating details by index
     */
    function getRating(uint256 index) external view returns (
        address rater,
        address ratee,
        uint8 score,
        string memory comment,
        bytes32 contractIdHash,
        uint256 timestamp,
        bool isEmployerRating
    ) {
        if (index >= ratings.length) revert InvalidRatingIndex();
        Rating storage r = ratings[index];
        return (
            r.rater,
            r.ratee,
            r.score,
            r.comment,
            r.contractIdHash,
            uint256(r.timestamp),
            r.isEmployerRating
        );
    }

    /**
     * @dev Get total number of ratings in the system
     */
    function getTotalRatings() external view returns (uint256) {
        return ratings.length;
    }

    /**
     * @dev Check if a rating exists for a specific contract between two users
     */
    function hasRated(
        address rater,
        address ratee,
        bytes32 contractIdHash
    ) external view returns (bool) {
        bytes32 ratingKey = keccak256(
            abi.encodePacked(rater, ratee, contractIdHash)
        );
        return ratingExists[ratingKey];
    }

    /**
     * @dev Get ratings given by a user with pagination
     * @param user Address of the user
     * @param offset Starting index
     * @param limit Maximum number of results (max 100)
     */
    function getGivenRatingIndices(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        if (limit == 0 || limit > 100) revert InvalidPaginationParams();

        uint256[] storage allRatings = givenRatings[user];
        uint256 total = allRatings.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allRatings[offset + i];
        }

        return result;
    }

    /**
     * @dev Get total count of ratings received by a user
     */
    function getUserRatingCount(address user) external view returns (uint256) {
        return userRatings[user].length;
    }

    /**
     * @dev Get total count of ratings given by a user
     */
    function getGivenRatingCount(address user) external view returns (uint256) {
        return givenRatings[user].length;
    }
}
