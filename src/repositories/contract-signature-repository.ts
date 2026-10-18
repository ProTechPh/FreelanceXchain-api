import { BaseRepository } from './base-repository.js';
import { Query } from '../config/appwrite.js';

export type ContractSignatureEntity = {
  id: string;
  contract_id: string;
  signer_id: string;
  signer_role: 'employer' | 'freelancer';
  terms_hash: string;
  signature_type: 'drawn' | 'typed';
  signature_image?: string | null;
  typed_name?: string | null;
  wallet_address: string;
  wallet_signature: string;
  eip712_domain: string | Record<string, unknown>;
  consent_version: string;
  signed_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  status: 'valid' | 'voided';
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'contract_signatures';

export class ContractSignatureRepository extends BaseRepository<ContractSignatureEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createSignature(signature: Omit<ContractSignatureEntity, 'created_at' | 'updated_at'>): Promise<ContractSignatureEntity> {
    return this.create(signature);
  }

  /** Every signature on the contract (valid and voided), oldest first. Errors propagate. */
  async listByContract(contractId: string): Promise<ContractSignatureEntity[]> {
    return this.fetchAll([Query.equal('contract_id', contractId), Query.orderAsc('$createdAt')]);
  }

  /** Void every valid signature (terms reopened for negotiation). */
  async voidAllForContract(contractId: string): Promise<number> {
    const valid = (await this.listByContract(contractId)).filter(s => s.status === 'valid');
    await Promise.all(valid.map(s => this.update(s.id, { status: 'voided' })));
    return valid.length;
  }
}

export const contractSignatureRepository = new ContractSignatureRepository();
