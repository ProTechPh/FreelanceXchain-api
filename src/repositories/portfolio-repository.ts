import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
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

function mapDoc(doc: Record<string, unknown>): PortfolioItemEntity {
  return fromAppwriteDoc<PortfolioItemEntity>(doc);
}

export class PortfolioRepository extends BaseRepository<PortfolioItemEntity> {
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
    return doc ? doc.freelancer_id ?? null : null;
  }
}

export const portfolioRepository = new PortfolioRepository();
