import { EmployerProfile, mapEmployerProfileFromEntity } from '../utils/entity-mapper';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository';
import { generateId } from '../utils/id';
import { getProfileDataFromKyc } from './didit-kyc-service';

export type CreateEmployerProfileInput = {
  companyName: string;
  description: string;
  industry: string;
};

export type CreateEmployerProfileFromKycInput = {
  companyName?: string;
  description?: string;
  industry?: string;
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
    name: null,
    nationality: null,
    company_name: input.companyName,
    description: input.description,
    industry: input.industry,
  };

  const createdEntity = await employerProfileRepository.createProfile(profileEntity);
  return { success: true, data: mapEmployerProfileFromEntity(createdEntity) };
}

/**
 * Create employer profile from KYC data
 * Pre-populates profile with verified name from KYC
 */
export async function createEmployerProfileFromKyc(
  userId: string,
  input: CreateEmployerProfileFromKycInput = {}
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  // Check if profile already exists
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return {
      success: false,
      error: { code: 'PROFILE_EXISTS', message: 'Employer profile already exists for this user' },
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

  // Build default description from KYC data if not provided
  const defaultDescription = kycData.name 
    ? `Verified employer: ${kycData.name}. Looking for talented freelancers.`
    : 'Verified employer looking for talented freelancers.';

  const profileEntity: Omit<EmployerProfileEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    name: kycData.name,
    nationality: kycData.nationality,
    company_name: input.companyName ?? kycData.name ?? 'My Company',
    description: input.description ?? defaultDescription,
    industry: input.industry ?? 'Technology',
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
