import { EmployerProfile, mapEmployerProfileFromEntity } from '../utils/entity-mapper.js';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { generateId } from '../utils/id.js';

export type CreateEmployerProfileInput = {
  companyName: string;
  description: string;
  industry: string;
};

export type UpdateEmployerProfileInput = {
  companyName?: string;
  description?: string;
  industry?: string;
};

export type EmployerProfileServiceError = {
  code: string;
  message: string;
};

export type EmployerProfileServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: EmployerProfileServiceError };

// Profile Operations

export async function createEmployerProfile(
  userId: string,
  input: CreateEmployerProfileInput
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_EXISTS', message: 'Employer profile already exists for this user' },
    };
  }

  const profileEntity: Omit<EmployerProfileEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    company_name: input.companyName,
    description: input.description,
    industry: input.industry,
  };

  const createdEntity = await employerProfileRepository.createProfile(profileEntity);
  return { success: true, data: mapEmployerProfileFromEntity(createdEntity) };
}

export async function getEmployerProfileByUserId(
  userId: string
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const profileEntity = await employerProfileRepository.getProfileByUserId(userId);
  if (!profileEntity) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Employer profile not found' },
    };
  }
  return { success: true, data: mapEmployerProfileFromEntity(profileEntity) };
}

export async function updateEmployerProfile(
  userId: string,
  input: UpdateEmployerProfileInput
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Employer profile not found' },
    };
  }

  const updates: Partial<EmployerProfileEntity> = {};
  if (input.companyName !== undefined) updates.company_name = input.companyName;
  if (input.description !== undefined) updates.description = input.description;
  if (input.industry !== undefined) updates.industry = input.industry;

  const updatedEntity = await employerProfileRepository.updateProfile(existingProfile.id, updates);
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update profile' },
    };
  }

  return { success: true, data: mapEmployerProfileFromEntity(updatedEntity) };
}
