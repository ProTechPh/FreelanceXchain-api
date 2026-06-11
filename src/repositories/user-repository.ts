import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type UserEntity = {
  id: string;
  email: string;
  password_hash: string;
  role: 'freelancer' | 'employer' | 'admin';
  wallet_address: string;
  name: string;
  is_suspended: boolean;
  suspension_reason: string | null;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'users';

export class UserRepository extends BaseRepositoryAppwrite<UserEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createUser(user: Omit<UserEntity, 'created_at' | 'updated_at'>): Promise<UserEntity> {
    return this.create(user);
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    return this.getById(id);
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('email', email),
          Query.limit(1),
        ]
      );
      if (response.documents.length === 0) return null;
      const doc = response.documents[0];
      const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
      return {
        id: $id,
        ...attrs,
        created_at: attrs.created_at ?? $createdAt,
        updated_at: attrs.updated_at ?? $updatedAt,
      } as UserEntity;
    } catch (error: any) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  async updateUser(id: string, updates: Partial<UserEntity>): Promise<UserEntity | null> {
    return this.update(id, updates);
  }

  async emailExists(email: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('email', email),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0;
    } catch {
      return false;
    }
  }

  async updateUserName(id: string, name: string): Promise<UserEntity | null> {
    return this.update(id, { name } as Partial<UserEntity>);
  }

  async getUsersByRole(role: 'freelancer' | 'employer' | 'admin'): Promise<UserEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('role', role),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as UserEntity;
      });
    } catch (error: any) {
      throw new Error(`Failed to get users by role: ${error.message}`);
    }
  }

  async getAllUsers(): Promise<UserEntity[]> {
    return this.queryAll();
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

export const userRepository = new UserRepository();
