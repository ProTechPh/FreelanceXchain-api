import { logger } from '../config/logger.js';
import { PortfolioItem, PortfolioItemInput, PortfolioImage } from '../models/portfolio.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { storage, BUCKETS } from '../config/appwrite.js';
import { extractFileIdFromUrl } from '../utils/storage-uploader.js';
import { portfolioRepository, type PortfolioItemEntity } from '../repositories/portfolio-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { safeJsonParse } from '../utils/index.js';

function mapPortfolioItemFromEntity(item: PortfolioItemEntity): PortfolioItem {
  return {
    id: item.id,
    freelancerId: item.freelancer_id,
    title: item.title,
    description: item.description,
    images: safeJsonParse<PortfolioImage[]>(item.images),
    skills: safeJsonParse<string[]>(item.skills),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    ...(item.project_url != null ? { projectUrl: item.project_url } : {}),
    ...(item.completed_at != null ? { completedAt: item.completed_at } : {}),
  };
}

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
      return errorResult('VALIDATION_ERROR', 'At least one image is required');
    }

    // Verify skills exist if provided
    if (input.skills && input.skills.length > 0) {
      const allSkills = await skillRepository.getAllSkills();
      const validSkillNames = new Set(allSkills.map(s => s.name));
      const invalidSkills = input.skills.filter(s => !validSkillNames.has(s));

      if (invalidSkills.length > 0) {
        return errorResult('VALIDATION_ERROR', `Invalid skills: ${invalidSkills.join(', ')}`);
      }
    }

    const created = await portfolioRepository.create({
      freelancer_id: freelancerId,
      title: input.title,
      description: input.description,
      images: JSON.stringify(input.images),
      skills: JSON.stringify(input.skills || []),
      ...(input.projectUrl !== undefined ? { project_url: input.projectUrl } : {}),
      ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
    });

    return successResult(mapPortfolioItemFromEntity(created));
  } catch (error) {
    logger.error('Unexpected error in createPortfolioItem', { error, freelancerId, input });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
      return errorResult('NOT_FOUND', 'Portfolio item not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only update your own portfolio items');
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
      return successResult(mapPortfolioItemFromEntity(existing!));
    }

    const updated = await portfolioRepository.update(portfolioId, updateData);

    return successResult(mapPortfolioItemFromEntity(updated!));
  } catch (error) {
    logger.error('Unexpected error in updatePortfolioItem', { error, portfolioId, updates });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
      return errorResult('NOT_FOUND', 'Portfolio item not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only delete your own portfolio items');
    }

    // Get existing item for image cleanup
    const existing = await portfolioRepository.getById(portfolioId);

    // Delete from database
    await portfolioRepository.delete(portfolioId);

    // Clean up images from storage (best effort)
    if (existing) {
      let images: string[] = [];
      const raw = existing.images;
      if (typeof raw === 'string') {
        try { images = JSON.parse(raw); } catch { /* ignore */ }
      } else if (Array.isArray(raw)) {
        images = raw;
      }

      await Promise.all(
        images.map(async (imageUrl) => {
          try {
            const fileId = extractFileIdFromUrl(imageUrl);
            if (fileId) {
              await storage.deleteFile(BUCKETS.PORTFOLIO_IMAGES, fileId);
            }
          } catch (cleanupError) {
            logger.warn('Failed to cleanup portfolio image', { error: cleanupError, imageUrl });
          }
        })
      );
    }

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in deletePortfolioItem', { error, portfolioId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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

    return successResult(items.map(mapPortfolioItemFromEntity));
  } catch (error) {
    logger.error('Unexpected error in getFreelancerPortfolio', { error, freelancerId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get a single portfolio item (public access)
 */
export async function getPortfolioItem(portfolioId: string): Promise<ServiceResult<PortfolioItem>> {
  try {
    const item = await portfolioRepository.getById(portfolioId);

    if (!item) {
      return errorResult('NOT_FOUND', 'Portfolio item not found');
    }

    return successResult(mapPortfolioItemFromEntity(item));
  } catch (error) {
    logger.error('Unexpected error in getPortfolioItem', { error, portfolioId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}
