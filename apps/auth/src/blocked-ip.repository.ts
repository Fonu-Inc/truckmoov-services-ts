export const BLOCK_TYPES = ['temporary', 'permanent'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Who or what caused the block. A manual block and an automatic one are different things. */
export const SYSTEM_BLOCK_ACTOR = 'system:auto-block';

export type StoredBlockedIp = {
  id: string;
  ipAddress: string;
  reason: string;
  blockType: BlockType;
  blockedAt: Date;
  /** Null for a permanent block. */
  expiresAt: Date | null;
  /** A staff user id, or SYSTEM_BLOCK_ACTOR for an auto-block rule. */
  blockedBy: string;
  /**
   * Set the moment someone unblocks it, whether by hand or by the expiry
   * sweep. A timestamp rather than a boolean, so a manual unblock ahead of a
   * temporary block's natural expiry is distinguishable from the expiry
   * itself if that ever matters.
   */
  unblockedAt: Date | null;
  unblockedBy: string | null;
};

export type BlockedIpFilters = {
  /** Only currently active blocks. */
  activeOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type BlockedIpPage = {
  items: StoredBlockedIp[];
  total: number;
};

export interface BlockedIpRepository {
  save(block: StoredBlockedIp): Promise<void>;
  findById(id: string): Promise<StoredBlockedIp | null>;
  /** The active block for an address, if any. At most one may be active at a time. */
  findActiveByIp(ipAddress: string): Promise<StoredBlockedIp | null>;
  search(filters: BlockedIpFilters): Promise<BlockedIpPage>;
  countActive(): Promise<number>;
  /** Active temporary blocks whose window has passed, for the expiry sweep. */
  findExpiring(before: Date, limit: number): Promise<StoredBlockedIp[]>;
}

export const BLOCKED_IP_REPOSITORY = Symbol('BLOCKED_IP_REPOSITORY');

export function isBlockType(value: string): value is BlockType {
  return BLOCK_TYPES.includes(value as BlockType);
}
