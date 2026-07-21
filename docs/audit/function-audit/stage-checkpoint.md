# Session State Checkpoint

**PROJECT_PATH**: D:\FreelanceXchain\FreelanceXchain-api
**OUTPUT_ROOT**: D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit

## STAGE_STATUS
preflight=complete stage0=complete stage1=complete stage2=complete stage3=complete synthesis=complete verification=skipped stage4=complete stage5=skipped

## DOMAINS
- escrow-payment | Escrow & Payment | constructor,submitMilestone,approveMilestone,disputeMilestone,resolveDispute,withdraw,refundMilestone,cancelContract,getBalance,getRemainingAmount
- contract-lifecycle | Contract Lifecycle | constructor,createAgreement,signAgreement,completeAgreement,disputeAgreement,cancelAgreement,getAgreement
- milestone-tracking | Milestone Tracking | constructor,submitMilestone,approveMilestone,resolveDisputedMilestone,rejectMilestone,getMilestone,getFreelancerStats
- dispute-handling | Dispute Handling | constructor,createDispute,submitEvidence,resolveDispute,getDispute,getUserDisputeStats
- reputation-ratings | Reputation & Ratings | constructor,submitRating,getAverageRating,getUserRatingIndices,getRating,getGivenRatingIndices,hasRated

## FLAGS
has_tokens=false has_proxies=false has_oracles=false

## FINDING_TOTALS
CRITICAL=0 HIGH=2 MEDIUM=14 LOW=26 INFO=21
SOUND=42 NEEDS_REVIEW=10 ISSUE_FOUND=0

REVIEW_RESPONSES_FILE=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\review\review-responses.md
DISPUTED_COUNT=2

## PATHS
design_decisions_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage0\design-decisions.md
slither_file=
stage1_state_var_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage1\state-variable-map.md
stage1_access_control_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage1\access-control-map.md
stage1_external_call_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage1\external-call-map.md
stage2_escrow_payment_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage2\domain-escrow-payment.md
stage2_contract_lifecycle_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage2\domain-contract-lifecycle.md
stage2_milestone_tracking_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage2\domain-milestone-tracking.md
stage2_dispute_handling_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage2\domain-dispute-handling.md
stage2_reputation_ratings_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage2\domain-reputation-ratings.md
stage3_state_consistency_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage3\state-consistency.md
stage3_math_rounding_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage3\math-rounding.md
stage3_reentrancy_trust_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage3\reentrancy-trust.md
stage3_adversarial_sequences_file=D:\FreelanceXchain\FreelanceXchain-api\docs\audit\function-audit\stage3\adversarial-sequences.md
