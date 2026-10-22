// Employer profile domain types
export const BUSINESS_TYPES = ['sole_proprietorship', 'partnership', 'corporation', 'cooperative'] as const;
export type BusinessType = typeof BUSINESS_TYPES[number];

export const BUSINESS_VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type BusinessVerificationStatus = typeof BUSINESS_VERIFICATION_STATUSES[number];

export type EmployerProfile = {
  id: string;
  userId: string;
  name: string | null;
  nationality: string | null;
  companyName: string;
  description: string;
  industry: string;
  businessType: BusinessType | null;
  tin: string | null;
  registrationNumber: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  website: string | null;
  yearEstablished: number | null;
  verificationStatus: BusinessVerificationStatus;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// Business documents collected for transparency and verification.
export const BUSINESS_DOCUMENT_TYPES = [
  'bir_2303',
  'dti_certificate',
  'sec_registration',
  'mayors_permit',
  'barangay_clearance',
  'other',
] as const;
export type BusinessDocumentType = typeof BUSINESS_DOCUMENT_TYPES[number];

export const BUSINESS_DOCUMENT_LABELS: Record<BusinessDocumentType, string> = {
  bir_2303: 'BIR Certificate of Registration (Form 2303)',
  dti_certificate: 'DTI Certificate of Business Name Registration',
  sec_registration: 'SEC Certificate of Incorporation',
  mayors_permit: "Mayor's / Business Permit",
  barangay_clearance: 'Barangay Business Clearance',
  other: 'Other business document',
};

export type BusinessDocument = {
  id: string;
  employerId: string;
  documentType: BusinessDocumentType;
  label: string | null;
  fileName: string;
  fileUrl: string;
  fileHash?: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfileCompleteness = {
  complete: boolean;
  missingFields: string[];
  missingDocuments: BusinessDocumentType[];
  verificationStatus?: BusinessVerificationStatus;
  verificationNotes?: string | null;
  verifiedAt?: string | null;
};
