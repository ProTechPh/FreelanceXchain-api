export interface PortfolioItem {
  id: string;
  freelancerId: string;
  title: string;
  description: string;
  projectUrl?: string;
  images: PortfolioImage[];
  skills: string[];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioImage {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface PortfolioItemEntity {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  project_url?: string;
  images: PortfolioImage[];
  skills: string[];
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItemInput {
  title: string;
  description: string;
  projectUrl?: string;
  images: PortfolioImage[];
  skills?: string[];
  completedAt?: string;
}
