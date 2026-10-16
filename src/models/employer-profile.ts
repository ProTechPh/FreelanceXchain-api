// Employer profile domain types
export const BUSINESS_TYPES = ['sole_proprietorship', 'partnership', 'corporation', 'cooperative'] as const;
export type BusinessType = typeof BUSINESS_TYPES[number];

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
  createdAt: string;
  updatedAt: string;
};

// Business documents are collected and displayed only; they are not checked
// against BIR, DTI or SEC records.
export const BUSINESS_DOCUMENT_TYPES = [
  'bir_2303',
  'dti_certificate',
  'sec_registration',
  'mayors_permit',
  'barangay_clearance',
  'other',
] as const;
export type BusinessDocumentType = typeof BUSINESS_DOCUMENT_TYPES[number];

export type BusinessDocument = {
  id: string;
  employerId: string;
  documentType: BusinessDocumentType;
  label: string | null;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfileCompleteness = {
  complete: boolean;
  missingFields: string[];
  missingDocuments: BusinessDocumentType[];
};
