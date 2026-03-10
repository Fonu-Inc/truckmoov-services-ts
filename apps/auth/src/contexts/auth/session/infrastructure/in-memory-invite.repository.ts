import { Injectable } from "@nestjs/common";
import type { InviteRepository, StoredInvite } from "../domain/ports/invite-repository.port";

@Injectable()
export class InMemoryInviteRepository implements InviteRepository {
  private readonly store = new Map<string, StoredInvite>();

  async save(invite: StoredInvite): Promise<void> {
    this.store.set(invite.token, invite);
  }

  async findByToken(token: string): Promise<StoredInvite | null> {
    return this.store.get(token) ?? null;
  }

  async findByEmail(email: string): Promise<StoredInvite | null> {
    for (const invite of this.store.values()) {
      if (invite.email === email && invite.status === "pending") return invite;
    }
    return null;
  }

  async markAccepted(token: string): Promise<void> {
    const invite = this.store.get(token);
    if (invite) this.store.set(token, { ...invite, status: "accepted" });
  }
}
