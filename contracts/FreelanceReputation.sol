// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FreelanceReputation
 * @dev Immutable on-chain reputation system for freelance marketplace
 * Stores ratings and reviews that cannot be tampered with
 */
contract FreelanceReputation {
    address public owner;
    
    struct Rating {
        address rater;
        address ratee;
        uint8 score; // 1-5
        string comment;
        string contractId; // Off-chain contract reference
        uint256 timestamp;
        bool isEmployerRating; // true if employer rating freelancer
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
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
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
     */
    function submitRating(
        address ratee,
        uint8 score,
        string calldata comment,
        string calldata contractId,
        bool isEmployerRating
    ) external returns (uint256) {
        require(ratee != address(0), "Invalid ratee address");
        require(ratee != msg.sender, "Cannot rate yourself");
        require(score >= 1 && score <= 5, "Score must be 1-5");
        require(bytes(contractId).length > 0, "Contract ID required");
        
        // Check for duplicate rating
        bytes32 ratingKey = keccak256(
            abi.encodePacked(msg.sender, ratee, contractId)
        );
        require(!ratingExists[ratingKey], "Already rated for this contract");
        ratingExists[ratingKey] = true;
        
        // Create rating
        uint256 ratingIndex = ratings.length;
        ratings.push(Rating({
            rater: msg.sender,
            ratee: ratee,
            score: score,
            comment: comment,
            contractId: contractId,
            timestamp: block.timestamp,
            isEmployerRating: isEmployerRating
        }));
        
        // Update mappings
        userRatings[ratee].push(ratingIndex);
        givenRatings[msg.sender].push(ratingIndex);
        
        // Update aggregate scores
        totalScore[ratee] += score;
        ratingCount[ratee]++;
        
        emit RatingSubmitted(ratingIndex, msg.sender, ratee, score, contractId);
        
        return ratingIndex;
    }
    
    /**
     * @dev Get average rating for a user (multiplied by 100 for precision)
     */
    function getAverageRating(address user) external view returns (uint256) {
        if (ratingCount[user] == 0) return 0;
        return (totalScore[user] * 100) / ratingCount[user];
    }
    
    /**
     * @dev Get number of ratings received by a user
     */
    function getRatingCount(address user) external view returns (uint256) {
        return ratingCount[user];
    }
    
    /**
     * @dev Get all rating indices for a user
     */
    function getUserRatingIndices(address user) external view returns (uint256[] memory) {
        return userRatings[user];
    }
    
    /**
     * @dev Get rating details by index
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
        require(index < ratings.length, "Invalid rating index");
        Rating storage r = ratings[index];
        return (
            r.rater,
            r.ratee,
            r.score,
            r.comment,
            r.contractId,
            r.timestamp,
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
        string calldata contractId
    ) external view returns (bool) {
        bytes32 ratingKey = keccak256(
            abi.encodePacked(rater, ratee, contractId)
        );
        return ratingExists[ratingKey];
    }
    
    /**
     * @dev Get ratings given by a user
     */
    function getGivenRatingIndices(address user) external view returns (uint256[] memory) {
        return givenRatings[user];
    }
}
