import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroLicencePeriodRepository } from "@auth/onboarding/infrastructure/persistence/mikro-licence-period.repository";
import { lagosMonthBounds } from "../../apps/auth/src/tenant-collections.repository";
import { MikroTenantCollectionsRepository } from "../../apps/auth/src/mikro-tenant-collections.repository";
import { dbEnabled, getConfig, getOrm } from "./helper";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-15T12:00:00+01:00");

describe("lagosMonthBounds", () => {
  it("uses the Lagos calendar month", () => {
    const edge = lagosMonthBounds(new Date("2026-09-30T23:30:00Z"));
    expect(edge.from.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(edge.to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(lagosMonthBounds(new Date("2026-12-10T00:00:00Z")).to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe.skipIf(!dbEnabled)("tenant collections on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never), persistence: { backend: "mikro-orm" } } as any;
  const tag = `tc${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const id = (suffix: string) => `${tag}-${suffix}`;
  const collections = new MikroTenantCollectionsRepository(config);
  const periods = new MikroLicencePeriodRepository(config);
  let orm: Awaited<ReturnType<typeof getOrm>>;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const { from, to } = lagosMonthBounds(NOW);
  const inMonth = new Date("2026-10-03T09:00:00+01:00");
  const lastMonth = new Date("2026-09-30T23:59:00+01:00");

  async function application(name: string) {
    const tenantId = id(name);
    const applicationId = id(`${name}-app`);
    await query(
      `insert into onboarding_applications (id, reference, token_hash, applicant_type, organization_name, business_email,
         organization_phone, contact_full_name, contact_role, street_address, city, state, tenant_id, m2m_plan_code, billing_email)
       values (?, ?, ?, 'enterprise', ?, ?, '+2348000000000', 'J D', 'owner', 'Mazi', 'Abuja', 'FCT', ?, 'p', 'b@x.test')`,
      [applicationId, `APP-${randomUUID().slice(0, 24)}`, randomUUID(), `${tag} ${name}`, `${applicationId}@x.test`, tenantId],
    );
    return { tenantId, applicationId };
  }

  async function invoice(name: string, tenantId: string | null, applicationId: string | null) {
    const invoiceId = id(`${name}-inv`);
    await query(
      `insert into billing_invoices (id, number, prefix, year, sequence, application_id, tenant_id, customer_name,
         customer_type, billing_email, status, issue_date, due_date, subtotal_kobo, total_kobo)
       values (?, ?, 'T', 2026, ?, ?, ?, 'C', 'enterprise', 'b@x.test', 'paid', '2026-10-01', '2026-10-10', 100000, 100000)`,
      [invoiceId, id(`${name}-no`), Math.floor(Math.random() * 1e9), applicationId, tenantId],
    );
    return invoiceId;
  }

  async function payment(name: string, applicationId: string, invoiceId: string | null, over: Row) {
    await query(
      `insert into onboarding_payments (id, application_id, reference, provider, amount_kobo, billing_email, plan_code,
         device_count, status, paid_at, invoice_id, method)
       values (?, ?, ?, 'paystack', ?, 'b@x.test', 'p', 1, ?, ?, ?, ?)`,
      [id(name), applicationId, id(`${name}-ref`), over.amount, over.status ?? "paid", over.paidAt ?? inMonth, invoiceId, over.method ?? "card"],
    );
  }

  async function topUp(tenantId: string, amount: number, status: string, settledAt: Date | null) {
    await query(
      `insert into wallet_top_ups (tenant_id, amount_kobo, provider, mobile_number, status, reference, settled_at)
       values (?, ?, 'paystack', '0800', ?, ?, ?)`,
      [tenantId, amount, status, id(`ref-${randomUUID()}`), settledAt],
    );
  }

  beforeAll(async () => {
    orm = await getOrm();
  });
  afterAll(async () => {
    await orm?.close();
  });

  it("sums this month's cash once, by tenant, in kobo", async () => {
    const viaInvoice = await application("a");
    const viaApp = await application("b");
    const invA = await invoice("a", viaInvoice.tenantId, viaInvoice.applicationId);
    await payment("a1", viaInvoice.applicationId, invA, { amount: 100_000 });
    await payment("a2", viaInvoice.applicationId, invA, { amount: 50_000, method: "bank_transfer" });
    await payment("a-wallet", viaInvoice.applicationId, invA, { amount: 70_000, method: "wallet" });
    await payment("a-old", viaInvoice.applicationId, invA, { amount: 900_000, paidAt: lastMonth });
    await payment("a-pending", viaInvoice.applicationId, invA, { amount: 800_000, status: "pending", paidAt: null });
    await payment("a-refunded", viaInvoice.applicationId, invA, { amount: 600_000, status: "refunded" });
    await topUp(viaInvoice.tenantId, 25_000, "success", inMonth);
    await topUp(viaInvoice.tenantId, 33_000, "pending", null);
    await topUp(viaInvoice.tenantId, 44_000, "success", lastMonth);
    await payment("b1", viaApp.applicationId, null, { amount: 20_000 });

    const totals = await collections.collectedKoboByTenant(from, to);
    expect(totals.get(viaInvoice.tenantId)).toBe(175_000);
    expect(totals.get(viaApp.tenantId)).toBe(20_000);
  });

  it("returns the latest paid payment with its method", async () => {
    const { tenantId, applicationId } = await application("c");
    const inv = await invoice("c", tenantId, applicationId);
    await payment("c1", applicationId, inv, { amount: 10_000, paidAt: lastMonth, method: "card" });
    await payment("c2", applicationId, inv, { amount: 30_000, paidAt: inMonth, method: "bank_transfer" });
    await payment("c3", applicationId, inv, { amount: 99_000, status: "failed", paidAt: null });

    const last = await collections.lastPaymentForTenant(tenantId);
    expect(last).toMatchObject({ amountKobo: 30_000, method: "bank_transfer" });
    expect(last?.paidAt.toISOString()).toBe(inMonth.toISOString());
    expect(await collections.lastPaymentForTenant(id("nobody"))).toBeNull();
  });

  it("reads the current plan from the active licence period, else the latest", async () => {
    const active = await application("d");
    const ended = await application("e");
    await periods.insertSeeded({
      tenantId: active.tenantId, applicationId: active.applicationId, planCode: "plan_active", deviceCount: 1,
      periodStart: "2026-01-01", periodEnd: "2026-12-31", origin: "purchase",
    });
    await query(
      `insert into tenant_licence_periods (tenant_id, application_id, plan_code, device_count, period_start, period_end, status)
       values (?, ?, 'plan_old', 1, '2024-01-01', '2024-12-31', 'ended'), (?, ?, 'plan_newer_ended', 1, '2025-01-01', '2025-12-31', 'ended')`,
      [active.tenantId, active.applicationId, ended.tenantId, ended.applicationId],
    );

    const codes = await periods.currentPlanCodes();
    expect(codes.get(active.tenantId)).toBe("plan_active");
    expect(codes.get(ended.tenantId)).toBe("plan_newer_ended");
  });
});
