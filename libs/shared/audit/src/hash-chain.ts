import { createHash } from "node:crypto";

/** The prev_hash of the first entry in a chain. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * One audit entry, reduced to the fields the hash covers. Anything not listed
 * here can be changed without breaking the chain, so the caller decides what is
 * worth protecting rather than the hashing code guessing.
 */
export type HashableAuditEntry = {
  id: string;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorRole: string | null;
  summary: string | null;
  metadata: unknown;
  occurredAt: string;
};

/**
 * Serialises a value with object keys in sorted order. JSON.stringify follows
 * insertion order, so the same metadata built two different ways would produce
 * two different strings and two different hashes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

/**
 * Length-prefixes every field before joining them. Without the prefix, the
 * fields ("ab", "c") and ("a", "bc") serialise to the same bytes, and two
 * different entries would share a hash.
 */
function canonicalBody(entry: HashableAuditEntry): string {
  const fields = [
    entry.id,
    entry.tenantId,
    entry.action,
    entry.entityType,
    entry.entityId,
    entry.actorId ?? "",
    entry.actorRole ?? "",
    entry.summary ?? "",
    canonicalJson(entry.metadata ?? {}),
    new Date(entry.occurredAt).toISOString(),
  ];
  return fields.map((field) => `${field.length}:${field}`).join("|");
}

/**
 * Chains the entry to its predecessor. prev_hash is part of the input, so
 * editing any earlier entry invalidates every hash that follows it.
 */
export function hashAuditEntry(entry: HashableAuditEntry, prevHash: string): string {
  return createHash("sha256")
    .update(`${prevHash}|${canonicalBody(entry)}`)
    .digest("hex");
}

export type ChainLink = HashableAuditEntry & {
  seq: number;
  prevHash: string;
  rowHash: string;
};

export type ChainBreak = {
  seq: number;
  id: string;
  reason: "hash_mismatch" | "broken_link";
};

/**
 * Walks a tenant's chain in seq order and reports the first entry that does not
 * verify. Returns null when the chain holds.
 */
export function findChainBreak(links: readonly ChainLink[]): ChainBreak | null {
  let expectedPrev = GENESIS_HASH;

  for (const link of links) {
    if (link.prevHash !== expectedPrev) {
      return { seq: link.seq, id: link.id, reason: "broken_link" };
    }
    if (hashAuditEntry(link, link.prevHash) !== link.rowHash) {
      return { seq: link.seq, id: link.id, reason: "hash_mismatch" };
    }
    expectedPrev = link.rowHash;
  }

  return null;
}
