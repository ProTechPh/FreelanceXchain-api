import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { Review, SubmitReviewInput } from '../models/review.js';

const supabase = getSupabaseClient();

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Submit a review for a completed contract
 */
export async function submitReview(data: SubmitReviewInput): Promise<ServiceResult<Review>> {
  try {
    const { contractId, reviewerId, rating, comment, workQuality, communication, professionalism, wouldWorkAgain } = data;

    // Validate rating
    if (rating < 1 || rating > 5) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rating must be between 1 and 5',
        },
      };
    }

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, project_id, freelancer_id, employer_id, status')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return {
        success: false,
        error: {
          code: 'CONTRACT_NOT_FOUND',
          message: 'Contract not found',
        },
      };
    }

    // Verify contract is completed
    if (contract.status !== 'completed') {
      return {
        success: false,
        error: {
          code: 'CONTRACT_NOT_COMPLETED',
          message: 'Can only review completed contracts',
        },
      };
    }

    // Verify reviewer is a party to the contract
    if (reviewerId !== contract.freelancer_id && reviewerId !== contract.employer_id) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to review this contract',
        },
      };
    }

    // Determine reviewee
    const revieweeId = reviewerId === contract.freelancer_id ? contract.employer_id : contract.freelancer_id;

    // Check for duplicate review
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('contract_id', contractId)
      .eq('reviewer_id', reviewerId)
      .single();

    if (existingReview) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_REVIEW',
          message: 'You have already reviewed this contract',
        },
      };
    }

    // Create review
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        contract_id: contractId,
        project_id: contract.project_id,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        rating,
        comment,
        work_quality: workQuality,
        communication,
        professionalism,
        would_work_again: wouldWorkAgain,
      })
      .select('*')
      .single();

    if (reviewError) {
      logger.error('Failed to create review', { error: reviewError, data });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create review',
        },
      };
    }

    // Update blockchain reputation system
    try {
      // Get reviewee wallet address
      const { data: revieweeUser } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', revieweeId)
        .single();

      if (revieweeUser?.wallet_address) {
        const { submitRatingToBlockchain } = await import('./reputation-blockchain.js');
        await submitRatingToBlockchain({
          contractId,
          rateeAddress: revieweeUser.wallet_address,
          rating,
          comment: comment || '',
          isEmployerRating: reviewerId === contract.employer_id,
        });
        logger.info('Review synced to blockchain', { reviewId: review.id, contractId });
      } else {
        logger.warn('Reviewee has no wallet address, skipping blockchain sync', { revieweeId });
      }
    } catch (blockchainError) {
      // Don't fail the review if blockchain sync fails
      logger.error('Failed to sync review to blockchain', { error: blockchainError, reviewId: review.id });
    }

    logger.debug('Review submitted successfully', { reviewId: review.id, contractId });

    return {
      success: true,
      data: review as Review,
    };
  } catch (error) {
    logger.error('Unexpected error in submitReview', { error, data });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get review by ID
 */
export async function getReviewById(reviewId: string): Promise<ServiceResult<Review>> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Review not found',
        },
      };
    }

    return {
      success: true,
      data: data as Review,
    };
  } catch (error) {
    logger.error('Unexpected error in getReviewById', { error, reviewId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get reviews for a user (as reviewee)
 */
export async function getUserReviews(userId: string): Promise<ServiceResult<Review[]>> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('reviewee_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get user reviews', { error, userId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch reviews',
        },
      };
    }

    return {
      success: true,
      data: (data || []) as Review[],
    };
  } catch (error) {
    logger.error('Unexpected error in getUserReviews', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get reviews for a project
 */
export async function getProjectReviews(projectId: string): Promise<ServiceResult<Review[]>> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get project reviews', { error, projectId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch reviews',
        },
      };
    }

    return {
      success: true,
      data: (data || []) as Review[],
    };
  } catch (error) {
    logger.error('Unexpected error in getProjectReviews', { error, projectId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Check if user can review a contract
 */
export async function canUserReview(
  userId: string,
  contractId: string
): Promise<ServiceResult<{ canReview: boolean; reason?: string }>> {
  try {
    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, freelancer_id, employer_id, status')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return {
        success: true,
        data: {
          canReview: false,
          reason: 'Contract not found',
        },
      };
    }

    // Check if user is a party to the contract
    if (userId !== contract.freelancer_id && userId !== contract.employer_id) {
      return {
        success: true,
        data: {
          canReview: false,
          reason: 'You are not a party to this contract',
        },
      };
    }

    // Check if contract is completed
    if (contract.status !== 'completed') {
      return {
        success: true,
        data: {
          canReview: false,
          reason: 'Contract must be completed before reviewing',
        },
      };
    }

    // Check for existing review
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('contract_id', contractId)
      .eq('reviewer_id', userId)
      .single();

    if (existingReview) {
      return {
        success: true,
        data: {
          canReview: false,
          reason: 'You have already reviewed this contract',
        },
      };
    }

    return {
      success: true,
      data: {
        canReview: true,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in canUserReview', { error, userId, contractId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
