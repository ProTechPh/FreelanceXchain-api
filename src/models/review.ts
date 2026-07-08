export type Review = {
  id: string;
  contractId: string;
  projectId?: string | undefined;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string | undefined;
  reviewerRole?: string | undefined;
  workQuality?: number | undefined;
  communication?: number | undefined;
  professionalism?: number | undefined;
  wouldWorkAgain?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
};

export type ReviewEntity = {
  id: string;
  contract_id: string;
  project_id?: string | undefined;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string | undefined;
  reviewer_role?: string | undefined;
  work_quality?: number | undefined;
  communication?: number | undefined;
  professionalism?: number | undefined;
  would_work_again?: boolean | undefined;
  created_at: string;
  updated_at: string;
};

export type SubmitReviewInput = {
  contractId: string;
  reviewerId: string;
  rateeId?: string;
  rating: number;
  comment?: string;
  reviewerRole?: string;
  workQuality?: number;
  communication?: number;
  professionalism?: number;
  wouldWorkAgain?: boolean;
};
