export type StoredShareLink = {
  id: string;
  tenantId: string;
  vehicleId: string;
  /** The job the link follows. It expires when that job ends. */
  jobId: string | null;
  tokenHash: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
  /** Set while the tenant's suspension holds the link. A held link reads as expired. */
  heldAt?: Date | null;
};

export interface ShareLinkRepository {
  save(link: StoredShareLink): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredShareLink | null>;
  findActiveForVehicle(tenantId: string, vehicleId: string): Promise<StoredShareLink | null>;
  revokeForJob(tenantId: string, jobId: string, at: Date): Promise<number>;
  /** Links whose window has closed, across every tenant, for the reaper. */
  findExpired(now: Date, limit: number): Promise<StoredShareLink[]>;
  recordView(id: string, at: Date): Promise<void>;
  deleteById(id: string): Promise<void>;
}

export const SHARE_LINK_REPOSITORY = Symbol("SHARE_LINK_REPOSITORY");
