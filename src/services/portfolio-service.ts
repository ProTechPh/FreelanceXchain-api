import { logger } from '../config/logger.js';
import { PortfolioItem, PortfolioItemInput } from '../models/portfolio.js';
import type { ServiceResult } from '../types/service-result.js';
import { storage, BUCKETS } from '../config/appwrite.js';
import { extractFileIdFromUrl } from '../utils/storage-uploader.js';
import { portfolioRepository } from '../repositories/portfolio-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';

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
      const allSkills = await skillRepository.getAllSkills();
      const validSkillNames = new Set(allSkills.map(s => s.name));
      const invalidSkills = input.skills.filter(s => !validSkillNames.has(s));

      if (invalidSkills.length > 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid skills: ${invalidSkills.join(', ')}`,
          },
        };
      }
    }

    const created = await portfolioRepository.create({
      freelancer_id: freelancerId,
      title: input.title,
      description: input.description,
      project_url: input.projectUrl,
      images: JSON.stringify(input.images),
      skills: JSON.stringify(input.skills || []),
      completed_at: input.completedAt,
    } as any);

    return {
      success: true,
      data: {
        id: created.id,
        freelancerId: created.freelancer_id,
        title: created.title,
        description: created.description,
        projectUrl: created.project_url,
        images: typeof created.images === 'string' ? JSON.parse(created.images) : created.images,
        skills: typeof created.skills === 'string' ? JSON.parse(created.skills) : created.skills,
        completedAt: created.completed_at ?? undefined,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      } as PortfolioItem,
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
    const ownerId = await portfolioRepository.findOwnerById(portfolioId);

    if (ownerId === null) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    if (ownerId !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only update your own portfolio items',
        },
      };
    }

    // Build update data
    const updateData: Record<string, any> = {};
    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.projectUrl !== undefined) updateData.project_url = updates.projectUrl;
    if (updates.images) updateData.images = JSON.stringify(updates.images);
    if (updates.skills) updateData.skills = JSON.stringify(updates.skills);
    if (updates.completedAt !== undefined) updateData.completed_at = updates.completedAt;

    if (Object.keys(updateData).length === 0) {
      const existing = await portfolioRepository.getById(portfolioId);
      return {
        success: true,
        data: {
          id: existing!.id,
          freelancerId: (existing as any).freelancer_id,
          title: (existing as any).title,
          description: (existing as any).description,
          projectUrl: (existing as any).project_url,
          images: typeof (existing as any).images === 'string' ? JSON.parse((existing as any).images) : (existing as any).images,
          skills: typeof (existing as any).skills === 'string' ? JSON.parse((existing as any).skills) : (existing as any).skills,
          completedAt: (existing as any).completed_at ?? undefined,
          createdAt: (existing as any).created_at,
          updatedAt: (existing as any).updated_at,
        } as PortfolioItem,
      };
    }

    const updated = await portfolioRepository.update(portfolioId, updateData);

    return {
      success: true,
      data: {
        id: updated!.id,
        freelancerId: (updated as any).freelancer_id,
        title: (updated as any).title,
        description: (updated as any).description,
        projectUrl: (updated as any).project_url,
        images: typeof (updated as any).images === 'string' ? JSON.parse((updated as any).images) : (updated as any).images,
        skills: typeof (updated as any).skills === 'string' ? JSON.parse((updated as any).skills) : (updated as any).skills,
        completedAt: (updated as any).completed_at ?? undefined,
        createdAt: (updated as any).created_at,
        updatedAt: (updated as any).updated_at,
      } as PortfolioItem,
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
    const ownerId = await portfolioRepository.findOwnerById(portfolioId);

    if (ownerId === null) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    if (ownerId !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only delete your own portfolio items',
        },
      };
    }

    // Get existing item for image cleanup
    const existing = await portfolioRepository.getById(portfolioId);

    // Delete from database
    await portfolioRepository.delete(portfolioId);

    // Clean up images from storage (best effort)
    if (existing) {
      let images: string[] = [];
      const raw = (existing as any).images;
      if (typeof raw === 'string') {
        try { images = JSON.parse(raw); } catch { /* ignore */ }
      } else if (Array.isArray(raw)) {
        images = raw;
      }

      for (const imageUrl of images) {
        try {
          const fileId = extractFileIdFromUrl(imageUrl);
          if (fileId) {
            await storage.deleteFile(BUCKETS.PORTFOLIO_IMAGES, fileId);
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
    const items = await portfolioRepository.findByFreelancer(freelancerId);

    return {
      success: true,
      data: items.map(item => ({
        id: item.id,
        freelancerId: item.freelancer_id,
        title: item.title,
        description: item.description,
        projectUrl: item.project_url,
        images: typeof item.images === 'string' ? JSON.parse(item.images) : item.images,
        skills: typeof item.skills === 'string' ? JSON.parse(item.skills) : item.skills,
        completedAt: item.completed_at ?? undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      } as PortfolioItem)),
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
    const item = await portfolioRepository.getById(portfolioId);

    if (!item) {
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
      data: {
        id: item.id,
        freelancerId: (item as any).freelancer_id,
        title: (item as any).title,
        description: (item as any).description,
        projectUrl: (item as any).project_url,
        images: typeof (item as any).images === 'string' ? JSON.parse((item as any).images) : (item as any).images,
        skills: typeof (item as any).skills === 'string' ? JSON.parse((item as any).skills) : (item as any).skills,
        completedAt: (item as any).completed_at ?? undefined,
        createdAt: (item as any).created_at,
        updatedAt: (item as any).updated_at,
      } as PortfolioItem,
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
