export interface Review {
  id: string;
  contractId: string;
  projectId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  workQuality: number;
  communication: number;
  professionalism: number;
  wouldWorkAgain: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewEntity {
  id: string;
  contract_id: string;
  project_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string;
  work_quality: number;
  communication: number;
  professionalism: number;
  would_work_again: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubmitReviewInput {
  contractId: string;
  reviewerId: string;
  rating: number;
  comment: string;
  workQuality: number;
  communication: number;
  professionalism: number;
  wouldWorkAgain: boolean;
}
