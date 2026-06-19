import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
import { Query } from '../config/appwrite.js';

export type PortfolioItemEntity = {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  project_url?: string;
  images: string;
  skills: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'portfolio_items';

function mapDoc(doc: Record<string, any>): PortfolioItemEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as PortfolioItemEntity;
}

export class PortfolioRepository extends BaseRepositoryAppwrite<PortfolioItemEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByFreelancer(freelancerId: string): Promise<PortfolioItemEntity[]> {
    return this.listWithQueries<PortfolioItemEntity>(
      [
        Query.equal('freelancer_id', freelancerId),
        Query.orderDesc('created_at'),
      ],
      mapDoc
    );
  }

  async findOwnerById(id: string): Promise<string | null> {
    const doc = await this.getById(id);
    return doc ? (doc as any).freelancer_id ?? null : null;
  }
}

export const portfolioRepository = new PortfolioRepository();
