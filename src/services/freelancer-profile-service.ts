import { FreelancerProfile, mapFreelancerProfileFromEntity } from '../utils/entity-mapper.js';
import { freelancerProfileRepository, FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { generateId } from '../utils/id.js';
import { getProfileDataFromKyc } from './didit-kyc-service.js';

export type CreateFreelancerProfileInput = {
  bio: string;
  hourlyRate: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

export type CreateProfileFromKycInput = {
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

export type UpdateFreelancerProfileInput = {
  bio?: string;
  hourlyRate?: number;
  availability?: 'available' | 'busy' | 'unavailable';
};

export type AddSkillInput = {
  name: string;
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
  return { success: true, data: mapFreelancerProfileFromEntity(createdEntity) };
}

/**
 * Create freelancer profile from KYC data
 * Pre-populates profile with verified name and location from KYC
 */
export async function createProfileFromKyc(
  userId: string,
  input: CreateProfileFromKycInput = {}
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  // Check if profile already exists
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_EXISTS', message: 'Freelancer profile already exists for this user' },
    };
  }

  // Get KYC data
  const kycResult = await getProfileDataFromKyc(userId);
  if (!kycResult.success) {
    return {
      success: false,
      error: { 
        code: 'KYC_NOT_APPROVED', 
        message: kycResult.error.message || 'KYC verification must be approved before creating profile' 
      },
    };
  }

  const kycData = kycResult.data;
  if (!kycData) {
    return {
      success: false,
      error: { code: 'KYC_NOT_APPROVED', message: 'No KYC data available' },
    };
  }

  // Build bio from KYC data if not provided
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
  return { success: true, data: mapFreelancerProfileFromEntity(createdEntity) };
}

export async function getProfileByUserId(userId: string): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const profileEntity = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!profileEntity) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }
  return { success: true, data: mapFreelancerProfileFromEntity(profileEntity) };
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

  const updates: Partial<FreelancerProfileEntity> = {};
  if (input.bio !== undefined) updates.bio = input.bio;
  if (input.hourlyRate !== undefined) updates.hourly_rate = input.hourlyRate;
  if (input.availability !== undefined) updates.availability = input.availability;

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, updates);
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update profile' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
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

  const newSkills: FreelancerProfileEntity['skills'] = [];

  for (const skillInput of skills) {
    const trimmedName = skillInput.name.trim();
    
    // Check if skill already exists in profile (case-sensitive)
    const existingSkillIndex = existingProfile.skills.findIndex(
      s => s.name === trimmedName
    );
    
    // Check if skill already exists in newSkills being built (case-sensitive)
    const newSkillIndex = newSkills.findIndex(
      s => s.name === trimmedName
    );
    
    if (existingSkillIndex === -1 && newSkillIndex === -1) {
      // Add new skill
      newSkills.push({
        name: trimmedName,
        years_of_experience: skillInput.yearsOfExperience,
      });
    } else if (existingSkillIndex !== -1) {
      // Update years of experience for existing skill in profile
      const existingSkill = existingProfile.skills[existingSkillIndex];
      if (existingSkill) {
        existingSkill.years_of_experience = skillInput.yearsOfExperience;
      }
    } else if (newSkillIndex !== -1) {
      // Update years of experience for skill being added in this batch
      const newSkill = newSkills[newSkillIndex];
      if (newSkill) {
        newSkill.years_of_experience = skillInput.yearsOfExperience;
      }
    }
  }

  const updatedSkills = [...existingProfile.skills, ...newSkills];
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: updatedSkills,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to add skills to profile' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
}

export async function removeSkillFromProfile(
  userId: string,
  skillName: string
): Promise<FreelancerProfileServiceResult<FreelancerProfile>> {
  const existingProfile = await freelancerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Freelancer profile not found' },
    };
  }

  const updatedSkills = existingProfile.skills.filter(
    s => s.name.toLowerCase() !== skillName.toLowerCase()
  );
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    skills: updatedSkills,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to remove skill from profile' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
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
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to add experience' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
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

  const newStartDate = input.startDate ?? currentExperience.start_date;
  const newEndDate = input.endDate !== undefined ? input.endDate : currentExperience.end_date;

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
    start_date: newStartDate,
    end_date: newEndDate,
  };

  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update experience' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
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
  const updatedEntity = await freelancerProfileRepository.updateProfile(existingProfile.id, {
    experience: updatedExperience,
  });

  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to remove experience' },
    };
  }

  return { success: true, data: mapFreelancerProfileFromEntity(updatedEntity) };
}
