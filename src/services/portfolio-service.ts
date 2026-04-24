import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { PortfolioItem, PortfolioItemInput } from '../models/portfolio.js';
import type { ServiceResult } from '../types/service-result.js';

const supabase = getSupabaseClient();

/**
 * Create a new portfolio item
 */
export async function createPortfolioItem(
  freelancerId: string,
  input: PortfolioItemInput
): Promise<ServiceResult<PortfolioItem>> {
  try {
    // Validate images array
    if (!input.images || input.images.length === 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one image is required',
        },
      };
    }

    // Verify skills exist if provided
    if (input.skills && input.skills.length > 0) {
      const { data: skills, error: skillError } = await supabase
        .from('skills')
        .select('name')
        .in('name', input.skills);

      if (skillError) {
        logger.error('Failed to verify skills', { error: skillError, skills: input.skills });
      }
    }

    const { data, error } = await supabase
      .from('portfolio_items')
      .insert({
        freelancer_id: freelancerId,
        title: input.title,
        description: input.description,
        project_url: input.projectUrl,
        images: input.images,
        skills: input.skills || [],
        completed_at: input.completedAt,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to create portfolio item', { error, freelancerId, input });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create portfolio item',
        },
      };
    }

    return {
      success: true,
      data: data as PortfolioItem,
    };
  } catch (error) {
    logger.error('Unexpected error in createPortfolioItem', { error, freelancerId, input });
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
 * Update a portfolio item
 */
export async function updatePortfolioItem(
  portfolioId: string,
  userId: string,
  updates: Partial<PortfolioItemInput>
): Promise<ServiceResult<PortfolioItem>> {
  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('portfolio_items')
      .select('freelancer_id')
      .eq('id', portfolioId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    if (existing.freelancer_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only update your own portfolio items',
        },
      };
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.projectUrl !== undefined) updateData.project_url = updates.projectUrl;
    if (updates.images) updateData.images = updates.images;
    if (updates.skills) updateData.skills = updates.skills;
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;

    const { data, error } = await supabase
      .from('portfolio_items')
      .update(updateData)
      .eq('id', portfolioId)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update portfolio item', { error, portfolioId, updates });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update portfolio item',
        },
      };
    }

    return {
      success: true,
      data: data as PortfolioItem,
    };
  } catch (error) {
    logger.error('Unexpected error in updatePortfolioItem', { error, portfolioId, updates });
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
 * Delete a portfolio item
 */
export async function deletePortfolioItem(
  portfolioId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('portfolio_items')
      .select('freelancer_id, images')
      .eq('id', portfolioId)
      .single();

    if (fetchError || !existing) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    if (existing.freelancer_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own portfolio items',
        },
      };
    }

    // Delete from database
    const { error } = await supabase
      .from('portfolio_items')
      .delete()
      .eq('id', portfolioId);

    if (error) {
      logger.error('Failed to delete portfolio item', { error, portfolioId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to delete portfolio item',
        },
      };
    }

    // Clean up images from storage (best effort)
    if (existing.images && Array.isArray(existing.images)) {
      for (const imageUrl of existing.images) {
        try {
          // Extract path from URL
          const urlParts = imageUrl.split('/storage/v1/object/public/portfolio-images/');
          if (urlParts.length === 2) {
            const path = urlParts[1];
            await supabase.storage.from('portfolio-images').remove([path]);
          }
        } catch (cleanupError) {
          logger.warn('Failed to cleanup portfolio image', { error: cleanupError, imageUrl });
        }
      }
    }

    return {
      success: true,
      data: undefined as unknown as void,
    };
  } catch (error) {
    logger.error('Unexpected error in deletePortfolioItem', { error, portfolioId });
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
 * Get freelancer's portfolio (public access)
 */
export async function getFreelancerPortfolio(
  freelancerId: string
): Promise<ServiceResult<PortfolioItem[]>> {
  try {
    const { data, error } = await supabase
      .from('portfolio_items')
      .select('*')
      .eq('freelancer_id', freelancerId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get freelancer portfolio', { error, freelancerId });
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch portfolio',
        },
      };
    }

    return {
      success: true,
      data: (data || []) as PortfolioItem[],
    };
  } catch (error) {
    logger.error('Unexpected error in getFreelancerPortfolio', { error, freelancerId });
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
 * Get a single portfolio item (public access)
 */
export async function getPortfolioItem(portfolioId: string): Promise<ServiceResult<PortfolioItem>> {
  try {
    const { data, error } = await supabase
      .from('portfolio_items')
      .select('*')
      .eq('id', portfolioId)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    return {
      success: true,
      data: data as PortfolioItem,
    };
  } catch (error) {
    logger.error('Unexpected error in getPortfolioItem', { error, portfolioId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
