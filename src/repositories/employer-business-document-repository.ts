import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import type { BusinessDocumentType } from '../models/employer-profile.js';

export type EmployerBusinessDocumentEntity = {
  id: string;
  employer_id: string;
  document_type: BusinessDocumentType;
  label: string | null;
  file_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'employer_business_documents';

function mapDoc(doc: Record<string, unknown>): EmployerBusinessDocumentEntity {
  return fromAppwriteDoc<EmployerBusinessDocumentEntity>(doc);
}

export class EmployerBusinessDocumentRepository extends BaseRepository<EmployerBusinessDocumentEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createDocument(data: Omit<EmployerBusinessDocumentEntity, 'created_at' | 'updated_at'>): Promise<EmployerBusinessDocumentEntity> {
    return this.create(data);
  }

  async getDocumentById(id: string): Promise<EmployerBusinessDocumentEntity | null> {
    return this.getById(id);
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async findByEmployer(employerId: string): Promise<EmployerBusinessDocumentEntity[]> {
    return this.listWithQueries<EmployerBusinessDocumentEntity>(
      [Query.equal('employer_id', employerId), Query.orderAsc('$createdAt'), Query.limit(100)],
      mapDoc
    );
  }
}

export const employerBusinessDocumentRepository = new EmployerBusinessDocumentRepository();
