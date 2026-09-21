/**
 * "Rate the app" — platform feedback.
 *
 * Separate from reputation-service.ts, which handles freelancer<->employer
 * reviews on a completed contract. Nothing here touches a user's reputation
 * score; this is the platform asking how it is doing.
 */

import { appRatingRepository, type AppRatingFilters } from '../repositories/app-rating-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { logger } from '../config/logger.js';
import { withLock } from '../utils/async-lock.js';
import { successResult, errorResult, type ServiceResult } from '../types/service-result.js';
import {
  APP_RATING_COOLDOWN_DAYS,
  MAX_APP_RATING,
  MIN_APP_RATING,
  isAppRatingSource,
  type AdminAppRating,
  type AppRating,
  type AppRatingEligibility,
  type AppRatingSource,
  type AppRatingSourceStat,
  type AppRatingSummary,
  type SubmitAppRatingInput,
} from '../models/app-rating.js';

const MAX_COMMENT_LENGTH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = APP_RATING_COOLDOWN_DAYS * DAY_MS;

/**
 * Whether `source` is exempt from the 30-day cooldown.
 *
 * Only `manual` is: the user went to the account menu and asked for the form.
 * Telling them to come back in three weeks would be absurd.
 */
function bypassesCooldown(source: AppRatingSource): boolean {
  return source === 'manual';
}

/**
 * Should this user be prompted right now?
 *
 * Checked before showing the dialog and again on submit, so a client holding a
 * stale eligibility answer cannot write past the cooldown.
 */
export async function getRatingEligibility(userId: string): Promise<ServiceResult<AppRatingEligibility>> {
  try {
    const latest = await appRatingRepository.findLatestByUser(userId);
    if (!latest) return successResult({ shouldPrompt: true });

    const elapsed = Date.now() - new Date(latest.createdAt).getTime();
    if (elapsed < COOLDOWN_MS) {
      return successResult({
        shouldPrompt: false,
        reason: 'COOLDOWN',
        nextEligibleAt: new Date(new Date(latest.createdAt).getTime() + COOLDOWN_MS).toISOString(),
      });
    }

    return successResult({ shouldPrompt: true });
  } catch (error) {
    logger.error('Failed to resolve app rating eligibility', { error, userId });
    // Eligibility is advisory chrome. Failing closed means nobody is ever
    // prompted when the lookup is flaky, which is the safer of the two.
    return successResult({ shouldPrompt: false, reason: 'LOOKUP_FAILED' });
  }
}

export async function submitAppRating(input: SubmitAppRatingInput): Promise<ServiceResult<AppRating>> {
  const { userId, userRole, rating, source, contextId } = input;

  if (!Number.isInteger(rating) || rating < MIN_APP_RATING || rating > MAX_APP_RATING) {
    return errorResult('INVALID_RATING', `Rating must be a whole number between ${MIN_APP_RATING} and ${MAX_APP_RATING}.`);
  }

  if (!isAppRatingSource(source)) {
    return errorResult('INVALID_SOURCE', 'Unknown rating source.');
  }

  const comment = input.comment?.trim();
  if (comment && comment.length > MAX_COMMENT_LENGTH) {
    return errorResult('COMMENT_TOO_LONG', `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  // Serialize per user so two rapid submissions cannot both pass the cooldown
  // check. Same pattern as the duplicate-review guard in reputation-service.
  return withLock(`app-rating:${userId}`, async () => {
    try {
      if (!bypassesCooldown(source)) {
        const eligibility = await getRatingEligibility(userId);
        if (eligibility.success && !eligibility.data.shouldPrompt && eligibility.data.reason === 'COOLDOWN') {
          return errorResult('RATE_LIMITED', 'You have already rated the app recently. Thank you!');
        }

        if (contextId && await appRatingRepository.hasRatedForContext(userId, source, contextId)) {
          return errorResult('DUPLICATE_RATING', 'You have already rated the app for this.');
        }
      }

      const created = await appRatingRepository.createRating({
        user_id: userId,
        user_role: userRole,
        rating,
        ...(comment ? { comment } : {}),
        source,
        ...(contextId ? { context_id: contextId } : {}),
        ...(input.appVersion ? { app_version: input.appVersion } : {}),
      });

      logger.info('App rating submitted', { userId, rating, source });
      return successResult(created);
    } catch (error) {
      logger.error('Failed to submit app rating', { error, userId, source });
      return errorResult('SUBMIT_FAILED', 'Could not save your rating. Please try again.');
    }
  });
}

/** The admin table: ratings joined to the people who left them. */
export async function listAppRatings(
  filters: AppRatingFilters = {}
): Promise<ServiceResult<{ ratings: AdminAppRating[]; total: number }>> {
  try {
    const { ratings, total } = await appRatingRepository.listAll(filters);

    const userIds = [...new Set(ratings.map(r => r.userId))];
    const users = await userRepository.getUsersByIds(userIds);
    const byId = new Map(users.map(u => [u.id, u]));

    return successResult({
      total,
      ratings: ratings.map(rating => {
        const user = byId.get(rating.userId);
        return {
          ...rating,
          // A deleted account still leaves its feedback behind; label it
          // rather than dropping the row.
          userName: user?.name ?? 'Deleted user',
          userEmail: user?.email ?? '—',
        };
      }),
    });
  } catch (error) {
    logger.error('Failed to list app ratings', { error });
    return errorResult('LIST_FAILED', 'Could not load app feedback.');
  }
}

export async function getAppRatingSummary(): Promise<ServiceResult<AppRatingSummary>> {
  try {
    const ratings = await appRatingRepository.fetchAllForSummary();
    return successResult(summarize(ratings));
  } catch (error) {
    logger.error('Failed to summarize app ratings', { error });
    return errorResult('SUMMARY_FAILED', 'Could not load feedback summary.');
  }
}

/** Pure aggregation, split out so it can be unit-tested without Appwrite. */
export function summarize(ratings: AppRating[], now: number = Date.now()): AppRatingSummary {
  const histogram: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const sourceTotals = new Map<AppRatingSource, { total: number; sum: number }>();

  let sum = 0;
  let positive = 0;
  let recentTotal = 0;
  const recentCutoff = now - COOLDOWN_MS;

  for (const rating of ratings) {
    sum += rating.rating;
    const bucket = String(rating.rating);
    if (bucket in histogram) histogram[bucket] = (histogram[bucket] ?? 0) + 1;
    if (rating.rating >= 4) positive += 1;
    if (new Date(rating.createdAt).getTime() >= recentCutoff) recentTotal += 1;

    const entry = sourceTotals.get(rating.source) ?? { total: 0, sum: 0 };
    entry.total += 1;
    entry.sum += rating.rating;
    sourceTotals.set(rating.source, entry);
  }

  const total = ratings.length;
  const bySource: AppRatingSourceStat[] = [...sourceTotals.entries()]
    .map(([source, { total: count, sum: sourceSum }]) => ({
      source,
      total: count,
      average: round1(sourceSum / count),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total,
    average: total === 0 ? 0 : round1(sum / total),
    histogram,
    bySource,
    recentTotal,
    positivePercentage: total === 0 ? 0 : Math.round((positive / total) * 100),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
