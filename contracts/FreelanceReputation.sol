// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title FreelanceReputation
 * @dev Immutable on-chain reputation system for freelance marketplace
 * Stores ratings and reviews that cannot be tampered with
 *
 * Gas optimizations:
 * - owner is immutable (saves ~2100 gas per call)
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
    error OnlyOwner();
    error InvalidRateeAddress();
    error CannotRateSelf();
    error InvalidScore();
    error ContractIdRequired();
    error AlreadyRated();
    error InvalidRatingIndex();
    error InvalidPaginationParams();

    // Immutable owner - stored in bytecode, minimal gas cost to read
    address public immutable owner;
    
    struct Rating {
        address rater;              // slot 0 — 20 bytes
        uint8 score;                // slot 0 — 1 byte (packed)
        bool isEmployerRating;      // slot 0 — 1 byte (packed)
        uint48 timestamp;           // slot 0 — 6 bytes (packed) = 28/32 bytes
        address ratee;              // slot 1 — 20 bytes
        string comment;             // slot 2
        string contractId;          // slot 3
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
        string contractId
    );
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Submit a rating for a completed contract
     * @param ratee Address of the user being rated
     * @param score Rating score (1-5)
     * @param comment Review comment
     * @param contractId Off-chain contract reference
     * @param isEmployerRating True if employer is rating freelancer
     * 
     * Gas complexity: O(1) - only performs constant-time operations
     * - Array push operations are O(1)
     * - No loops or unbounded operations
     */
    function submitRating(
        address ratee,
        uint8 score,
        string calldata comment,
        string calldata contractId,
        bool isEmployerRating
    ) external returns (uint256) {
        if (ratee == address(0)) revert InvalidRateeAddress();
        if (ratee == msg.sender) revert CannotRateSelf();
        if (score < 1 || score > 5) revert InvalidScore();
        if (bytes(contractId).length == 0) revert ContractIdRequired();
        
        // Check for duplicate rating
        bytes32 ratingKey = keccak256(
            abi.encodePacked(msg.sender, ratee, contractId)
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
            contractId: contractId
        }));
        
        // Update mappings
        userRatings[ratee].push(ratingIndex);
        givenRatings[msg.sender].push(ratingIndex);
        
        // Update aggregate scores (unchecked: overflow impossible with uint8 scores)
        unchecked {
            totalScore[ratee] += score;
            ratingCount[ratee]++;
        }
        
        emit RatingSubmitted(ratingIndex, msg.sender, ratee, score, contractId);
        
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
     * Loop iterations are strictly bounded: resultLength <= limit <= 100
     * This ensures the function will never exceed block gas limit
     */
    function getUserRatingIndices(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        // Enforce maximum limit of 100 to prevent unbounded gas usage
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
        
        // resultLength is guaranteed <= limit <= 100
        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);
        
        // Loop is bounded: i < resultLength <= 100
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = allRatings[offset + i];
        }
        
        return result;
    }
    
    /**
     * @dev Get rating details by index
     * @param index The rating index to retrieve
     * Note: This is a pure read operation with O(1) complexity
     */
    function getRating(uint256 index) external view returns (
        address rater,
        address ratee,
        uint8 score,
        string memory comment,
        string memory contractId,
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
            r.contractId,
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
     * @param rater Address of the user who gave the rating
     * @param ratee Address of the user who received the rating
     * @param contractId The contract identifier
     * Note: This is a pure mapping lookup with O(1) complexity
     */
    function hasRated(
        address rater,
        address ratee,
        string calldata contractId
    ) external view returns (bool) {
        bytes32 ratingKey = keccak256(
            abi.encodePacked(rater, ratee, contractId)
        );
        return ratingExists[ratingKey];
    }
    
    /**
     * @dev Get ratings given by a user with pagination
     * @param user Address of the user
     * @param offset Starting index
     * @param limit Maximum number of results (max 100)
     * 
     * Gas complexity: O(n) where n <= 100 (bounded)
     * Loop iterations are strictly bounded: resultLength <= limit <= 100
     * This ensures the function will never exceed block gas limit
     */
    function getGivenRatingIndices(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        // Enforce maximum limit of 100 to prevent unbounded gas usage
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
        
        // resultLength is guaranteed <= limit <= 100
        uint256 resultLength = end - offset;
        uint256[] memory result = new uint256[](resultLength);
        
        // Loop is bounded: i < resultLength <= 100
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
