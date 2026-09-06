import { Injectable } from "@nestjs/common";
import type { ShareLinkRepository, StoredShareLink } from "../domain/share-link.repository";

@Injectable()
export class InMemoryShareLinkRepository implements ShareLinkRepository {
  private readonly store = new Map<string, StoredShareLink>();

  async save(link: StoredShareLink): Promise<void> {
    this.store.set(link.id, { ...link });
  }

  async findByTokenHash(tokenHash: string): Promise<StoredShareLink | null> {
    return [...this.store.values()].find((link) => link.tokenHash === tokenHash) ?? null;
  }

  async findActiveForVehicle(tenantId: string, vehicleId: string): Promise<StoredShareLink | null> {
    const now = Date.now();
    return (
      [...this.store.values()]
        .filter(
          (link) =>
            link.tenantId === tenantId
            && link.vehicleId === vehicleId
            && link.revokedAt === null
            && link.expiresAt.getTime() > now,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async revokeForJob(jobId: string, at: Date): Promise<number> {
    let revoked = 0;
    for (const link of this.store.values()) {
      if (link.jobId !== jobId || link.revokedAt !== null) continue;
      link.revokedAt = at;
      revoked += 1;
    }
    return revoked;
  }

  async findExpired(now: Date, limit: number): Promise<StoredShareLink[]> {
    return [...this.store.values()]
      .filter((link) => link.expiresAt <= now)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, limit);
  }

  async recordView(id: string, at: Date): Promise<void> {
    const link = this.store.get(id);
    if (!link) return;
    link.lastViewedAt = at;
    link.viewCount += 1;
  }

  async deleteById(id: string): Promise<void> {
    this.store.delete(id);
  }
}
