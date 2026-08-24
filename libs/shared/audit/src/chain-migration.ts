import { GENESIS_HASH, hashAuditEntry, type HashableAuditEntry } from "./hash-chain";

// Structural, so a MikroORM Migration satisfies it without importing the ORM
// into a shared library. Rows come back loosely typed and are narrowed by the
// toHashable callback the caller supplies.
type Executor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

/**
 * SQL that adds the chain columns and a seq ordered by an existing timestamp.
 *
 * seq is populated by row_number rather than by adding a bigserial directly:
 * a bigserial fills existing rows in heap order, which is not the order the
 * events happened in, and the chain would then be built out of sequence.
 */
export function addChainColumnsSql(tableName: string, orderColumn: string): string[] {
  return [
    `alter table "${tableName}" add column if not exists "seq" bigint;`,
    `alter table "${tableName}" add column if not exists "prev_hash" char(64);`,
    `alter table "${tableName}" add column if not exists "row_hash" char(64);`,
    `with ordered as (
       select "id", row_number() over (order by "${orderColumn}", "id") as position
         from "${tableName}"
     )
     update "${tableName}" as target
        set "seq" = ordered.position
       from ordered
      where target."id" = ordered."id" and target."seq" is null;`,
    `create sequence if not exists "${tableName}_seq_seq" owned by "${tableName}"."seq";`,
    `select setval('${tableName}_seq_seq', coalesce((select max("seq") from "${tableName}"), 0) + 1, false);`,
    `alter table "${tableName}" alter column "seq" set default nextval('${tableName}_seq_seq');`,
    `alter table "${tableName}" alter column "seq" set not null;`,
  ];
}

/**
 * SQL that seals the table once every row is hashed. The unique index is the
 * backstop for a forked chain: each row_hash is the prev_hash of exactly one
 * successor, so a second row claiming the same predecessor cannot be inserted
 * even if a caller forgets the advisory lock.
 */
export function sealChainSql(tableName: string): string[] {
  return [
    `alter table "${tableName}" alter column "prev_hash" set not null;`,
    `alter table "${tableName}" alter column "row_hash" set not null;`,
    `create unique index if not exists "${tableName}_chain_unique" on "${tableName}" ("tenant_id", "prev_hash");`,
    `create unique index if not exists "${tableName}_seq_unique" on "${tableName}" ("seq");`,
    // A grant cannot protect these rows: migrations run as the connecting user,
    // so that user owns the table, and an owner's privileges do not come from
    // the PUBLIC grant that "revoke update, delete" removes. A trigger applies
    // to the owner too.
    `create or replace function truckmoov_audit_append_only() returns trigger as $$
     begin
       raise exception 'audit log is append-only: % on % is not permitted', tg_op, tg_table_name
         using errcode = 'restrict_violation';
       return null;
     end;
     $$ language plpgsql;`,
    `drop trigger if exists "${tableName}_append_only" on "${tableName}";`,
    `create trigger "${tableName}_append_only"
       before update or delete on "${tableName}"
       for each row execute function truckmoov_audit_append_only();`,
  ];
}

export function dropChainSql(tableName: string): string[] {
  return [
    `drop trigger if exists "${tableName}_append_only" on "${tableName}";`,
    `drop index if exists "${tableName}_chain_unique";`,
    `drop index if exists "${tableName}_seq_unique";`,
    `alter table "${tableName}" drop column if exists "row_hash";`,
    `alter table "${tableName}" drop column if exists "prev_hash";`,
    `alter table "${tableName}" drop column if exists "seq";`,
  ];
}

/**
 * Chains every existing row, one independent chain per tenant, in seq order.
 *
 * These hashes are computed from the rows as they stand now. They establish a
 * baseline from this point on; they say nothing about whether a row was altered
 * before the migration ran.
 *
 * Runs before the append-only trigger exists, which is the only window in which
 * these rows can be written.
 */
export async function backfillChain(
  executor: Executor,
  tableName: string,
  toHashable: (row: Record<string, unknown>) => HashableAuditEntry,
): Promise<number> {
  const rows = (await executor.execute(
    `select * from "${tableName}" where "row_hash" is null order by "tenant_id", "seq"`,
  )) as Array<Record<string, unknown>>;

  // Seeded from any rows already sealed, so a partial or repeated backfill
  // continues each tenant's chain instead of starting a second one at genesis.
  const heads = (await executor.execute(
    `select distinct on ("tenant_id") "tenant_id", "row_hash"
       from "${tableName}"
      where "row_hash" is not null
      order by "tenant_id", "seq" desc`,
  )) as Array<{ tenant_id: string; row_hash: string }>;
  const headByTenant = new Map<string, string>(heads.map((head) => [head.tenant_id, head.row_hash]));
  for (const row of rows) {
    const entry = toHashable(row);
    const prevHash = headByTenant.get(entry.tenantId) ?? GENESIS_HASH;
    const rowHash = hashAuditEntry(entry, prevHash);

    await executor.execute(
      `update "${tableName}" set "prev_hash" = ?, "row_hash" = ? where "id" = ?`,
      [prevHash, rowHash, entry.id],
    );
    headByTenant.set(entry.tenantId, rowHash);
  }

  return rows.length;
}
