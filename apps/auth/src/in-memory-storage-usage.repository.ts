import { Injectable } from '@nestjs/common';
import type {
  StorageSource,
  StorageUsage,
  StorageUsageRepository,
} from './storage-usage.repository';

@Injectable()
export class InMemoryStorageUsageRepository implements StorageUsageRepository {
  private readonly usage = new Map<string, number>();

  private key(tenantId: string, source: StorageSource) {
    return `${tenantId}::${source}`;
  }

  async addBytes(tenantId: string, source: StorageSource, deltaBytes: number): Promise<void> {
    const key = this.key(tenantId, source);
    this.usage.set(key, Math.max(0, (this.usage.get(key) ?? 0) + deltaBytes));
  }

  async setBytes(tenantId: string, source: StorageSource, bytesUsed: number): Promise<void> {
    this.usage.set(this.key(tenantId, source), Math.max(0, bytesUsed));
  }

  async totalBytes(tenantId: string): Promise<number> {
    return this.breakdown(tenantId).then((rows) =>
      rows.reduce((total, row) => total + row.bytesUsed, 0),
    );
  }

  async breakdown(tenantId: string): Promise<StorageUsage[]> {
    const prefix = `${tenantId}::`;
    return [...this.usage.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, bytesUsed]) => ({
        tenantId,
        source: key.slice(prefix.length) as StorageSource,
        bytesUsed,
      }));
  }
}
