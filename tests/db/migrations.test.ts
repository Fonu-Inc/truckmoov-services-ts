import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { dbEnabled, getOrm } from "./helper";

type Row = Record<string, unknown>;

describe.skipIf(!dbEnabled)("migrations on real postgres", () => {
  let orm: MikroORM;

  const query = (sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const column = async (table: string, name: string) =>
    (
      await query(
        `select data_type, is_nullable, character_maximum_length from information_schema.columns
         where table_schema = 'public' and table_name = ? and column_name = ?`,
        [table, name],
      )
    )[0];

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    await orm?.close();
  });

  it("applies every migration file", async () => {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync("apps/auth/src/migrations").filter((f) => /^Migration.*\.ts$/.test(f));
    const [{ n }] = await query(`select count(*)::int as n from mikro_migrations_auth`);
    expect(n).toBe(files.length);
  });

  it("wallet_ledger_entries has idempotency_key with unique partial index", async () => {
    expect(await column("wallet_ledger_entries", "idempotency_key")).toMatchObject({
      data_type: "character varying",
      is_nullable: "YES",
      character_maximum_length: 160,
    });
    const [index] = await query(
      `select indexdef from pg_indexes where tablename = 'wallet_ledger_entries'
       and indexname = 'wallet_ledger_entries_idempotency_unique'`,
    );
    const def = String(index?.indexdef);
    expect(def).toContain("UNIQUE");
    expect(def).toContain("(tenant_id, idempotency_key)");
    expect(def).toContain("idempotency_key IS NOT NULL");
  });

  it("onboarding_payments has bigint amount_kobo and authorization_url", async () => {
    expect(await column("onboarding_payments", "amount_kobo")).toMatchObject({ data_type: "bigint" });
    expect(await column("onboarding_payments", "authorization_url")).toMatchObject({
      data_type: "text",
      is_nullable: "YES",
    });
  });

  it("bundle_allocations has payment_reference and its index", async () => {
    expect(await column("bundle_allocations", "payment_reference")).toMatchObject({
      data_type: "character varying",
      is_nullable: "YES",
    });
    const rows = await query(
      `select 1 from pg_indexes where tablename = 'bundle_allocations'
       and indexname = 'bundle_allocations_tenant_payment_reference_idx'`,
    );
    expect(rows).toHaveLength(1);
  });

  it.each(["tenant_wallets", "wallet_top_ups", "iot_sims"])("table %s exists", async (table) => {
    const rows = await query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = ?`, [
      table,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("running the chain again is a no-op", async () => {
    const before = await query(`select name from mikro_migrations_auth order by id`);
    const executed = await orm.getMigrator().up();
    const after = await query(`select name from mikro_migrations_auth order by id`);
    expect(executed).toHaveLength(0);
    expect(after).toEqual(before);
  });
});
