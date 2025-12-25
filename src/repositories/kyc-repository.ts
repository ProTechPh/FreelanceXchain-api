import { BaseRepository } from './base-repository.js';
import { TABLES } from '../config/supabase.js';
import { KycVerification, KycDocument, LivenessCheck } from '../models/kyc.js';

export type KycStatus = 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export type KycVerificationEntity = {
  id: string;
  user_id: string;
  status: KycStatus;
  tier: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth: string;
  place_of_birth?: string;
  nationality: string;
  secondary_nationality?: string;
  tax_residence_country?: string;
  tax_identification_number?: string;
  address: Record<string, unknown>;
  documents: Record<string, unknown>[];
  liveness_check?: Record<string, unknown>;
  selfie_image_url?: string;
  face_match_score?: number;
  face_match_status?: string;
  aml_screening_status?: string;
  aml_screening_notes?: string;
  pep_status?: boolean;
  sanctions_status?: boolean;
  risk_level?: string;
  risk_score?: number;
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  rejection_code?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
};

// Map entity to model
function mapKycFromEntity(entity: KycVerificationEntity): KycVerification {
  return {
    id: entity.id,
    userId: entity.user_id,
    status: entity.status,
    tier: entity.tier as KycVerification['tier'],
    firstName: entity.first_name,
    middleName: entity.middle_name,
    lastName: entity.last_name,
    dateOfBirth: entity.date_of_birth,
    placeOfBirth: entity.place_of_birth,
    nationality: entity.nationality,
    secondaryNationality: entity.secondary_nationality,
    taxResidenceCountry: entity.tax_residence_country,
    taxIdentificationNumber: entity.tax_identification_number,
    address: entity.address as KycVerification['address'],
    documents: entity.documents as KycDocument[],
    livenessCheck: entity.liveness_check as LivenessCheck | undefined,
    selfieImageUrl: entity.selfie_image_url,
    faceMatchScore: entity.face_match_score,
    faceMatchStatus: entity.face_match_status as KycVerification['faceMatchStatus'],
    amlScreeningStatus: entity.aml_screening_status as KycVerification['amlScreeningStatus'],
    amlScreeningNotes: entity.aml_screening_notes,
    pepStatus: entity.pep_status,
    sanctionsStatus: entity.sanctions_status,
    riskLevel: entity.risk_level as KycVerification['riskLevel'],
    riskScore: entity.risk_score,
    submittedAt: entity.submitted_at,
    reviewedAt: entity.reviewed_at,
    reviewedBy: entity.reviewed_by,
    rejectionReason: entity.rejection_reason,
    rejectionCode: entity.rejection_code as KycVerification['rejectionCode'],
    expiresAt: entity.expires_at,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Map model to entity for updates
function mapKycToEntity(kyc: Partial<KycVerification>): Partial<KycVerificationEntity> {
  const entity: Partial<KycVerificationEntity> = {};
  if (kyc.userId !== undefined) entity.user_id = kyc.userId;
  if (kyc.status !== undefined) entity.status = kyc.status;
  if (kyc.tier !== undefined) entity.tier = kyc.tier;
  if (kyc.firstName !== undefined) entity.first_name = kyc.firstName;
  if (kyc.middleName !== undefined) entity.middle_name = kyc.middleName;
  if (kyc.lastName !== undefined) entity.last_name = kyc.lastName;
  if (kyc.dateOfBirth !== undefined) entity.date_of_birth = kyc.dateOfBirth;
  if (kyc.placeOfBirth !== undefined) entity.place_of_birth = kyc.placeOfBirth;
  if (kyc.nationality !== undefined) entity.nationality = kyc.nationality;
  if (kyc.secondaryNationality !== undefined) entity.secondary_nationality = kyc.secondaryNationality;
  if (kyc.taxResidenceCountry !== undefined) entity.tax_residence_country = kyc.taxResidenceCountry;
  if (kyc.taxIdentificationNumber !== undefined) entity.tax_identification_number = kyc.taxIdentificationNumber;
  if (kyc.address !== undefined) entity.address = kyc.address as Record<string, unknown>;
  if (kyc.documents !== undefined) entity.documents = kyc.documents as Record<string, unknown>[];
  if (kyc.livenessCheck !== undefined) entity.liveness_check = kyc.livenessCheck as Record<string, unknown>;
  if (kyc.selfieImageUrl !== undefined) entity.selfie_image_url = kyc.selfieImageUrl;
  if (kyc.faceMatchScore !== undefined) entity.face_match_score = kyc.faceMatchScore;
  if (kyc.faceMatchStatus !== undefined) entity.face_match_status = kyc.faceMatchStatus;
  if (kyc.amlScreeningStatus !== undefined) entity.aml_screening_status = kyc.amlScreeningStatus;
  if (kyc.amlScreeningNotes !== undefined) entity.aml_screening_notes = kyc.amlScreeningNotes;
  if (kyc.pepStatus !== undefined) entity.pep_status = kyc.pepStatus;
  if (kyc.sanctionsStatus !== undefined) entity.sanctions_status = kyc.sanctionsStatus;
  if (kyc.riskLevel !== undefined) entity.risk_level = kyc.riskLevel;
  if (kyc.riskScore !== undefined) entity.risk_score = kyc.riskScore;
  if (kyc.submittedAt !== undefined) entity.submitted_at = kyc.submittedAt;
  if (kyc.reviewedAt !== undefined) entity.reviewed_at = kyc.reviewedAt;
  if (kyc.reviewedBy !== undefined) entity.reviewed_by = kyc.reviewedBy;
  if (kyc.rejectionReason !== undefined) entity.rejection_reason = kyc.rejectionReason;
  if (kyc.rejectionCode !== undefined) entity.rejection_code = kyc.rejectionCode;
  if (kyc.expiresAt !== undefined) entity.expires_at = kyc.expiresAt;
  if (kyc.updatedAt !== undefined) entity.updated_at = kyc.updatedAt;
  return entity;
}

export class KycRepository extends BaseRepository<KycVerificationEntity> {
  constructor() {
    super(TABLES.KYC_VERIFICATIONS);
  }

  async createKyc(kyc: KycVerification): Promise<KycVerification> {
    const entity = mapKycToEntity(kyc) as Omit<KycVerificationEntity, 'created_at' | 'updated_at'>;
    entity.id = kyc.id;
    const created = await this.create(entity);
    return mapKycFromEntity(created);
  }

  async getKycById(id: string): Promise<KycVerification | null> {
    const entity = await this.getById(id);
    return entity ? mapKycFromEntity(entity) : null;
  }

  async getKycByUserId(userId: string): Promise<KycVerification | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get KYC by user: ${error.message}`);
    }
    return mapKycFromEntity(data as KycVerificationEntity);
  }

  async updateKyc(id: string, _userId: string, updates: Partial<KycVerification>): Promise<KycVerification | null> {
    const entityUpdates = mapKycToEntity(updates);
    const updated = await this.update(id, entityUpdates);
    return updated ? mapKycFromEntity(updated) : null;
  }

  async getKycByStatus(status: KycStatus, limit = 50): Promise<KycVerification[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('status', status)
      .order('submitted_at', { ascending: true })
      .limit(limit);
    
    if (error) throw new Error(`Failed to get KYC by status: ${error.message}`);
    return (data ?? []).map((e: KycVerificationEntity) => mapKycFromEntity(e));
  }

  async getPendingReviews(limit = 50): Promise<KycVerification[]> {
    return this.getKycByStatus('submitted', limit);
  }
}

export const kycRepository = new KycRepository();
