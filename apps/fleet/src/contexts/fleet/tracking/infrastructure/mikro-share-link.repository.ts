import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { getFleetOrm, ShareLinkRecord } from "../../shared/infrastructure/persistence/fleet-orm";
import type { ShareLinkRepository, StoredShareLink } from "../domain/share-link.repository";

@Injectable()
export class MikroShareLinkRepository implements ShareLinkRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(link: StoredShareLink): Promise<void> {
    const em = await this.em();
    const { heldAt: _heldAt, ...writable } = link;
    await em.upsert(ShareLinkRecord, writable);
  }

  async findByTokenHash(tokenHash: string): Promise<StoredShareLink | null> {
    const em = await this.em();
    const record = await em.findOne(ShareLinkRecord, { tokenHash });
    return record ? toStored(record) : null;
  }

  async findActiveForVehicle(tenantId: string, vehicleId: string): Promise<StoredShareLink | null> {
    const em = await this.em();
    const record = await em.findOne(
      ShareLinkRecord,
      { tenantId, vehicleId, revokedAt: null, expiresAt: { $gt: new Date() } },
      { orderBy: { createdAt: "desc" } },
    );
    return record ? toStored(record) : null;
  }

  async revokeForJob(jobId: string, at: Date): Promise<number> {
    const em = await this.em();
    return em.nativeUpdate(ShareLinkRecord, { jobId, revokedAt: null }, { revokedAt: at });
  }

  async findExpired(now: Date, limit: number): Promise<StoredShareLink[]> {
    const em = await this.em();
    const records = await em.find(
      ShareLinkRecord,
      { expiresAt: { $lte: now } },
      { orderBy: { expiresAt: "asc" }, limit },
    );
    return records.map(toStored);
  }

  async recordView(id: string, at: Date): Promise<void> {
    const em = await this.em();
    await em
      .getConnection()
      .execute(
        `update fleet_tracking_share_links set last_viewed_at = ?, view_count = view_count + 1 where id = ? and held_at is null`,
        [at, id],
      );
  }

  async deleteById(id: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(ShareLinkRecord, { id });
  }

  private async em() {
    const orm = await getFleetOrm(this.config.db);
    return orm.em.fork();
  }
}

function toStored(record: ShareLinkRecord): StoredShareLink {
  return {
    id: record.id,
    tenantId: record.tenantId,
    vehicleId: record.vehicleId,
    jobId: record.jobId ?? null,
    tokenHash: record.tokenHash,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt ?? null,
    lastViewedAt: record.lastViewedAt ?? null,
    viewCount: record.viewCount ?? 0,
    heldAt: record.heldAt ?? null,
  };
}
