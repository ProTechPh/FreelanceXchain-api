import { BaseRepository } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { User } from '../models/user.js';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(COLLECTIONS.USERS);
  }

  async createUser(user: User): Promise<User> {
    return this.create(user, user.id);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.getById(id, id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email.toLowerCase() }],
    };
    return this.findOne(querySpec);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    return this.update(id, id, updates);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.delete(id, id);
  }

  async emailExists(email: string): Promise<boolean> {
    const user = await this.getUserByEmail(email);
    return user !== null;
  }
}

export const userRepository = new UserRepository();
