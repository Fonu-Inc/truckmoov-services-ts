import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { MikroSimRepository } from "../../apps/auth/src/mikro-sim.repository";
import { MikroTenantSuspensionRepository } from "../../apps/auth/src/mikro-tenant-suspension.repository";
import { MikroTenantAssetStore, tenantLockId } from "../../apps/auth/src/tenant-asset-store";
import { SYSTEM_ENFORCEMENT_ACTOR, TenantSuspensionService } from "../../apps/auth/src/tenant-suspension.service";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

type Row = Record<string, unknown>;

describe.skipIf(!dbEnabled)("tenant cascade flags on real postgres", () => {
  let orm: MikroORM;
  const tenants: string[] = [];
  const config = { db: dbEnabled ? getConfig() : (undefined as never), persistence: { backend: "mikro-orm" } } as never;
  const store = new MikroTenantAssetStore(config);
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const tenant = () => {
    const id = uniqueId("casc");
    tenants.push(id);
    return id;
  };

  const addUser = (tenantId: string, status = "enabled", cause: string | null = null) => {
    const id = randomUUID();
    return query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status, suspension_cause)
       values (?, ?, 'x', 1, ?, ?, ?)`,
      [id, `${id}@t.test`, tenantId, status, cause],
    ).then(() => id);
  };

  const addSim = (tenantId: string, status: string, extra: { cause?: string; deviceId?: string | null } = {}) => {
    const id = randomUUID();
    return query(
      `insert into iot_sims (id, iccid, carrier, status, tenant_id, suspension_cause, device_id)
       values (?, ?, 'MTN', ?, ?, ?, ?)`,
      [id, id.replace(/-/g, "").slice(0, 30), status, tenantId, extra.cause ?? null, extra.deviceId ?? null],
    ).then(() => id);
  };

  const userRow = async (id: string) => (await query(`select account_status, suspension_cause from auth_users where id = ?`, [id]))[0];
  const simRow = async (id: string) =>
    (await query(`select status, suspension_cause, pre_suspension_status, suspension_reason from iot_sims where id = ?`, [id]))[0];

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    for (const id of tenants) {
      await query(`delete from auth_users where tenant_id = ?`, [id]);
      await query(`delete from iot_sims where tenant_id = ?`, [id]);
      await query(`delete from tenant_suspensions where tenant_id = ?`, [id]);
      await query(`delete from enforcement_waivers where tenant_id = ?`, [id]);
    }
  });

  it("the migration added the cause columns", async () => {
    const columns = await query(
      `select table_name, column_name from information_schema.columns
       where (table_name = 'auth_users' and column_name = 'suspension_cause')
          or (table_name = 'iot_sims' and column_name in ('suspension_cause','pre_suspension_status'))
          or (table_name = 'tenant_suspensions' and column_name in ('cause','unpaid_since','grace_days','cascade_status','cascade_progress','cascade_attempts','cascade_last_error','cascade_completed_at'))`,
    );
    expect(columns).toHaveLength(11);
  });

  it("holds only enabled, unheld users and releases only the named causes", async () => {
    const t = tenant();
    const live = await addUser(t);
    const staffOff = await addUser(t, "disabled");
    const other = await addUser(tenant());

    const held = await store.holdUsers(t, "non_payment");

    expect(held).toEqual([live]);
    expect(await userRow(live)).toMatchObject({ account_status: "disabled", suspension_cause: "non_payment" });
    expect(await userRow(staffOff)).toMatchObject({ account_status: "disabled", suspension_cause: null });
    expect((await userRow(other)).account_status).toBe("enabled");
    expect(await store.holdUsers(t, "non_payment")).toEqual([]);

    expect(await store.releaseUsers(t, ["tenant_manual"])).toEqual([]);
    expect(await store.releaseUsers(t, ["non_payment"])).toEqual([live]);
    expect(await userRow(live)).toMatchObject({ account_status: "enabled", suspension_cause: null });
    expect((await userRow(staffOff)).account_status).toBe("disabled");
  });

  it("retags payment holds as staff holds and a staff release frees both", async () => {
    const t = tenant();
    const a = await addUser(t);
    await store.holdUsers(t, "non_payment");
    const b = await addUser(t);
    await store.holdUsers(t, "tenant_manual");

    expect(await store.retagUsers(t, "non_payment", "tenant_manual")).toBe(1);
    expect(await store.releaseUsers(t, ["non_payment"])).toEqual([]);
    expect((await store.releaseUsers(t, ["non_payment", "tenant_manual"])).sort()).toEqual([a, b].sort());
  });

  it("holds SIMs that are on, remembers their status, and leaves staff-suspended and deactivated SIMs alone", async () => {
    const t = tenant();
    const assigned = await addSim(t, "assigned", { deviceId: "d1" });
    const active = await addSim(t, "active");
    const mine = await addSim(t, "suspended", { cause: "asset_manual" });
    const gone = await addSim(t, "deactivated");

    const held = await store.holdSims(t, "non_payment", "Unpaid since 2026-10-01, grace of 3 days ended");

    expect(held.sort()).toEqual([assigned, active].sort());
    expect(await simRow(assigned)).toMatchObject({
      status: "suspended", suspension_cause: "non_payment", pre_suspension_status: "assigned",
      suspension_reason: "Unpaid since 2026-10-01, grace of 3 days ended",
    });
    expect(await simRow(mine)).toMatchObject({ status: "suspended", suspension_cause: "asset_manual" });
    expect((await simRow(gone)).status).toBe("deactivated");
    expect(await store.holdSims(t, "non_payment", "again")).toEqual([]);

    const released = await store.releaseSims(t, ["non_payment"]);
    expect(released.sort()).toEqual([assigned, active].sort());
    expect(await simRow(assigned)).toMatchObject({ status: "assigned", suspension_cause: null, pre_suspension_status: null, suspension_reason: null });
    expect((await simRow(active)).status).toBe("active");
    expect(await simRow(mine)).toMatchObject({ status: "suspended", suspension_cause: "asset_manual" });
  });

  it("counts what a suspension would hold, per tenant", async () => {
    const a = tenant();
    const b = tenant();
    await addUser(a);
    await addUser(a);
    await addUser(a, "disabled");
    await addSim(a, "active");
    await addSim(a, "suspended");

    const counts = await store.countHoldable([a, b]);

    expect(counts.get(a)).toEqual({ users: 2, sims: 1 });
    expect(counts.get(b)).toEqual({ users: 0, sims: 0 });
  });

  it("one caller at a time per tenant, different tenants in parallel", async () => {
    const a = tenant();
    const b = tenant();
    let releaseFirst!: () => void;
    const first = store.withLock(a, () => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    await vi.waitFor(() => expect(releaseFirst).toBeDefined());

    expect(await store.withLock(a, async () => "x")).toEqual({ acquired: false });
    expect(await store.withLock(b, async () => "y")).toEqual({ acquired: true, value: "y" });
    releaseFirst();
    await first;
    expect(await store.withLock(a, async () => "z")).toEqual({ acquired: true, value: "z" });
    expect(tenantLockId(a)).not.toBe(tenantLockId(b));
  });

  it("writes a debt waiver once", async () => {
    const t = tenant();
    await store.addWaiver(t, "2026-10-01", "sys1", "Staff reinstated");
    await store.addWaiver(t, "2026-10-01", "sys1", "Staff reinstated");

    expect(await query(`select * from enforcement_waivers where tenant_id = ?`, [t])).toHaveLength(1);
  });

  it("runs the whole cascade against the real tables and restores only what it took", async () => {
    const t = tenant();
    const user = await addUser(t);
    const off = await addUser(t, "disabled");
    const sim = await addSim(t, "assigned", { deviceId: "dev-1" });
    const mine = await addSim(t, "suspended", { cause: "asset_manual" });
    const published: string[] = [];
    const service = new TenantSuspensionService(
      config,
      new MikroTenantSuspensionRepository(config),
      {} as never,
      new MikroSimRepository(config),
      { deleteAllForUser: async () => {} } as never,
      { changed: () => {} } as never,
      {
        suspendTenantAssets: async () => ({ ok: true, devices: 1, vehicles: 1, shareLinks: 0 }),
        reinstateTenantAssets: async () => ({ ok: true, devices: 1, vehicles: 1, shareLinks: 0 }),
      } as never,
      { publish: async (subject: string) => { published.push(subject.split(".").slice(2).join(".")); } } as never,
      { publish: async () => {} },
      store,
    );

    const suspended = await service.suspend(t, {
      cause: "non_payment", reason: "Unpaid since 2026-10-01, grace of 3 days ended", actor: SYSTEM_ENFORCEMENT_ACTOR,
      unpaidSince: "2026-10-01", graceDays: 3,
    });

    expect(suspended).toMatchObject({ status: "complete", counts: { users: 1, sims: 1, devices: 1, vehicles: 1, shareLinks: 0 } });
    expect((await userRow(user)).account_status).toBe("disabled");
    expect((await simRow(sim)).status).toBe("suspended");
    const row = (await query(`select cause, cascade_status, unpaid_since::text as unpaid_since, grace_days from tenant_suspensions where tenant_id = ?`, [t]))[0];
    expect(row).toMatchObject({ cause: "non_payment", cascade_status: "complete", unpaid_since: "2026-10-01", grace_days: 3 });

    const restored = await service.restore(t, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR });

    expect(restored.restored).toBe(true);
    expect((await userRow(user)).account_status).toBe("enabled");
    expect((await userRow(off)).account_status).toBe("disabled");
    expect((await simRow(sim)).status).toBe("assigned");
    expect(await simRow(mine)).toMatchObject({ status: "suspended", suspension_cause: "asset_manual" });
    expect(await query(`select 1 from tenant_suspensions where tenant_id = ?`, [t])).toHaveLength(0);
    expect(published).toEqual(["tenant.suspended", "tenant.assets.suspended", "tenant.reinstated", "tenant.assets.restored"]);
  });

  it("a staff takeover on real tables wins over payment, and only staff can lift it", async () => {
    const t = tenant();
    const user = await addUser(t);
    const sim = await addSim(t, "active");
    const service = new TenantSuspensionService(
      config,
      new MikroTenantSuspensionRepository(config),
      {} as never,
      new MikroSimRepository(config),
      { deleteAllForUser: async () => {} } as never,
      { changed: () => {} } as never,
      {
        suspendTenantAssets: async () => ({ ok: true, devices: 0, vehicles: 0, shareLinks: 0 }),
        reinstateTenantAssets: async () => ({ ok: true, devices: 0, vehicles: 0, shareLinks: 0 }),
      } as never,
      { publish: async () => {} } as never,
      { publish: async () => {} },
      store,
    );
    const staff = { id: "sys1", name: "Ada", role: "SYSTEM_ADMIN" };
    await service.suspend(t, { cause: "non_payment", reason: "Unpaid", actor: SYSTEM_ENFORCEMENT_ACTOR, unpaidSince: "2026-10-01", graceDays: 3 });
    await service.suspend(t, { cause: "manual", reason: "Fraud review", actor: staff });

    expect((await userRow(user)).suspension_cause).toBe("tenant_manual");
    expect((await simRow(sim)).suspension_cause).toBe("tenant_manual");
    expect(await service.restore(t, { cause: "non_payment", actor: SYSTEM_ENFORCEMENT_ACTOR })).toMatchObject({ skipped: "manual_hold" });
    expect((await userRow(user)).account_status).toBe("disabled");

    await service.restore(t, { cause: "manual", actor: staff });

    expect((await userRow(user)).account_status).toBe("enabled");
    expect((await simRow(sim)).status).toBe("active");
    expect(await query(`select unpaid_since::text as unpaid_since from enforcement_waivers where tenant_id = ?`, [t])).toEqual([{ unpaid_since: "2026-10-01" }]);
  });
});
