export type EvidenceType = 'document' | 'screenshot' | 'message' | 'contract' | 'other';

export type DisputeEvidence = {
  id: string;
  disputeId: string;
  submittedBy: string;
  evidenceType: EvidenceType;
  fileUrl?: string;
  description: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SubmitEvidenceInput = {
  disputeId: string;
  submittedBy: string;
  evidenceType: EvidenceType;
  fileUrl?: string;
  description: string;
};

export type VerifyEvidenceInput = {
  evidenceId: string;
  verifiedBy: string;
};
