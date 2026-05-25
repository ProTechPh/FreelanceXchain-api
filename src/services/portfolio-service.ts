import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { PortfolioItem, PortfolioItemInput } from '../models/portfolio.js';
import type { ServiceResult } from '../types/service-result.js';
import { storage, BUCKETS } from '../config/appwrite.js';
import { extractFileIdFromUrl } from '../utils/storage-uploader.js';

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
      const skillsResult = await pool.query(
        'SELECT name FROM skills WHERE name = ANY($1)',
        [input.skills]
      );

      if (skillsResult.rows.length < input.skills.length) {
        const validSkills = new Set(skillsResult.rows.map((s: { name: string }) => s.name));
        const invalidSkills = input.skills.filter(s => !validSkills.has(s));
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid skills: ${invalidSkills.join(', ')}`,
          },
        };
      }
    }

    const result = await pool.query(
      `INSERT INTO portfolio_items (freelancer_id, title, description, project_url, images, skills, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [freelancerId, input.title, input.description, input.projectUrl, JSON.stringify(input.images), JSON.stringify(input.skills || []), input.completedAt]
    );

    return {
      success: true,
      data: result.rows[0] as PortfolioItem,
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
    const existingResult = await pool.query(
      'SELECT freelancer_id FROM portfolio_items WHERE id = $1',
      [portfolioId]
    );

    if (existingResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    if (existingResult.rows[0].freelancer_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You can only update your own portfolio items',
        },
      };
    }

    // Build update query dynamically
    const updateFields: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title) {
      updateFields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.projectUrl !== undefined) {
      updateFields.push(`project_url = $${paramIndex++}`);
      values.push(updates.projectUrl);
    }
    if (updates.images) {
      updateFields.push(`images = $${paramIndex++}`);
      values.push(JSON.stringify(updates.images));
    }
    if (updates.skills) {
      updateFields.push(`skills = $${paramIndex++}`);
      values.push(JSON.stringify(updates.skills));
    }
    if (updates.completedAt !== undefined) {
      updateFields.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }

    values.push(portfolioId);

    const result = await pool.query(
      `UPDATE portfolio_items SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return {
      success: true,
      data: result.rows[0] as PortfolioItem,
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
    const existingResult = await pool.query(
      'SELECT freelancer_id, images FROM portfolio_items WHERE id = $1',
      [portfolioId]
    );

    if (existingResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        },
      };
    }

    const existing = existingResult.rows[0];

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
    await pool.query('DELETE FROM portfolio_items WHERE id = $1', [portfolioId]);

    // Clean up images from storage (best effort)
    if (existing.images && Array.isArray(existing.images)) {
      for (const imageUrl of existing.images) {
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
    const result = await pool.query(
      'SELECT * FROM portfolio_items WHERE freelancer_id = $1 ORDER BY created_at DESC',
      [freelancerId]
    );

    return {
      success: true,
      data: result.rows as PortfolioItem[],
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
    const result = await pool.query(
      'SELECT * FROM portfolio_items WHERE id = $1',
      [portfolioId]
    );

    if (result.rows.length === 0) {
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
      data: result.rows[0] as PortfolioItem,
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
