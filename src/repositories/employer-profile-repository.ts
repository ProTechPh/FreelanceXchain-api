import { BaseRepository } from './base-repository.js';
import type { BusinessType, BusinessVerificationStatus } from '../models/employer-profile.js';

export type EmployerProfileEntity = {
  id: string;
  user_id: string;
  name: string | null;
  nationality: string | null;
  company_name: string;
  description: string;
  industry: string;
  business_type?: BusinessType | null;
  tin?: string | null;
  registration_number?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  website?: string | null;
  year_established?: number | null;
  verification_status?: BusinessVerificationStatus | null;
  verification_notes?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'employer_profiles';

export class EmployerProfileRepository extends BaseRepository<EmployerProfileEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProfile(profile: Omit<EmployerProfileEntity, 'created_at' | 'updated_at'>): Promise<EmployerProfileEntity> {
    return this.create(profile);
  }

  async getProfileByUserId(userId: string): Promise<EmployerProfileEntity | null> {
    return this.findOne('user_id', userId);
  }

  async updateProfile(id: string, updates: Partial<EmployerProfileEntity>): Promise<EmployerProfileEntity | null> {
    return this.update(id, updates);
  }
}

export const employerProfileRepository = new EmployerProfileRepository();
