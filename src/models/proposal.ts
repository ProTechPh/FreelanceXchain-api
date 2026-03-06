// Proposal domain types
import type { FileAttachment } from '../utils/file-validator.js';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Proposal = {
  id: string;
  projectId: string;
  freelancerId: string;
  coverLetter: string | null;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};
