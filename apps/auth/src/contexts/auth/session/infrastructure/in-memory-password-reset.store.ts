import { Injectable } from "@nestjs/common";
import type { PasswordResetStore, StoredPasswordReset } from "../domain/ports/password-reset-store.port";

@Injectable()
export class InMemoryPasswordResetStore implements PasswordResetStore {
  private readonly store = new Map<string, StoredPasswordReset>();

  async save(reset: StoredPasswordReset): Promise<void> {
    this.store.set(reset.token, reset);
  }

  async findByToken(token: string): Promise<StoredPasswordReset | null> {
    const r = this.store.get(token);
    return r && !r.used ? r : null;
  }

  async findByUserIdAndCode(userId: string, code: string): Promise<StoredPasswordReset | null> {
    for (const r of this.store.values()) {
      if (r.userId === userId && r.code === code && !r.used) return r;
    }
    return null;
  }

  async markUsed(token: string): Promise<void> {
    const r = this.store.get(token);
    if (r) this.store.set(token, { ...r, used: true });
  }
}
