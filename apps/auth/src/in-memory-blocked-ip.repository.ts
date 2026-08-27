import { Injectable } from '@nestjs/common';
import type { BlockedIpFilters, BlockedIpPage, BlockedIpRepository, StoredBlockedIp } from './blocked-ip.repository';

@Injectable()
export class InMemoryBlockedIpRepository implements BlockedIpRepository {
  private readonly store = new Map<string, StoredBlockedIp>();

  async save(block: StoredBlockedIp): Promise<void> {
    this.store.set(block.id, block);
  }

  async findById(id: string): Promise<StoredBlockedIp | null> {
    return this.store.get(id) ?? null;
  }

  async findActiveByIp(ipAddress: string): Promise<StoredBlockedIp | null> {
    const now = new Date();
    for (const b of this.store.values()) {
      if (b.ipAddress !== ipAddress) continue;
      if (b.unblockedAt) continue;
      if (b.expiresAt && b.expiresAt <= now) continue;
      return b;
    }
    return null;
  }

  async search(filters: BlockedIpFilters): Promise<BlockedIpPage> {
    const now = new Date();
    let results = [...this.store.values()];
    if (filters.activeOnly) {
      results = results.filter((b) => !b.unblockedAt && (!b.expiresAt || b.expiresAt > now));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      results = results.filter((b) => b.ipAddress.toLowerCase().includes(q) || b.reason.toLowerCase().includes(q));
    }
    results = results.sort((a, b) => b.blockedAt.getTime() - a.blockedAt.getTime());
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? results.length;
    return { items: results.slice(offset, offset + limit), total: results.length };
  }

  async countActive(): Promise<number> {
    const now = new Date();
    return [...this.store.values()].filter((b) => !b.unblockedAt && (!b.expiresAt || b.expiresAt > now)).length;
  }

  async findExpiring(before: Date, limit: number): Promise<StoredBlockedIp[]> {
    return [...this.store.values()]
      .filter((b) => !b.unblockedAt && b.expiresAt && b.expiresAt <= before)
      .slice(0, limit);
  }
}
