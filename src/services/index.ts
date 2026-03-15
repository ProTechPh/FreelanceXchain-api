// Services barrel export
// This file will export all services as they are created

export {
  register,
  login,
  validateToken,
  refreshTokens,
  isAuthError,
} from './auth-service.js';

export type {
  RegisterInput,
  LoginInput,
  TokenPayload,
  AuthResult,
  AuthError,
} from './auth-types.js';

export {
  createCategory,
  getCategoryById,
  updateCategory,
  getAllCategories,
  getActiveCategories,
  createSkill,
  getSkillById,
  updateSkill,
  deprecateSkill,
  getAllSkills,
  getActiveSkills,
  getSkillsByCategory,
  getActiveSkillsByCategory,
  searchSkills,
  getFullTaxonomy,
  validateSkillIds,
} from './skill-service.js';

export type {
  SkillServiceError,
  SkillServiceResult,
} from './skill-service.js';

export {
  createProfile as createFreelancerProfile,
  getProfileByUserId as getFreelancerProfileByUserId,
  updateProfile as updateFreelancerProfile,
  addSkillsToProfile,
  removeSkillFromProfile,
  addExperience,
  updateExperience,
  removeExperience,
} from './freelancer-profile-service.js';

export type {
  CreateFreelancerProfileInput,
  UpdateFreelancerProfileInput,
  AddSkillInput,
  AddExperienceInput,
  FreelancerProfileServiceError,
  FreelancerProfileServiceResult,
} from './freelancer-profile-service.js';

export {
  createEmployerProfile,
  getEmployerProfileByUserId,
  updateEmployerProfile,
} from './employer-profile-service.js';

export type {
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
  EmployerProfileServiceError,
  EmployerProfileServiceResult,
} from './employer-profile-service.js';

export {
  createProject,
  getProjectById,
  updateProject,
  addMilestones,
  setMilestones,
  listProjectsByEmployer,
  listOpenProjects,
  listProjectsByStatus,
  searchProjects as searchProjectsByKeyword,
  listProjectsBySkills,
  listProjectsByBudgetRange,
  deleteProject,
} from './project-service.js';

export type {
  CreateProjectInput,
  UpdateProjectInput,
  AddMilestoneInput,
  ProjectWithProposalCount,
  ProjectServiceError,
  ProjectServiceResult,
} from './project-service.js';

export {
  searchProjects,
  searchFreelancers,
} from './search-service.js';

export type {
  ProjectSearchFilters,
  FreelancerSearchFilters,
  SearchPaginationInput,
  SearchResultMetadata,
  SearchResult,
  SearchServiceError,
  SearchServiceResult,
} from './search-service.js';

export {
  submitProposal,
  getProposalById,
  getProposalsByProject,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} from './proposal-service.js';

export type {
  CreateProposalInput,
  ProposalServiceError,
  ProposalServiceResult,
  ProposalWithNotification,
  AcceptProposalResult,
  RejectProposalResult,
} from './proposal-service.js';

export {
  getContractById,
  getUserContracts,
  getContractsByFreelancer,
  getContractsByEmployer,
  getContractsByProject,
  updateContractStatus,
  setEscrowAddress,
  getContractByProposalId,
} from './contract-service.js';

export type {
  ContractServiceError,
  ContractServiceResult,
} from './contract-service.js';

export {
  createNotification,
  createNotifications,
  getNotificationById,
  getNotificationsByUser,
  getAllNotificationsByUser,
  getUnreadNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  notifyProposalReceived,
  notifyProposalAccepted,
  notifyProposalRejected,
  notifyMilestoneSubmitted,
  notifyMilestoneApproved,
  notifyPaymentReleased,
  notifyDisputeCreated,
  notifyDisputeResolved,
  notifyRatingReceived,
} from './notification-service.js';

export type {
  CreateNotificationInput,
  NotificationServiceError,
  NotificationServiceResult,
} from './notification-service.js';

// Blockchain client exports
export {
  serializeTransaction,
  deserializeTransaction,
  serializePaymentTransaction,
  deserializePaymentTransaction,
  generateWalletAddress,
  signTransaction,
  submitTransaction,
  getTransaction,
  getTransactionByHash,
  pollTransactionStatus,
  confirmTransaction,
  failTransaction,
  clearTransactions,
  getBlockchainConfig,
  isBlockchainAvailable,
} from './blockchain-client.js';

export type {
  Transaction,
  TransactionInput,
  TransactionReceipt,
  TransactionStatus,
  TransactionType,
  TransactionPollResult,
  SerializedTransaction,
  PaymentTransaction,
  SerializedPaymentTransaction,
  BlockchainConfig,
  EscrowParams,
  EscrowMilestone,
  EscrowDeployment,
} from './blockchain-types.js';

// Escrow contract exports
export {
  deployEscrow,
  depositToEscrow,
  releaseMilestone,
  refundMilestone,
  getEscrowBalance,
  getEscrowState,
  getMilestoneStatus,
  areAllMilestonesReleased,
  clearEscrows,
  getEscrowByContractId,
} from './escrow-contract.js';

// Payment service exports
export {
  requestMilestoneCompletion,
  approveMilestone,
  disputeMilestone,
  getContractPaymentStatus,
  isContractComplete,
  getDisputeById,
  getDisputesByContract,
  clearDisputes,
  initializeContractEscrow,
} from './payment-service.js';

export type {
  PaymentServiceError,
  PaymentServiceResult,
  MilestoneCompletionResult,
  MilestoneApprovalResult,
  MilestoneDisputeResult,
  ContractPaymentStatus,
} from './payment-service.js';

// Reputation contract exports
export {
  submitRatingToBlockchain,
  getRatingsFromBlockchain,
  getRatingsGivenByUser,
  getRatingById,
  getRatingsByContract,
  computeAggregateScore,
  getAggregateScoreFromBlockchain,
  hasUserRatedForContract,
  clearBlockchainRatings,
  getReputationContractAddress,
  serializeBlockchainRating,
  deserializeBlockchainRating,
} from './reputation-contract.js';

export type {
  BlockchainRating,
  SerializedBlockchainRating,
  RatingSubmissionParams,
} from './reputation-contract.js';

// Reputation service exports
export {
  submitRating,
  getReputation,
  getWorkHistory,
  getContractRatings,
  canUserRate,
} from './reputation-service.js';

export type {
  RatingInput,
  ReputationScore,
  WorkHistoryEntry,
  ReputationServiceError,
  ReputationServiceResult,
  RatingResult,
} from './reputation-service.js';

// Dispute service exports
export {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById as getDisputeByIdFromService,
  getDisputesByContract as getDisputesByContractFromService,
  getOpenDisputes,
  getDisputesByInitiator,
} from './dispute-service.js';

export type {
  DisputeServiceError,
  DisputeServiceResult,
  CreateDisputeInput,
  SubmitEvidenceInput,
  ResolveDisputeInput,
} from './dispute-service.js';

// Web3 client exports (real Ethereum integration)
export {
  isWeb3Available,
  getProvider,
  getWallet,
  getWalletInfo,
  getBalance,
  sendTransaction as sendWeb3Transaction,
  getTransactionByHash as getWeb3TransactionByHash,
  waitForTransaction,
  getGasPrice,
  getBlockNumber,
  estimateGas,
  formatEther,
  parseEther,
  isValidAddress,
  getChecksumAddress,
  signMessage,
  verifyMessage,
  getNetworkInfo,
  isCorrectNetwork,
  resetWeb3Client,
  deployContract,
  getContract,
  getContractWithSigner,
} from './web3-client.js';

export type {
  Web3Config,
  Web3TransactionResult,
  WalletInfo,
} from './web3-client.js';

// AI client exports
export {
  isAIAvailable,
  generateContent,
  analyzeSkillMatch,
  extractSkills,
  keywordMatchSkills,
  keywordExtractSkills,
  isAIError,
  serializeAIRequest,
  deserializeAIRequest,
  serializeAIResponse,
  deserializeAIResponse,
} from './ai-client.js';

export type {
  AIRequest,
  AIResponse,
  AIError,
  SkillMatchRequest,
  SkillMatchResult,
  SkillExtractionRequest,
  ExtractedSkill,
  SkillInfo,
  SerializableAIRequest,
  SerializableAIResponse,
} from './ai-types.js';

// Matching service exports
export {
  getProjectRecommendations,
  getFreelancerRecommendations,
  extractSkillsFromText,
  analyzeSkillGaps,
  calculateMatchScore,
  sortRecommendationsByScore,
  sortFreelancerRecommendationsByCombinedScore,
  isMatchingError,
} from './matching-service.js';

export type {
  MatchingServiceError,
  MatchingServiceResult,
} from './matching-service.js';

export type {
  ProjectRecommendation,
  FreelancerRecommendation,
  SkillGapAnalysis,
} from './ai-types.js';


// Didit KYC service exports
export {
  initiateKycVerification,
  getKycStatus,
  getKycById,
  refreshVerificationStatus,
  processWebhook,
  adminReviewVerification,
  getPendingAdminReviews,
  getVerificationsByStatus,
  getUserVerificationHistory,
  isUserVerified,
} from './didit-kyc-service.js';

// User custom skills service exports
export {
  createUserCustomSkill,
  getUserCustomSkills,
  getUserCustomSkillById,
  updateUserCustomSkill,
  deleteUserCustomSkill,
  searchUserCustomSkills,
} from './user-custom-skill-service.js';

export type {
  UserCustomSkillServiceError,
} from './user-custom-skill-service.js';
