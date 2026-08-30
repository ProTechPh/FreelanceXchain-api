import { EmployerProfile, mapEmployerProfileFromEntity } from '../utils/entity-mapper.js';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { generateId } from '../utils/id.js';
import { getProfileDataFromKyc } from './didit-kyc-service.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

type CreateEmployerProfileInput = {
  companyName: string;
  description: string;
  industry: string;
};

type CreateEmployerProfileFromKycInput = {
  companyName?: string;
  description?: string;
  industry?: string;
};

type UpdateEmployerProfileInput = {
  companyName?: string;
  description?: string;
  industry?: string;
};

type EmployerProfileServiceResult<T> = ServiceResult<T>;



export async function createEmployerProfile(
  userId: string,
  input: CreateEmployerProfileInput
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return errorResult('PROFILE_EXISTS', 'Employer profile already exists for this user');
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
  return successResult(mapEmployerProfileFromEntity(createdEntity));
}

/**
 * Create employer profile from KYC data
 * Pre-populates profile with verified name from KYC
 */
export async function createEmployerProfileFromKyc(
  userId: string,
  input: CreateEmployerProfileFromKycInput = {}
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return errorResult('PROFILE_EXISTS', 'Employer profile already exists for this user');
  }

  const kycResult = await getProfileDataFromKyc(userId);
  if (!kycResult.success) {
    return errorResult('KYC_NOT_APPROVED', kycResult.error.message || 'KYC verification must be approved before creating profile');
  }

  const kycData = kycResult.data;
  if (!kycData) {
    return errorResult('KYC_NOT_APPROVED', 'No KYC data available');
  }

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
  return successResult(mapEmployerProfileFromEntity(createdEntity));
}

export async function getEmployerProfileByUserId(
  userId: string
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  let profileEntity = await employerProfileRepository.getProfileByUserId(userId);
  if (!profileEntity) {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
    }
    const defaultName = user.name || user.full_name || 'Employer';
    profileEntity = await employerProfileRepository.createProfile({
      id: generateId(),
      user_id: userId,
      name: defaultName,
      nationality: 'Global',
      company_name: defaultName,
      description: `Welcome to ${defaultName}'s employer profile on FreelanceXchain.`,
      industry: 'Technology',
    }).catch(() => null);

    if (!profileEntity) {
      return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
    }
  }
  return successResult(mapEmployerProfileFromEntity(profileEntity));
}

export async function updateEmployerProfile(
  userId: string,
  input: UpdateEmployerProfileInput
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  let existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    const user = await userRepository.getUserById(userId);
    const defaultName = user?.name || user?.full_name || 'Employer';
    const newProfile = await employerProfileRepository.createProfile({
      id: generateId(),
      user_id: userId,
      name: defaultName,
      nationality: 'Global',
      company_name: input.companyName || defaultName,
      description: input.description || `Welcome to ${defaultName}'s employer profile on FreelanceXchain.`,
      industry: input.industry || 'Technology',
    });
    return successResult(mapEmployerProfileFromEntity(newProfile));
  }

  const updates: Partial<EmployerProfileEntity> = {};
  if (input.companyName !== undefined) updates.company_name = input.companyName;
  if (input.description !== undefined) updates.description = input.description;
  if (input.industry !== undefined) updates.industry = input.industry;

  const updatedEntity = await employerProfileRepository.updateProfile(existingProfile.id, updates);
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update profile');
  }

  return successResult(mapEmployerProfileFromEntity(updatedEntity));
}
