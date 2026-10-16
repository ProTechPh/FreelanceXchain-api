import { EmployerProfile, mapEmployerProfileFromEntity } from '../utils/entity-mapper.js';
import { employerProfileRepository, EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { generateId } from '../utils/id.js';
import { getProfileDataFromKyc } from './didit-kyc-service.js';
import { userRepository } from '../repositories/user-repository.js';
import type { BusinessType } from '../models/employer-profile.js';
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

export type UpdateEmployerProfileInput = {
  companyName?: string;
  description?: string;
  industry?: string;
  businessType?: BusinessType;
  tin?: string;
  registrationNumber?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  website?: string | null;
  yearEstablished?: number;
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

/**
 * Return the user's employer profile, creating a minimal one if it is missing.
 * Used when a freelancer sets up their employer side before switching roles.
 * Only identity fields are prefilled (name/nationality from approved KYC, else
 * the account name); business fields are left for the user to fill in.
 */
export async function ensureEmployerProfile(
  userId: string
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    return successResult(mapEmployerProfileFromEntity(existingProfile));
  }

  const user = await userRepository.getUserById(userId);
  if (!user) {
    return errorResult('USER_NOT_FOUND', 'User not found');
  }

  const kycResult = await getProfileDataFromKyc(userId);
  const kycData = kycResult.success ? kycResult.data : null;
  const name = kycData?.name ?? user.name ?? null;

  const createdEntity = await employerProfileRepository.createProfile({
    id: generateId(),
    user_id: userId,
    name,
    nationality: kycData?.nationality ?? null,
    company_name: name ?? '',
    description: '',
    industry: '',
  });
  return successResult(mapEmployerProfileFromEntity(createdEntity));
}

export async function getEmployerProfileByUserId(
  userId: string
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const profileEntity = await employerProfileRepository.getProfileByUserId(userId);
  if (!profileEntity) {
    return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
  }
  return successResult(mapEmployerProfileFromEntity(profileEntity));
}

export async function updateEmployerProfile(
  userId: string,
  input: UpdateEmployerProfileInput
): Promise<EmployerProfileServiceResult<EmployerProfile>> {
  const existingProfile = await employerProfileRepository.getProfileByUserId(userId);
  if (!existingProfile) {
    return errorResult('PROFILE_NOT_FOUND', 'Employer profile not found');
  }

  const updates: Partial<EmployerProfileEntity> = {};
  if (input.companyName !== undefined) updates.company_name = input.companyName;
  if (input.description !== undefined) updates.description = input.description;
  if (input.industry !== undefined) updates.industry = input.industry;
  if (input.businessType !== undefined) updates.business_type = input.businessType;
  if (input.tin !== undefined) updates.tin = input.tin;
  if (input.registrationNumber !== undefined) updates.registration_number = input.registrationNumber;
  if (input.businessAddress !== undefined) updates.business_address = input.businessAddress;
  if (input.businessPhone !== undefined) updates.business_phone = input.businessPhone;
  if (input.businessEmail !== undefined) updates.business_email = input.businessEmail;
  if (input.website !== undefined) updates.website = input.website || null;
  if (input.yearEstablished !== undefined) updates.year_established = input.yearEstablished;

  const updatedEntity = await employerProfileRepository.updateProfile(existingProfile.id, updates);
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update profile');
  }

  return successResult(mapEmployerProfileFromEntity(updatedEntity));
}
