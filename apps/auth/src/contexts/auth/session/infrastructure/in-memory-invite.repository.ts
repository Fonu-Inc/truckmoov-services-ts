import { Injectable } from '@nestjs/common';
import type {
  InviteRepository,
  StoredInvite,
} from '../domain/ports/invite-repository.port';

@Injectable()
export class InMemoryInviteRepository implements InviteRepository {
  private readonly store = new Map<string, StoredInvite>();

  async save(invite: StoredInvite): Promise<void> {
    // Resends rotate the token while preserving the invite id. Remove any previous token entry first.
    for (const [token, existing] of this.store.entries()) {
      if (existing.id === invite.id && token !== invite.token) {
        this.store.delete(token);
      }
    }
    this.store.set(invite.token, invite);
  }

  async findById(id: string): Promise<StoredInvite | null> {
    for (const invite of this.store.values()) {
      if (invite.id === id) {
        return invite;
      }
    }
    return null;
  }

  async findByToken(token: string): Promise<StoredInvite | null> {
    return this.store.get(token) ?? null;
  }

  async findByEmail(email: string): Promise<StoredInvite | null> {
    for (const invite of this.store.values()) {
      if (invite.email === email && invite.status === 'pending') return invite;
    }
    return null;
  }

  async findPendingByEmailForTenant(
    tenantId: string,
    email: string,
  ): Promise<StoredInvite | null> {
    const pending = [...this.store.values()]
      .filter(
        (invite) =>
          invite.tenantId === tenantId &&
          invite.email === email &&
          invite.status === 'pending',
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );

    return pending[0] ?? null;
  }

  async listPendingByTenant(tenantId: string): Promise<StoredInvite[]> {
    return [...this.store.values()]
      .filter(
        (invite) => invite.tenantId === tenantId && invite.status === 'pending',
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
  }

  async markAccepted(token: string): Promise<void> {
    const invite = this.store.get(token);
    if (invite) this.store.set(token, { ...invite, status: 'accepted' });
  }

  async deleteById(id: string): Promise<void> {
    for (const [token, invite] of this.store.entries()) {
      if (invite.id === id) {
        this.store.delete(token);
      }
    }
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    for (const [token, invite] of this.store.entries()) {
      if (invite.tenantId === tenantId) {
        this.store.delete(token);
      }
    }
  }
}
