import { Injectable } from "@nestjs/common";
import type { StoredUser, UserRepository } from "../domain/ports/user-repository.port";

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, StoredUser>();

  async findByUsername(username: string): Promise<StoredUser | null> {
    return this.store.get(username) ?? null;
  }

  async save(user: StoredUser): Promise<void> {
    this.store.set(user.username, user);
  }
}
