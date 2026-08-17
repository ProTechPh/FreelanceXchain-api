import { FreelancerProfile, mapFreelancerProfileFromEntity } from '../utils/entity-mapper.js';
import { freelancerProfileRepository, FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { generateId } from '../utils/id.js';
import { normalizeSkillName } from '../utils/skill-utils.js';
import { getProfileDataFromKyc } from './didit-kyc-service.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

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
};




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

  const newSkills: FreelancerProfileEntity['skills'] = [];

  for (const skillInput of skills) {
    const trimmedName = skillInput.name.trim();

    // Check if skill already exists in profile (normalized to prevent duplicates)
    const existingSkillIndex = (existingProfile.skills || []).findIndex(
      s => s && s.name && normalizeSkillName(s.name) === normalizeSkillName(trimmedName)
    );

    // Check if skill already exists in newSkills being built (normalized)
    /* istanbul ignore next -- newSkills is always initialized as [] at line 210; || [] is dead code */
    const newSkillIndex = (newSkills || []).findIndex(
      s => s && s.name && normalizeSkillName(s.name) === normalizeSkillName(trimmedName)
    );
    
    if (existingSkillIndex === -1 && newSkillIndex === -1) {
      newSkills.push({
        name: trimmedName,
        years_of_experience: skillInput.yearsOfExperience,
      });
    } else if (existingSkillIndex !== -1) {
      const existingSkill = existingProfile.skills[existingSkillIndex];
      if (existingSkill) {
        existingSkill.years_of_experience = skillInput.yearsOfExperience;
      }
    } else if (newSkillIndex !== -1) {
      const newSkill = newSkills[newSkillIndex];
      if (newSkill) {
        newSkill.years_of_experience = skillInput.yearsOfExperience;
      }
    }
  }

  const updatedSkills = [...(existingProfile.skills || []), ...newSkills];
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: updatedSkills,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to add skills to profile');
  }

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

  // Safely fallback and check for skills array to avoid crashing when deleting
  const currentSkills = existingProfile.skills || [];
  const updatedSkills = currentSkills.filter(
    s => s && s.name && normalizeSkillName(s.name) !== normalizeSkillName(skillName)
  );

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: updatedSkills,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to remove skill from profile');
  }

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
  };

  const updatedExperience = [...existingProfile.experience, experienceEntity];
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to add experience');
  }

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
  };

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update experience');
  }

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
  });

  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to remove experience');
  }

  return successResult(mapFreelancerProfileFromEntity(updatedEntity));
}
