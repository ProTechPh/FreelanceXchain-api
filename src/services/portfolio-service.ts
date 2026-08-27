import { logger } from '../config/logger.js';
import { PortfolioItem, PortfolioItemInput, PortfolioImage } from '../models/portfolio.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { storage, BUCKETS } from '../config/appwrite.js';
import { extractFileIdFromUrl } from '../utils/storage-uploader.js';
import { portfolioRepository, type PortfolioItemEntity } from '../repositories/portfolio-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { safeJsonParse } from '../utils/index.js';
import { normalizeSkillName } from '../utils/skill-utils.js';

function mapPortfolioItemFromEntity(item: PortfolioItemEntity): PortfolioItem {
  const parsedImages = safeJsonParse<PortfolioImage[]>(item.images);
  const parsedSkills = safeJsonParse<string[]>(item.skills);
  return {
    id: item.id,
    freelancerId: item.freelancer_id,
    title: item.title,
    description: item.description,
    images: Array.isArray(parsedImages) ? parsedImages : [],
    skills: Array.isArray(parsedSkills) ? parsedSkills : [],
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    ...(item.project_url != null ? { projectUrl: item.project_url } : {}),
    ...(item.completed_at != null ? { completedAt: item.completed_at } : {}),
  };
}

/**
 * Resolve a list of skill names against the global taxonomy.
 * - Standardizes known skills to their taxonomy casing (e.g. "react" -> "React").
 * - Allows custom skills (e.g. "Wagmi", "IPFS") cleanly.
 * - Deduplicates entries.
 */
async function resolvePortfolioSkills(skills: string[]): Promise<{
  valid: boolean;
  invalidSkills: string[];
  resolved: string[];
}> {
  try {
    const allSkills = await skillRepository.getAllSkills().catch(() => []);
    const canonicalByName = new Map(allSkills.map(s => [normalizeSkillName(s.name), s.name]));
    const seen = new Set<string>();
    const resolved: string[] = [];

    for (const raw of skills) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = normalizeSkillName(trimmed);
      if (!key) continue;

      const canonical = canonicalByName.get(key) || trimmed;
      if (seen.has(canonical.toLowerCase())) continue;
      seen.add(canonical.toLowerCase());
      resolved.push(canonical);
    }

    return { valid: true, invalidSkills: [], resolved };
  } catch {
    const resolved = skills.filter((s): s is string => typeof s === 'string' && Boolean(s.trim()));
    return { valid: true, invalidSkills: [], resolved };
  }
}

export async function createPortfolioItem(
  freelancerId: string,
  input: PortfolioItemInput
): Promise<ServiceResult<PortfolioItem>> {
  try {
    let images = input.images;
    if (!images || images.length === 0) {
      if (input.projectUrl && typeof input.projectUrl === 'string' && input.projectUrl.trim()) {
        images = [{
          url: `https://api.microlink.io/?url=${encodeURIComponent(input.projectUrl.trim())}&screenshot=true&meta=false&embed=screenshot.url`,
          filename: 'live-website-preview.png',
          size: 0,
          mimeType: 'image/png',
        }];
      } else {
        return errorResult('VALIDATION_ERROR', 'At least one image or a project URL is required');
      }
    }

    // Verify skills exist if provided (normalized + deduped)
    let resolvedSkills: string[] = [];
    if (input.skills && input.skills.length > 0) {
      const skillResult = await resolvePortfolioSkills(input.skills);
      if (!skillResult.valid) {
        return errorResult('VALIDATION_ERROR', `Invalid skills: ${skillResult.invalidSkills.join(', ')}`);
      }
      resolvedSkills = skillResult.resolved;
    }

    const created = await portfolioRepository.create({
      freelancer_id: freelancerId,
      title: input.title,
      description: input.description,
      images: JSON.stringify(input.images),
      skills: JSON.stringify(resolvedSkills),
      ...(input.projectUrl !== undefined ? { project_url: input.projectUrl } : {}),
      ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
    });

    return successResult(mapPortfolioItemFromEntity(created));
  } catch (error) {
    logger.error('Unexpected error in createPortfolioItem', { error, freelancerId, input });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

export async function updatePortfolioItem(
  portfolioId: string,
  userId: string,
  updates: Partial<PortfolioItemInput>
): Promise<ServiceResult<PortfolioItem>> {
  try {
    const ownerId = await portfolioRepository.findOwnerById(portfolioId);

    if (ownerId === null) {
      return errorResult('NOT_FOUND', 'Portfolio item not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only update your own portfolio items');
    }

    const updateData: Record<string, any> = {};
    if (updates.title) updateData.title = updates.title;
    if (updates.description) updateData.description = updates.description;
    if (updates.projectUrl !== undefined) updateData.project_url = updates.projectUrl;
    if (updates.images) updateData.images = JSON.stringify(updates.images);
    // Update path validates skills the same way creation does (create-only
    // validation was a logic gap: invalid tags could be silently stored here).
    if (updates.skills) {
      const skillResult = await resolvePortfolioSkills(updates.skills);
      if (!skillResult.valid) {
        return errorResult('VALIDATION_ERROR', `Invalid skills: ${skillResult.invalidSkills.join(', ')}`);
      }
      updateData.skills = JSON.stringify(skillResult.resolved);
    }
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
    const ownerId = await portfolioRepository.findOwnerById(portfolioId);

    if (ownerId === null) {
      return errorResult('NOT_FOUND', 'Portfolio item not found');
    }

    if (ownerId !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only delete your own portfolio items');
    }

    // Get existing item for image cleanup
    const existing = await portfolioRepository.getById(portfolioId);

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
