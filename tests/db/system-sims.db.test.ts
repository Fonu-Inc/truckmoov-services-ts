import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MikroORM } from "@mikro-orm/postgresql";
import { MikroSimRepository } from "../../apps/auth/src/mikro-sim.repository";
import { newUnassignedSim } from "../../apps/auth/src/system-sim-input";
import { dbEnabled, getConfig, getOrm } from "./helper";

describe.skipIf(!dbEnabled)("system SIM inventory on real postgres", () => {
  let orm: MikroORM;
  const suffix = randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
  const created: string[] = [];
  const repo = () => new MikroSimRepository({ persistence: { backend: "mikro-orm" }, db: getConfig() } as never);

  const iccid = (n: number) => `8923${suffix}${String(n).padStart(4, "0")}`;

  async function add(n: number, overrides: Record<string, unknown> = {}) {
    const sim = { ...newUnassignedSim({ iccid: iccid(n), msisdn: `+23480${suffix}`, carrier: "MTN" }), ...overrides };
    created.push(sim.id);
    await repo().save(sim);
    return sim;
  }

  const cleanup = async () => {
    if (created.length === 0) return;
    await orm.em.getConnection().execute(`delete from iot_sims where id = any(?::text[])`, [`{${created.join(",")}}`]);
    created.length = 0;
  };

  beforeAll(async () => {
    orm = await getOrm();
  });
  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await orm?.close();
  });

  it("findAll returns camelCase fields, not raw columns", async () => {
    await add(1, { tenantId: `t-${suffix}`, status: "assigned" });

    const { items } = await repo().findAll({ search: iccid(1) });

    expect(items).toHaveLength(1);
    expect(items[0].tenantId).toBe(`t-${suffix}`);
    expect(items[0].createdAt).toBeInstanceOf(Date);
    expect(typeof items[0].dataLimitMb).toBe("number");
  });

  it("status unassigned means no tenant, whatever the stored status", async () => {
    await add(1, { status: "registered" });
    await add(2, { status: "unassigned" });
    await add(3, { tenantId: `t-${suffix}`, status: "assigned" });

    const { items } = await repo().findAll({ status: "unassigned", search: suffix });

    expect(items.map((s) => s.iccid).sort()).toEqual([iccid(1), iccid(2)]);
  });

  it("search also matches the tenant ids it is given", async () => {
    await add(1, { tenantId: `t-${suffix}`, status: "assigned" });
    await add(2);

    const { items } = await repo().findAll({ search: "no-such-text", tenantIds: [`t-${suffix}`] });

    expect(items.map((s) => s.iccid)).toEqual([iccid(1)]);
  });

  it("search matches several tenant ids at once", async () => {
    await add(1, { tenantId: `t-${suffix}`, status: "assigned" });
    await add(2, { tenantId: `u-${suffix}`, status: "assigned" });
    await add(3);

    const { items } = await repo().findAll({ search: "no-such-text", tenantIds: [`t-${suffix}`, `u-${suffix}`] });

    expect(items.map((s) => s.iccid).sort()).toEqual([iccid(1), iccid(2)]);
  });

  it("pages, and unpaged returns every match", async () => {
    for (let i = 1; i <= 55; i += 1) await add(i);

    const page = await repo().findAll({ search: suffix, page: 2, limit: 20 });
    const all = await repo().findAll({ search: suffix, unpaged: true });

    expect(page.total).toBe(55);
    expect(page.items).toHaveLength(20);
    expect(all.items).toHaveLength(55);
  });

  it("finds by ICCID", async () => {
    const sim = await add(1);

    expect((await repo().findByIccid(iccid(1)))?.id).toBe(sim.id);
    expect(await repo().findByIccid(iccid(9))).toBeNull();
    expect((await repo().findByIccids([iccid(1), iccid(9)])).map((s) => s.id)).toEqual([sim.id]);
  });

  it("refuses a second SIM with the same ICCID", async () => {
    await add(1);

    await expect(add(1)).rejects.toThrow();
  });
});
