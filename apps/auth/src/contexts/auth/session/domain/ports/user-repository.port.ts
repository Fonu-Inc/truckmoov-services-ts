export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  roles: string[];
};

export interface UserRepository {
  findByUsername(username: string): Promise<StoredUser | null>;
  save(user: StoredUser): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
