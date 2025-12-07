import { FreelancerProfile, SkillReference, WorkExperience } from '../models/freelancer-profile.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { generateId } from '../utils/id.js';

export type CreateFreelancerProfileInput = {
  bio: string;
  hourlyRate: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

export type UpdateFreelancerProfileInput = {
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

export type AddSkillInput = {
  skillId: string;
  yearsOfExperience: number;
};

export type AddExperienceInput = {
  title: string;
  company: string;
  description: string;
  startDate: string;
  endDate?: string | null;
};

export type FreelancerProfileServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type FreelancerProfileServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: FreelancerProfileServiceError };


// Validation helpers

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

// Profile Operations

export async function createProfile(
  userId: string,
  input: CreateFreelancerProfileInput
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_EXISTS', message: 'Freelancer profile already exists for this user' },
    };
  }

  const profile: FreelancerProfile = {
    id: generateId(),
    userId,
    bio: input.bio,
    hourlyRate: input.hourlyRate,
    skills: [],
    experience: [],
    availability: input.availability ?? 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await freelancerProfileRepository.createProfile(profile);
  return { success: true, data: created };
}

export async function getProfileByUserId(userId: string): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const profile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!profile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }
  return { success: true, data: profile };
}

export async function updateProfile(
  userId: string,
  input: UpdateFreelancerProfileInput
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, input);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update profile' },
    };
  }

  return { success: true, data: updated };
}


// Skill Operations

export async function addSkillsToProfile(
  userId: string,
  skills: AddSkillInput[]
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const validSkills: SkillReference[] = [];
  const invalidSkillIds: string[] = [];

  for (const skillInput of skills) {
    const skill = await skillRepository.findSkillById(skillInput.skillId);
    if (!skill || !skill.isActive) {
      invalidSkillIds.push(skillInput.skillId);
    } else {
      // Check if skill already exists in profile
      const existingSkillIndex = existingProfile.skills.findIndex(s => s.skillId === skillInput.skillId);
      if (existingSkillIndex === -1) {
        validSkills.push({
          skillId: skill.id,
          skillName: skill.name,
          categoryId: skill.categoryId,
          yearsOfExperience: skillInput.yearsOfExperience,
        });
      } else {
        // Update years of experience for existing skill
        const existingSkill = existingProfile.skills[existingSkillIndex];
        if (existingSkill) {
          existingSkill.yearsOfExperience = skillInput.yearsOfExperience;
        }
      }
    }
  }

  if (invalidSkillIds.length > 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_SKILL',
        message: 'One or more skill IDs are invalid or inactive',
        details: invalidSkillIds,
      },
    };
  }

  const updatedSkills = [...existingProfile.skills, ...validSkills];
  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, {
    skills: updatedSkills,
  });

  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to add skills to profile' },
    };
  }

  return { success: true, data: updated };
}

export async function removeSkillFromProfile(
  userId: string,
  skillId: string
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const updatedSkills = existingProfile.skills.filter(s => s.skillId !== skillId);
  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, {
    skills: updatedSkills,
  });

  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to remove skill from profile' },
    };
  }

  return { success: true, data: updated };
}


// Work Experience Operations

export async function addExperience(
  userId: string,
  input: AddExperienceInput
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const dateValidation = validateDateRange(input.startDate, input.endDate);
  if (!dateValidation.valid) {
    return {
      success: false,
      error: { code: 'INVALID_DATE_RANGE', message: dateValidation.message ?? 'Invalid date range' },
    };
  }

  const experience: WorkExperience = {
    id: generateId(),
    title: input.title,
    company: input.company,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
  };

  const updatedExperience = [...existingProfile.experience, experience];
  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, {
    experience: updatedExperience,
  });

  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to add experience' },
    };
  }

  return { success: true, data: updated };
}

export async function updateExperience(
  userId: string,
  experienceId: string,
  input: Partial<AddExperienceInput>
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const experienceIndex = existingProfile.experience.findIndex(e => e.id === experienceId);
  if (experienceIndex === -1) {
    return {
      success: false,
      error: { code: 'EXPERIENCE_NOT_FOUND', message: 'Work experience entry not found' },
    };
  }

  const currentExperience = existingProfile.experience[experienceIndex];
  if (!currentExperience) {
    return {
      success: false,
      error: { code: 'EXPERIENCE_NOT_FOUND', message: 'Work experience entry not found' },
    };
  }

  const newStartDate = input.startDate ?? currentExperience.startDate;
  const newEndDate = input.endDate !== undefined ? input.endDate : currentExperience.endDate;

  const dateValidation = validateDateRange(newStartDate, newEndDate);
  if (!dateValidation.valid) {
    return {
      success: false,
      error: { code: 'INVALID_DATE_RANGE', message: dateValidation.message ?? 'Invalid date range' },
    };
  }

  const updatedExperience = [...existingProfile.experience];
  updatedExperience[experienceIndex] = {
    id: currentExperience.id,
    title: input.title ?? currentExperience.title,
    company: input.company ?? currentExperience.company,
    description: input.description ?? currentExperience.description,
    startDate: newStartDate,
    endDate: newEndDate,
  };

  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, {
    experience: updatedExperience,
  });

  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update experience' },
    };
  }

  return { success: true, data: updated };
}

export async function removeExperience(
  userId: string,
  experienceId: string
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const updatedExperience = existingProfile.experience.filter(e => e.id !== experienceId);
  const updated = await freelancerProfileRepository.updateProfile(existingProfile.id, userId, {
    experience: updatedExperience,
  });

  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to remove experience' },
    };
  }

  return { success: true, data: updated };
}
