import { BaseRepository } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type UserEntity = {
  id: string;
  email: string;
  password_hash: string;
  role: 'freelancer' | 'employer' | 'admin';
  wallet_address: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export class UserRepository extends BaseRepository<UserEntity> {
  constructor() {
    super(TABLES.USERS);
  }

  async createUser(user: Omit<UserEntity, 'created_at' | 'updated_at'>): Promise<UserEntity> {
    return this.create(user);
  }

  async getUserById(id: string): Promise<UserEntity | null> {
    return this.getById(id);
  }

  async getUserByEmail(email: string): Promise<UserEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .ilike('email', email.toLowerCase())
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
    return data as UserEntity;
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
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*');
    
    if (error) throw new Error(`Failed to get all users: ${error.message}`);
    return (data ?? []) as UserEntity[];
  }

  async updateUserName(id: string, name: string): Promise<UserEntity | null> {
    return this.update(id, { name });
  }
}

export const userRepository = new UserRepository();
