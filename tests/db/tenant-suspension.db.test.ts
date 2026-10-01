import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroTenantSuspensionRepository } from "../../apps/auth/src/mikro-tenant-suspension.repository";

describe.skipIf(!dbEnabled)("tenant suspensions on real postgres", () => {
  const repo = new MikroTenantSuspensionRepository({ db: dbEnabled ? getConfig() : (undefined as never) } as never);
  const ids: string[] = [];
  let orm: Awaited<ReturnType<typeof getOrm>>;

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    for (const id of ids) await orm.em.getConnection().execute(`delete from tenant_suspensions where tenant_id = ?`, [id]);
  });

  const entry = (reason: string, extra: Record<string, unknown> = {}) => {
    const tenantId = uniqueId("susp");
    ids.push(tenantId);
    return { tenantId, suspendedBy: "sys1", reason, cause: "manual" as const, ...extra };
  };

  it("stores and reads back reason, actor, cause and time as plain values", async () => {
    const row = entry("Invoice 30 days overdue");
    await repo.upsertManual(row);

    const found = await repo.findOne(row.tenantId);
    expect(found).toMatchObject({
      tenantId: row.tenantId,
      suspendedBy: "sys1",
      reason: "Invoice 30 days overdue",
      cause: "manual",
      unpaidSince: null,
      graceDays: null,
      cascadeStatus: "pending",
      cascadeProgress: {},
      cascadeAttempts: 0,
    });
    expect(found?.suspendedAt).toBeInstanceOf(Date);
    expect((await repo.findAll()).some((item) => item.tenantId === row.tenantId)).toBe(true);
  });

  it("insertIfAbsent never overwrites an existing row", async () => {
    const row = entry("Fraud review");
    await repo.upsertManual(row);

    const written = await repo.insertIfAbsent({ ...row, cause: "non_payment", reason: "Unpaid", unpaidSince: "2026-10-01", graceDays: 3 });

    expect(written).toBe(false);
    expect(await repo.findOne(row.tenantId)).toMatchObject({ cause: "manual", reason: "Fraud review" });
  });

  it("writes the unpaid-since date and grace days for an automatic suspension", async () => {
    const row = entry("Unpaid since 2026-10-01, grace of 3 days ended", { cause: "non_payment" as const, unpaidSince: "2026-10-01", graceDays: 3 });

    expect(await repo.insertIfAbsent(row)).toBe(true);
    expect(await repo.findOne(row.tenantId)).toMatchObject({ cause: "non_payment", unpaidSince: "2026-10-01", graceDays: 3 });
  });

  it("staff takeover replaces the cause, resets the cascade and keeps the unpaid-since stamp", async () => {
    const auto = entry("Unpaid", { cause: "non_payment" as const, unpaidSince: "2026-10-01", graceDays: 3 });
    await repo.insertIfAbsent(auto);
    await repo.setCascade(auto.tenantId, { status: "complete", progress: { users: "done" }, attempts: 2, lastError: null, completedAt: new Date() });

    await repo.upsertManual({ ...auto, suspendedBy: "sys2", reason: "Fraud review", cause: "manual" });

    expect(await repo.findOne(auto.tenantId)).toMatchObject({
      cause: "manual",
      suspendedBy: "sys2",
      reason: "Fraud review",
      unpaidSince: "2026-10-01",
      graceDays: 3,
      cascadeStatus: "pending",
      cascadeAttempts: 0,
      cascadeCompletedAt: null,
    });
  });

  it("suspending again as staff keeps the original time and actor and updates the reason", async () => {
    const row = entry("First reason");
    await repo.upsertManual(row);
    const first = await repo.findOne(row.tenantId);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await repo.upsertManual({ ...row, suspendedBy: "sys2", reason: "Second reason" });

    const second = await repo.findOne(row.tenantId);
    expect(second?.suspendedAt).toEqual(first?.suspendedAt);
    expect(second?.suspendedBy).toBe("sys1");
    expect(second?.reason).toBe("Second reason");
  });

  it("records cascade progress and lists only unfinished rows", async () => {
    const open = entry("Open");
    const done = entry("Done");
    await repo.upsertManual(open);
    await repo.upsertManual(done);
    await repo.setCascade(open.tenantId, {
      status: "partial",
      progress: { users: "done", fleet: "failed", counts: { users: 4 } },
      attempts: 1,
      lastError: "fleet: down",
      completedAt: null,
    });
    await repo.setCascade(done.tenantId, { status: "complete", progress: {}, attempts: 0, lastError: null, completedAt: new Date() });

    const incomplete = (await repo.findIncomplete()).map((row) => row.tenantId);
    expect(incomplete).toContain(open.tenantId);
    expect(incomplete).not.toContain(done.tenantId);
    expect(await repo.findOne(open.tenantId)).toMatchObject({
      cascadeStatus: "partial",
      cascadeAttempts: 1,
      cascadeLastError: "fleet: down",
      cascadeProgress: { users: "done", fleet: "failed", counts: { users: 4 } },
    });
  });

  it("removes the record on reinstatement", async () => {
    const row = entry("Temporary");
    await repo.upsertManual(row);
    await repo.remove(row.tenantId);

    expect(await repo.findOne(row.tenantId)).toBeNull();
  });
});
