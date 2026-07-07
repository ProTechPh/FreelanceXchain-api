export type PortfolioItem = {
  id: string;
  freelancerId: string;
  title: string;
  description: string;
  projectUrl?: string;
  images: PortfolioImage[];
  skills: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioImage = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export type PortfolioItemEntity = {
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
};

export type PortfolioItemInput = {
  title: string;
  description: string;
  projectUrl?: string;
  images: PortfolioImage[];
  skills?: string[];
  completedAt?: string;
};
