export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  roles: string[];
  tenantId: string;
};

export interface UserRepository {
  findByUsername(username: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  save(user: StoredUser): Promise<void>;
  updateRoles(userId: string, roles: string[]): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
