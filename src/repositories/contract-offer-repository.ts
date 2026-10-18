import { BaseRepository } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import type { OfferMilestone } from '../utils/contract-terms.js';

export type ContractOfferStatus = 'pending' | 'accepted' | 'countered' | 'declined' | 'withdrawn' | 'superseded';

export type ContractOfferEntity = {
  id: string;
  contract_id: string;
  round: number;
  proposed_by: string;
  proposer_role: 'employer' | 'freelancer';
  status: ContractOfferStatus;
  base_amount: number;
  additional_pay: number;
  is_rush: boolean;
  rush_fee_percentage: number;
  rush_fee: number;
  total_amount: number;
  milestones: OfferMilestone[];
  deadline: string;
  message?: string | null;
  parent_offer_id?: string | null;
  responded_by?: string | null;
  responded_at?: string | null;
  offer_hash: string;
  is_seed?: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'contract_offers';

export class ContractOfferRepository extends BaseRepository<ContractOfferEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createOffer(offer: Omit<ContractOfferEntity, 'created_at' | 'updated_at'>): Promise<ContractOfferEntity> {
    return this.create(offer);
  }

  async getOfferById(id: string): Promise<ContractOfferEntity | null> {
    return this.getById(id);
  }

  async updateOffer(id: string, updates: Partial<ContractOfferEntity>): Promise<ContractOfferEntity | null> {
    return this.update(id, updates);
  }

  /** Every offer on the contract, oldest first. Errors propagate. */
  async listByContract(contractId: string): Promise<ContractOfferEntity[]> {
    return this.fetchAll([Query.equal('contract_id', contractId), Query.orderAsc('$createdAt')]);
  }
}

export const contractOfferRepository = new ContractOfferRepository();
