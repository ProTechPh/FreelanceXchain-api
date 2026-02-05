// Services barrel export
// This file will export all services as they are created

export {
  register,
  login,
  validateToken,
  refreshTokens,
  isAuthError,
} from './auth-service';

export type {
  RegisterInput,
  LoginInput,
  TokenPayload,
  AuthResult,
  AuthError,
} from './auth-types';

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
} from './skill-service';

export type {
  SkillServiceError,
  SkillServiceResult,
} from './skill-service';

export {
  createProfile as createFreelancerProfile,
  getProfileByUserId as getFreelancerProfileByUserId,
  updateProfile as updateFreelancerProfile,
  addSkillsToProfile,
  removeSkillFromProfile,
  addExperience,
  updateExperience,
  removeExperience,
} from './freelancer-profile-service';

export type {
  CreateFreelancerProfileInput,
  UpdateFreelancerProfileInput,
  AddSkillInput,
  AddExperienceInput,
  FreelancerProfileServiceError,
  FreelancerProfileServiceResult,
} from './freelancer-profile-service';

export {
  createEmployerProfile,
  getEmployerProfileByUserId,
  updateEmployerProfile,
} from './employer-profile-service';

export type {
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
  EmployerProfileServiceError,
  EmployerProfileServiceResult,
} from './employer-profile-service';

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
} from './project-service';

export type {
  CreateProjectInput,
  UpdateProjectInput,
  AddMilestoneInput,
  ProjectWithProposalCount,
  ProjectServiceError,
  ProjectServiceResult,
} from './project-service';

export {
  searchProjects,
  searchFreelancers,
} from './search-service';

export type {
  ProjectSearchFilters,
  FreelancerSearchFilters,
  SearchPaginationInput,
  SearchResultMetadata,
  SearchResult,
  SearchServiceError,
  SearchServiceResult,
} from './search-service';

export {
  submitProposal,
  getProposalById,
  getProposalsByProject,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} from './proposal-service';

export type {
  CreateProposalInput,
  ProposalServiceError,
  ProposalServiceResult,
  ProposalWithNotification,
  AcceptProposalResult,
  RejectProposalResult,
} from './proposal-service';

export {
  getContractById,
  getUserContracts,
  getContractsByFreelancer,
  getContractsByEmployer,
  getContractsByProject,
  updateContractStatus,
  setEscrowAddress,
  getContractByProposalId,
} from './contract-service';

export type {
  ContractServiceError,
  ContractServiceResult,
} from './contract-service';

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
} from './notification-service';

export type {
  CreateNotificationInput,
  NotificationServiceError,
  NotificationServiceResult,
} from './notification-service';

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
} from './blockchain-client';

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
} from './blockchain-types';

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
} from './escrow-contract';

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
} from './payment-service';

export type {
  PaymentServiceError,
  PaymentServiceResult,
  MilestoneCompletionResult,
  MilestoneApprovalResult,
  MilestoneDisputeResult,
  ContractPaymentStatus,
} from './payment-service';

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
} from './reputation-contract';

export type {
  BlockchainRating,
  SerializedBlockchainRating,
  RatingSubmissionParams,
} from './reputation-contract';

// Reputation service exports
export {
  submitRating,
  getReputation,
  getWorkHistory,
  getContractRatings,
  canUserRate,
  serializeReputationRecord,
  deserializeReputationRecord,
} from './reputation-service';

export type {
  RatingInput,
  ReputationScore,
  WorkHistoryEntry,
  ReputationServiceError,
  ReputationServiceResult,
  RatingResult,
} from './reputation-service';

// Dispute service exports
export {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById as getDisputeByIdFromService,
  getDisputesByContract as getDisputesByContractFromService,
  getOpenDisputes,
  getDisputesByInitiator,
} from './dispute-service';

export type {
  DisputeServiceError,
  DisputeServiceResult,
  CreateDisputeInput,
  SubmitEvidenceInput,
  ResolveDisputeInput,
} from './dispute-service';

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
} from './web3-client';

export type {
  Web3Config,
  Web3TransactionResult,
  WalletInfo,
} from './web3-client';

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
} from './ai-client';

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
} from './ai-types';

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
} from './matching-service';

export type {
  MatchingServiceError,
  MatchingServiceResult,
} from './matching-service';

export type {
  ProjectRecommendation,
  FreelancerRecommendation,
  SkillGapAnalysis,
} from './ai-types';


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
} from './didit-kyc-service';
