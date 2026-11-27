import type { StoredInstaller } from '@auth/installation/domain/installer.repository';

/** shortcut: per-process, so another pod sees a change within the ttl; the pod that saves drops it at once. */
export class InstallerLookupCache {
  private readonly entries = new Map<string, { installer: StoredInstaller; expiresAt: number }>();
  private generation = 0;

  constructor(
    private readonly ttlMs = 20_000,
    private readonly maxSize = 500,
  ) {}

  async get(userId: string, load: () => Promise<StoredInstaller | null>): Promise<StoredInstaller | null> {
    const hit = this.entries.get(userId);
    if (hit && hit.expiresAt > Date.now()) return { ...hit.installer };
    const startedAt = this.generation;
    const installer = await load();
    // A save during the read means what was read may already be stale.
    if (installer && startedAt === this.generation) {
      if (this.entries.size >= this.maxSize) this.entries.delete(this.entries.keys().next().value as string);
      this.entries.set(userId, { installer, expiresAt: Date.now() + this.ttlMs });
    }
    return installer;
  }

  forget(installer: Pick<StoredInstaller, 'id' | 'userId'>): void {
    this.generation += 1;
    for (const [userId, entry] of this.entries) {
      if (userId === installer.userId || entry.installer.id === installer.id) this.entries.delete(userId);
    }
  }
}
