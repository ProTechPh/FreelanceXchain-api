import { BaseRepository, type PaginatedResult } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type EmailFolder = 'inbox' | 'sent' | 'trash';

export type EmailEntity = {
  id: string;
  message_id: string;
  user_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  text_body: string;
  html_body: string;
  attachments: string;
  is_read: boolean;
  is_starred: boolean;
  folder: EmailFolder;
  in_reply_to: string | null;
  references: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};

export type EmailListItem = Omit<EmailEntity, 'text_body' | 'html_body'>;

const COLLECTION_ID = 'emails';

function mapDoc(doc: Record<string, any>): EmailEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as EmailEntity;
}

function mapListItem(doc: Record<string, any>): EmailListItem {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  const { text_body: _text, html_body: _html, ...rest } = attrs;
  return {
    id: $id,
    ...rest,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as EmailListItem;
}

export class EmailInboxRepository extends BaseRepository<EmailEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByMessageId(messageId: string): Promise<EmailEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('message_id', messageId),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async listByUserFolder(
    userId: string,
    folder: EmailFolder,
    limit: number = 20,
    offset: number = 0,
    isRead?: boolean
  ): Promise<PaginatedResult<EmailListItem>> {
    const queries: any[] = [
      Query.equal('user_id', userId),
      Query.equal('folder', folder),
      Query.orderDesc('received_at'),
    ];
    if (isRead !== undefined) {
      queries.push(Query.equal('is_read', isRead));
    }
    return this.paginatedWithQueries<EmailListItem>(queries, limit, offset, mapListItem);
  }

  async getFullEmail(id: string, userId: string): Promise<EmailEntity | null> {
    const email = await this.getById(id);
    if (!email || email.user_id !== userId) return null;
    return email;
  }

  async markAsRead(id: string): Promise<EmailEntity | null> {
    return this.update(id, { is_read: true } as Partial<EmailEntity>);
  }

  async toggleStar(id: string, isStarred: boolean): Promise<EmailEntity | null> {
    return this.update(id, { is_starred: isStarred } as Partial<EmailEntity>);
  }

  async moveToFolder(id: string, folder: EmailFolder): Promise<EmailEntity | null> {
    return this.update(id, { folder } as Partial<EmailEntity>);
  }

  async getUnreadCount(userId: string, folder: EmailFolder = 'inbox'): Promise<number> {
    return this.countWithQueries([
      Query.equal('user_id', userId),
      Query.equal('folder', folder),
      Query.equal('is_read', false),
    ]);
  }

  async findByThread(userId: string, messageId: string): Promise<EmailEntity[]> {
    const queries: any[] = [
      Query.equal('user_id', userId),
      Query.contains('references', messageId),
      Query.orderAsc('received_at'),
    ];
    return this.listWithQueries<EmailEntity>(queries, mapDoc);
  }
}

export const emailInboxRepository = new EmailInboxRepository();
