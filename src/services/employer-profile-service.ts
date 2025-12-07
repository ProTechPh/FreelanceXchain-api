import { EmployerProfile } from '../models/employer-profile.js';
import { employerProfileRepository } from '../repositories/employer-profile-repository.js';
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

  const profile: EmployerProfile = {
    id: generateId(),
    userId,
    companyName: input.companyName,
    description: input.description,
    industry: input.industry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await employerProfileRepository.createProfile(profile);
  return { success: true, data: created };
}

export async function getEmployerProfileByUserId(
  userId: string
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const profile = await employerProfileRepository.getProfileByUserId(userId);
  if (!profile) {
    return {
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Employer profile not found' },
    };
  }
  return { success: true, data: profile };
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

  const updated = await employerProfileRepository.updateProfile(existingProfile.id, userId, input);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update profile' },
    };
  }

  return { success: true, data: updated };
}
