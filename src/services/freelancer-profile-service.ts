import { FreelancerProfile, mapFreelancerProfileFromEntity } from '../utils/entity-mapper.js';
import { freelancerProfileRepository, FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { generateId } from '../utils/id.js';
import { canonicalizeSkillDisplayName, normalizeSkillSearchKey } from '../utils/skill-utils.js';
import { getProfileDataFromKyc } from './didit-kyc-service.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { freelancerSearchCache } from '../utils/cache.js';

type CreateFreelancerProfileInput = {
  bio: string;
  hourlyRate: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

type CreateProfileFromKycInput = {
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

type UpdateFreelancerProfileInput = {
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

type AddSkillInput = {
  name: string;
  yearsOfExperience: number;
};

type AddExperienceInput = {
  title: string;
  company: string;
  description: string;
  startDate: string;
  endDate?: string | null;
  skills?: string[];
};

type ProfileSkillEntity = FreelancerProfileEntity['skills'][number];
type ExperienceEntity = FreelancerProfileEntity['experience'][number];

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;

function dedupeSkillNames(names: string[] | undefined): string[] {
  const seen = new Set<string>();
  return (names ?? []).flatMap((name) => {
    const trimmed = name.trim();
    const key = normalizeSkillSearchKey(trimmed);
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [canonicalizeSkillDisplayName(trimmed)];
  });
}

function experienceKeyPart(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Same position, company and dates: the entry is a repeat of one already on the profile. */
function isSameExperience(
  a: Pick<ExperienceEntity, 'title' | 'company' | 'start_date' | 'end_date'>,
  b: Pick<ExperienceEntity, 'title' | 'company' | 'start_date' | 'end_date'>
): boolean {
  return (
    experienceKeyPart(a.title) === experienceKeyPart(b.title) &&
    experienceKeyPart(a.company) === experienceKeyPart(b.company) &&
    experienceKeyPart(a.start_date).slice(0, 10) === experienceKeyPart(b.start_date).slice(0, 10) &&
    experienceKeyPart(a.end_date).slice(0, 10) === experienceKeyPart(b.end_date).slice(0, 10)
  );
}

const DUPLICATE_EXPERIENCE_MESSAGE = 'This work history entry is already on your profile';

/** Total years covered by the ranges, counting overlapping jobs once, rounded to half years. */
function yearsCovered(ranges: Array<[number, number]>): number {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of sorted) {
    if (!current || start > current[1]) {
      if (current) total += current[1] - current[0];
      current = [start, end];
    } else if (end > current[1]) {
      current[1] = end;
    }
  }
  if (current) total += current[1] - current[0];
  return Math.round((total / YEAR_MS) * 2) / 2;
}

/**
 * Derives the profile's skill list from its work history. A skill used in any
 * work history entry is listed with the years those entries cover; a skill the
 * freelancer picked directly stays even when no entry uses it. Anything else
 * is dropped.
 */
export function reconcileProfileSkills(
  skills: ProfileSkillEntity[],
  experience: ExperienceEntity[],
  now: Date = new Date()
): ProfileSkillEntity[] {
  const rangesBySkill = new Map<string, { name: string; ranges: Array<[number, number]> }>();
  for (const entry of experience) {
    const start = new Date(entry.start_date).getTime();
    const end = entry.end_date ? new Date(entry.end_date).getTime() + DAY_MS : now.getTime();
    const range: [number, number] | null = Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
    for (const name of entry.skills ?? []) {
      const key = normalizeSkillSearchKey(name);
      if (!key) continue;
      const group = rangesBySkill.get(key) ?? { name: canonicalizeSkillDisplayName(name), ranges: [] };
      if (range) group.ranges.push(range);
      rangesBySkill.set(key, group);
    }
  }

  const result: ProfileSkillEntity[] = [];
  const listed = new Set<string>();
  for (const skill of skills) {
    if (!skill?.name) continue;
    const key = normalizeSkillSearchKey(skill.name);
    if (listed.has(key)) continue;
    const fromHistory = rangesBySkill.get(key);
    if (!fromHistory && !skill.added_manually) continue;
    listed.add(key);
    result.push({
      name: skill.name,
      years_of_experience: fromHistory ? yearsCovered(fromHistory.ranges) : skill.years_of_experience,
      added_manually: skill.added_manually,
    });
  }

  for (const [key, group] of rangesBySkill) {
    if (listed.has(key)) continue;
    listed.add(key);
    result.push({ name: group.name, years_of_experience: yearsCovered(group.ranges), added_manually: false });
  }

  return result;
}




function isValidDateString(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function validateDateRange(startDate: string, endDate: string | null | undefined): { valid: boolean; message?: string } {
  if (!isValidDateString(startDate)) {
    return { valid: false, message: 'Invalid start date format' };
  }

  if (endDate !== null && endDate !== undefined) {
    if (!isValidDateString(endDate)) {
      return { valid: false, message: 'Invalid end date format' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return { valid: false, message: 'Start date must be before or equal to end date' };
    }
  }

  return { valid: true };
}

async function invalidateMatchingCache(userId: string): Promise<void> {
  if (typeof freelancerSearchCache?.clear === 'function') {
    freelancerSearchCache.clear();
  }
  try {
    const { invalidateFreelancerMatchingCache } = await import('./matching-service.js');
    await invalidateFreelancerMatchingCache(userId);
  } catch {
    // Non-fatal if matching service is not initialized or in isolated test mock
  }
}

export async function createProfile(
  userId: string,
  input: CreateFreelancerProfileInput
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return errorResult('PROFILE_EXISTS', 'Freelancer profile already exists for this user');
  }

  const profileEntity: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    name: null,
    nationality: null,
    bio: input.bio,
    hourly_rate: input.hourlyRate,
    skills: [],
    experience: [],
    availability: input.availability ?? 'available',
  };

  const createdEntity = await freelancerProfileRepository.createProfile(profileEntity);
  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(createdEntity));
}

/**
 * Create freelancer profile from KYC data
 * Pre-populates profile with verified name and location from KYC
 */
export async function createProfileFromKyc(
  userId: string,
  input: CreateProfileFromKycInput = {}
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return errorResult('PROFILE_EXISTS', 'Freelancer profile already exists for this user');
  }

  const kycResult = await getProfileDataFromKyc(userId);
  if (!kycResult.success) {
    return errorResult('KYC_NOT_APPROVED', kycResult.error.message || 'KYC verification must be approved before creating profile');
  }

  const kycData = kycResult.data;
  if (!kycData) {
    return errorResult('KYC_NOT_APPROVED', 'No KYC data available');
  }

  const defaultBio = kycData.name 
    ? `Hi, I'm ${kycData.name}. I'm a verified freelancer ready to work on your projects.`
    : 'Verified freelancer ready to work on your projects.';

  const profileEntity: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    name: kycData.name,
    nationality: kycData.nationality,
    bio: input.bio ?? defaultBio,
    hourly_rate: input.hourlyRate ?? 0,
    skills: [],
    experience: [],
    availability: input.availability ?? 'available',
  };

  const createdEntity = await freelancerProfileRepository.createProfile(profileEntity);
  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(createdEntity));
}

export async function getProfileByUserId(userId: string): Promise<ServiceResult<FreelancerProfile>> {
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!profileEntity) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }
  return successResult(mapFreelancerProfileFromEntity(profileEntity));
}

export async function updateProfile(
  userId: string,
  input: UpdateFreelancerProfileInput
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const updates: Partial<FreelancerProfileEntity> = {};
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.hourlyRate !== undefined) updates.hourly_rate = input.hourlyRate;
  if (input.availability !== undefined) updates.availability = input.availability;

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, updates);
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update profile');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}



export async function addSkillsToProfile(
  userId: string,
  skills: AddSkillInput[]
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const updatedSkills: ProfileSkillEntity[] = [...(existingProfile.skills || [])];

  for (const skillInput of skills) {
    const trimmedName = skillInput.name.trim();

    // Normalized match so "react" and "React" never become two skills
    const existingSkill = updatedSkills.find(
      s => s && s.name && normalizeSkillSearchKey(s.name) === normalizeSkillSearchKey(trimmedName)
    );

    if (existingSkill) {
      existingSkill.years_of_experience = skillInput.yearsOfExperience;
      existingSkill.added_manually = true;
    } else {
      updatedSkills.push({
        name: canonicalizeSkillDisplayName(trimmedName),
        years_of_experience: skillInput.yearsOfExperience,
        added_manually: true,
      });
    }
  }

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: reconcileProfileSkills(updatedSkills, existingProfile.experience || []),
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to add skills to profile');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}

export async function removeSkillFromProfile(
  userId: string,
  skillName: string
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  // Unpicking a skill only clears the manual flag; it stays listed while
  // a work history entry still uses it.
  const currentSkills = existingProfile.skills || [];
  const updatedSkills = currentSkills
    .filter(s => s && s.name)
    .map(s =>
      normalizeSkillSearchKey(s.name) === normalizeSkillSearchKey(skillName) ? { ...s, added_manually: false } : s
    );

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: reconcileProfileSkills(updatedSkills, existingProfile.experience || []),
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to remove skill from profile');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}



export async function addExperience(
  userId: string,
  input: AddExperienceInput
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const dateValidation = validateDateRange(input.startDate, input.endDate);
  if (!dateValidation.valid) {
    /* istanbul ignore next -- validateDateRange always returns message when valid=false */
    const msg = dateValidation.message != null ? dateValidation.message : 'Invalid date range';
    return errorResult('INVALID_DATE_RANGE', msg);
  }

  const experienceEntity: FreelancerProfileEntity['experience'][0] = {
    id: generateId(),
    title: input.title,
    company: input.company,
    description: input.description,
    start_date: input.startDate,
    end_date: input.endDate ?? null,
    skills: dedupeSkillNames(input.skills),
  };

  if (existingProfile.experience.some(entry => isSameExperience(entry, experienceEntity))) {
    return errorResult('DUPLICATE_EXPERIENCE', DUPLICATE_EXPERIENCE_MESSAGE);
  }

  const updatedExperience = [...existingProfile.experience, experienceEntity];
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
    skills: reconcileProfileSkills(existingProfile.skills || [], updatedExperience),
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to add experience');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}

export async function updateExperience(
  userId: string,
  experienceId: string,
  input: Partial<AddExperienceInput>
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const experienceIndex = existingProfile.experience.findIndex(e => e.id === experienceId);
  if (experienceIndex === -1) {
    return errorResult('EXPERIENCE_NOT_FOUND', 'Work experience entry not found');
  }

  const currentExperience = existingProfile.experience[experienceIndex];
  /* istanbul ignore next */
  if (!currentExperience) {
    return errorResult('EXPERIENCE_NOT_FOUND', 'Work experience entry not found');
  }

  const newStartDate = input.startDate ?? currentExperience.start_date;
  const newEndDate = input.endDate !== undefined ? input.endDate : currentExperience.end_date;

  const dateValidation = validateDateRange(newStartDate, newEndDate);
  if (!dateValidation.valid) {
    /* istanbul ignore next -- validateDateRange always returns message when valid=false */
    const msg = dateValidation.message != null ? dateValidation.message : 'Invalid date range';
    return errorResult('INVALID_DATE_RANGE', msg);
  }

  const updatedExperience = [...existingProfile.experience];
  updatedExperience[experienceIndex] = {
    id: currentExperience.id,
    title: input.title ?? currentExperience.title,
    company: input.company ?? currentExperience.company,
    description: input.description ?? currentExperience.description,
    start_date: newStartDate,
    end_date: newEndDate,
    skills: input.skills !== undefined ? dedupeSkillNames(input.skills) : currentExperience.skills ?? [],
  };

  const updatedEntry = updatedExperience[experienceIndex]!;
  if (existingProfile.experience.some(entry => entry.id !== experienceId && isSameExperience(entry, updatedEntry))) {
    return errorResult('DUPLICATE_EXPERIENCE', DUPLICATE_EXPERIENCE_MESSAGE);
  }

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
    skills: reconcileProfileSkills(existingProfile.skills || [], updatedExperience),
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update experience');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}

export async function removeExperience(
  userId: string,
  experienceId: string
): Promise<ServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Freelancer profile not found');
  }

  const updatedExperience = existingProfile.experience.filter(e => e.id !== experienceId);
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
    skills: reconcileProfileSkills(existingProfile.skills || [], updatedExperience),
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to remove experience');
  }

  void invalidateMatchingCache(userId);
  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}
