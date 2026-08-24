import { GENESIS_HASH, hashAuditEntry, type HashableAuditEntry } from "./hash-chain";

/** The minimum surface needed from a database connection to seal an entry. */
export type ChainConnection = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export type SealedEntry = {
  prevHash: string;
  rowHash: string;
};

/**
 * Serialises appends for one tenant's chain and returns the link fields for the
 * row about to be inserted.
 *
 * The lock matters: two concurrent appends would otherwise read the same head,
 * compute the same prev_hash and fork the chain into two branches. It is an
 * xact lock, so it releases on commit or rollback with nothing to clean up.
 *
 * MUST be called inside the same transaction as the insert that follows it.
 * Outside one, the lock is taken and released immediately and buys nothing.
 */
export async function sealAuditEntry(
  connection: ChainConnection,
  tableName: string,
  entry: HashableAuditEntry,
): Promise<SealedEntry> {
  await connection.execute("select pg_advisory_xact_lock(hashtext(?)::bigint)", [
    `${tableName}:${entry.tenantId}`,
  ]);

  const head = (await connection.execute(
    `select row_hash from "${tableName}" where tenant_id = ? order by seq desc limit 1`,
    [entry.tenantId],
  )) as Array<{ row_hash: string | null }>;

  const prevHash = head[0]?.row_hash ?? GENESIS_HASH;
  return { prevHash, rowHash: hashAuditEntry(entry, prevHash) };
}
