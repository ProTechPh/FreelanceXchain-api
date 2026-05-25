/**
 * User Repository
 * Migrated to PostgreSQL - uses direct pg pool queries
 */

import { BaseRepositoryPg } from './base-repository-pg.js';

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

export class UserRepository extends BaseRepositoryPg<UserEntity> {
  constructor() {
    super('users');
  }

  async createUser(user: Omit<UserEntity, 'created_at' | 'updated_at'>): Promise<UserEntity> {
    return this.create(user);
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    return this.getById(id);
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE LOWER(email) = LOWER($1) LIMIT 1`;
    
    try {
      const result = await this.executeQuery(query, [email]);
      return result.rows.length > 0 ? (result.rows[0] as UserEntity) : null;
    } catch (error: any) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  async updateUser(id: string, updates: Partial<UserEntity>): Promise<UserEntity | null> {
    return this.update(id, updates);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async emailExists(email: string): Promise<boolean> {
    const user = await this.getUserByEmail(email);
    return user !== null;
  }

  async getAllUsers(): Promise<UserEntity[]> {
    const query = `SELECT * FROM ${this.tableName}`;
    
    try {
      const result = await this.executeQuery(query);
      return result.rows as UserEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  async updateUserName(id: string, name: string): Promise<UserEntity | null> {
    return this.update(id, { name } as Partial<UserEntity>);
  }

  async getUsersByRole(role: 'freelancer' | 'employer' | 'admin'): Promise<UserEntity[]> {
    const query = `SELECT * FROM ${this.tableName} WHERE role = $1`;
    
    try {
      const result = await this.executeQuery(query, [role]);
      return result.rows as UserEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get users by role: ${error.message}`);
    }
  }
}

export const userRepository = new UserRepository();
