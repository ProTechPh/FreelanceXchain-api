import { Request, Response, NextFunction } from 'express';
import { getBusinessProfileCompleteness } from '../services/employer-business-document-service.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

/**
 * Require a complete employer business profile (all required business fields
 * plus the required documents) before continuing. Admins bypass the check.
 * Documents are only checked for presence, not against BIR/DTI/SEC records.
 */
export async function requireCompleteBusinessProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = getRequestId(req);

  if (!req.user) {
    sendErrorResponse(res, 401, 'AUTH_UNAUTHORIZED', 'Authentication required', { requestId });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  try {
    const result = await getBusinessProfileCompleteness(req.user.userId);
    if (!result.success) {
      sendErrorResponse(res, 403, 'BUSINESS_PROFILE_INCOMPLETE', 'Complete your business profile before posting a project', {
        requestId,
        details: { missingFields: [], missingDocuments: [] },
      });
      return;
    }

    if (!result.data.complete) {
      sendErrorResponse(res, 403, 'BUSINESS_PROFILE_INCOMPLETE', 'Complete your business profile before posting a project', {
        requestId,
        details: { missingFields: result.data.missingFields, missingDocuments: result.data.missingDocuments },
      });
      return;
    }

    if (result.data.verificationStatus && result.data.verificationStatus !== 'verified') {
      const message = result.data.verificationStatus === 'rejected'
        ? 'Your business profile verification was rejected. Please update your details and resubmit for admin approval.'
        : 'Your business profile is pending admin verification before you can post projects.';
      sendErrorResponse(res, 403, 'BUSINESS_PROFILE_NOT_VERIFIED', message, {
        requestId,
        details: {
          verificationStatus: result.data.verificationStatus,
          verificationNotes: result.data.verificationNotes,
        },
      });
      return;
    }
  } catch (error) {
    logger.error('Failed to check business profile completeness', error as Error, {
      requestId,
      userId: req.user.userId,
    });
    sendErrorResponse(res, 500, 'BUSINESS_PROFILE_CHECK_FAILED', 'Failed to check business profile', { requestId });
    return;
  }

  next();
}
