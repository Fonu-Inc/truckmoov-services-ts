import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { roleToId } from "@shared/rbac";
import { dbEnabled, getConfig, getOrm } from "./helper";
import { MikroInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/mikro-invoice.repository";
import { MikroOnboardingPaymentRepository } from "@auth/onboarding/infrastructure/persistence/mikro-onboarding-payment.repository";
import { MikroM2mLicensePlanRepository } from "@auth/onboarding/infrastructure/persistence/mikro-m2m-license-plan.repository";
import { MikroBillingSettingsRepository } from "@auth/onboarding/infrastructure/persistence/mikro-billing-settings.repository";
import { MikroLicencePeriodRepository } from "@auth/onboarding/infrastructure/persistence/mikro-licence-period.repository";
import { MikroRenewalFactsReader } from "@auth/onboarding/infrastructure/persistence/mikro-renewal-facts.reader";
import { RenewalInvoiceService } from "@auth/onboarding/application/services/renewal-invoice.service";
import { SettleRenewalPaymentUseCase } from "@auth/onboarding/application/settle-renewal-payment.use-case";
import {
  PayRenewalFromWalletUseCase,
} from "@auth/onboarding/application/use-cases/billing/pay-renewal.use-cases";
import { DUPLICATE_PAYMENT_NOTE } from "@auth/onboarding/domain/licence-period.repository";
import type { StoredOnboardingPayment } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { EnforcementEmail } from "@auth/onboarding/domain/ports/enforcement-notifier.port";
import { computeTiming } from "@auth/onboarding/domain/enforcement-stage";
import { addDaysToDate } from "@auth/onboarding/domain/invoice-dates";
import { MikroEnforcementQueriesRepository } from "../../apps/auth/src/enforcement-queries.repository";
import { MikroEnforcementSettingsRepository } from "../../apps/auth/src/mikro-enforcement-settings.repository";
import { MikroEnforcementNoticeRepository } from "../../apps/auth/src/enforcement-notice.repository";
import { MikroArrearsRepository } from "../../apps/auth/src/arrears.repository";
import { EnforcementAudit } from "../../apps/auth/src/enforcement-audit";
import { EnforcementNoticeService } from "../../apps/auth/src/enforcement-notice.service";
import { MikroTenantWalletRepository } from "../../apps/auth/src/mikro-tenant-wallet.repository";
import { MikroInvoiceNumberRepository } from "../../apps/auth/src/mikro-invoice-number.repository";
import { InvoiceNumberService } from "../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesInvoiceNumbers } from "../../apps/auth/src/invoice-number.allocator";
import { PaymentEventService } from "../../apps/auth/src/payment-event.service";
import { RenewalAudit } from "../../apps/auth/src/renewal-audit";
import { RENEWAL_SWEEP_LOCK_ID, RenewalSweepService } from "../../apps/auth/src/renewal-sweep.service";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-05T10:00:00+01:00");
const TODAY = "2026-10-05";
const startedAt = new Date();

describe.skipIf(!dbEnabled)("renewal invoicing on real postgres", () => {
  const config = {
    db: dbEnabled ? getConfig() : (undefined as never),
    persistence: { backend: "mikro-orm" },
  } as any;
  const tag = `rn${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const planCode = `rn_${tag}`;
  const invoices = new MikroInvoiceRepository(config);
  const payments = new MikroOnboardingPaymentRepository(config);
  const plans = new MikroM2mLicensePlanRepository(config);
  const periods = new MikroLicencePeriodRepository(config);
  const factsReader = new MikroRenewalFactsReader(config);
  const settings = new MikroEnforcementSettingsRepository(config);
  const wallets = new MikroTenantWalletRepository(config);
  const queries = new MikroEnforcementQueriesRepository(config);
  const arrears = new MikroArrearsRepository(config);
  const auditEntries: string[] = [];
  const billingAudit = { record: async (_actor: unknown, entry: { action: string }) => void auditEntries.push(entry.action) };
  const sent: EnforcementEmail[] = [];
  const noticeService = new EnforcementNoticeService(
    new MikroEnforcementNoticeRepository(config),
    arrears,
    { send: async (email: EnforcementEmail) => void sent.push(email) },
    new EnforcementAudit(billingAudit),
  );
  const restore = { onPaymentSettled: vi.fn(async () => undefined) };
  const service = new RenewalInvoiceService(
    periods,
    factsReader,
    plans,
    invoices,
    payments,
    new MikroBillingSettingsRepository(config),
    settings,
    new InvoiceSeriesInvoiceNumbers(new InvoiceNumberService(new MikroInvoiceNumberRepository(config))),
    { generate: () => `${tag}-${randomUUID()}` },
    noticeService,
    new RenewalAudit(billingAudit),
  );
  const settle = new SettleRenewalPaymentUseCase(
    payments, invoices, periods, wallets, new RenewalAudit(billingAudit), new PaymentEventService(), restore as never,
  );
  const payWallet = new PayRenewalFromWalletUseCase(
    invoices, payments, wallets, settle, settings, { generate: () => `${tag}-${randomUUID()}` },
  );

  let orm: Awaited<ReturnType<typeof getOrm>>;
  let seq = 0;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;
  const id = (suffix: string) => `${tag}-${suffix}`;

  const planRow = (over: Record<string, unknown> = {}) => ({
    id: id("plan"), code: planCode, name: "Renewal Test", description: "d", perDeviceYear1Ngn: 10_000,
    perDeviceRenewalNgn: 6_000, validityDays: 365, components: ["GPS"], lastPriceChangedAt: null, sortOrder: 9100,
    isActive: true, createdAt: new Date(), updatedAt: new Date(), ...over,
  });

  async function tenant(name: string, opts: { periodEnd?: string; devices?: number; plan?: string } = {}) {
    const tenantId = id(name);
    const applicationId = id(`${name}-app`);
    await query(
      `insert into onboarding_applications (id, reference, token_hash, applicant_type, organization_name, business_email,
         organization_phone, contact_full_name, contact_role, street_address, city, state, tenant_id, m2m_plan_code, billing_email)
       values (?, ?, ?, 'enterprise', ?, ?, '+2348000000000', 'J D', 'owner', 'Mazi', 'Abuja', 'FCT', ?, ?, 'billing@renewal.test')`,
      [applicationId, `APP-${randomUUID().slice(0, 24)}`, randomUUID(), `${tag} ${name}`, `${applicationId}@x.test`, tenantId, opts.plan ?? planCode],
    );
    await query(
      `insert into auth_users (id, email, password_hash, role_id, tenant_id, account_status)
       values (?, ?, 'x', ?, ?, 'enabled')`,
      [id(`${name}-u`), `${tenantId}@acme.test`, roleToId("FLEET_ADMIN"), tenantId],
    );
    if (opts.periodEnd) {
      await periods.insertSeeded({
        tenantId, applicationId, planCode: opts.plan ?? planCode, deviceCount: opts.devices ?? 5,
        periodStart: addDaysToDate(opts.periodEnd, -365), periodEnd: opts.periodEnd, origin: "purchase",
      });
    }
    return { tenantId, applicationId };
  }

  const renewalInvoices = (tenantId: string) =>
    query(
      `select i.*, to_char(i.due_date, 'YYYY-MM-DD') as due, to_char(i.issue_date, 'YYYY-MM-DD') as issued
         from billing_invoices i where i.tenant_id = ? and i.quotation_id is null order by i.created_at, i.sequence`,
      [tenantId],
    );
  const periodRows = (tenantId: string) =>
    query(
      `select *, to_char(period_start, 'YYYY-MM-DD') as start, to_char(period_end, 'YYYY-MM-DD') as finish
         from tenant_licence_periods where tenant_id = ? order by period_end`,
      [tenantId],
    );

  async function pendingCardPayment(applicationId: string, invoiceId: string, amountKobo: number, reference: string) {
    const row: StoredOnboardingPayment = {
      id: id(`pay-${reference}`), applicationId, reference, provider: "paystack", amountKobo, authorizationUrl: null,
      billingEmail: "billing@renewal.test", planCode, deviceCount: 5, orderSummary: null, quotationId: null,
      invoiceId, method: null, customerName: null, note: null, autoReconciled: true, status: "pending", paidAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await payments.save(row);
    return row;
  }
  const card = (reference: string, amountKobo: number) =>
    settle.execute({ reference, gateway: { succeeded: true, paid: { amountKobo, currency: "NGN", channel: "card" } } }, NOW);

  beforeAll(async () => {
    orm = await getOrm();
    await plans.save(planRow() as never);
    await settings.update({ graceDays: 3, renewalLeadDays: 7 }, "test");
  });

  afterAll(async () => {
    await query(`delete from tenant_licence_periods where tenant_id like ? or created_at >= ?`, [`${tag}%`, startedAt]);
    await query(
      `delete from billing_invoices where (tenant_id like ? or application_id like ?)
          or (quotation_id is null and created_at >= ?
              and exists (select 1 from billing_invoice_lines l where l.invoice_id = billing_invoices.id and l.is_renewal))`,
      [`${tag}%`, `${tag}%`, startedAt],
    );
    await query(`delete from onboarding_payments where application_id like ?`, [`${tag}%`]);
    await query(`delete from onboarding_applications where id like ?`, [`${tag}%`]);
    await query(`delete from auth_users where tenant_id like ?`, [`${tag}%`]);
    await query(`delete from enforcement_notices where tenant_id like ?`, [`${tag}%`]);
    await query(`delete from m2m_license_plans where code = ?`, [planCode]);
    await settings.update({ renewalLeadDays: 7 }, "test");
  });

  it("migration adds the settings column with its default and range check, and the period table with its indexes", async () => {
    const [column] = await query(
      `select column_default, is_nullable from information_schema.columns
        where table_name = 'enforcement_settings' and column_name = 'renewal_lead_days'`,
    );
    expect(column).toMatchObject({ is_nullable: "NO" });
    expect(String(column.column_default)).toContain("7");
    await expect(query(`update enforcement_settings set renewal_lead_days = 61 where id = 'system'`)).rejects.toThrow();
    await expect(query(`update enforcement_settings set renewal_lead_days = 0 where id = 'system'`)).rejects.toThrow();
    expect((await settings.get()).renewalLeadDays).toBe(7);

    const indexes = (await query(`select indexname, indexdef from pg_indexes where tablename = 'tenant_licence_periods'`)).map(
      (row) => `${row.indexname}:${row.indexdef}`.replace(/\s+/g, " "),
    );
    expect(indexes.some((i) => i.includes("UNIQUE") && i.includes("(tenant_id, period_end)"))).toBe(true);
    expect(indexes.some((i) => i.includes("UNIQUE") && i.includes("(tenant_id)") && i.includes("'active'"))).toBe(true);
    expect(indexes.some((i) => i.includes("(period_end)") && i.includes("renewal_invoice_id IS NULL"))).toBe(true);
  });

  describe("generation", () => {
    it("issues one invoice due on the expiry date and links it to the period", async () => {
      const t = await tenant("gen", { periodEnd: "2026-10-10" });

      const summary = await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const [period] = await periodRows(t.tenantId);

      expect(summary.issued).toBeGreaterThanOrEqual(1);
      expect(invoice).toMatchObject({
        status: "issued", due: "2026-10-10", issued: TODAY, customer_name: `${tag} gen`,
        billing_email: "billing@renewal.test", application_id: t.applicationId, quotation_id: null,
      });
      expect(Number(invoice.total_kobo) - Number(invoice.tax_kobo)).toBe(3_000_000);
      expect(Number(invoice.amount_paid_kobo)).toBe(0);
      expect(period.renewal_invoice_id).toBe(invoice.id);
      const lines = await query(`select * from billing_invoice_lines where invoice_id = ?`, [invoice.id]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ kind: "plan", plan_code: planCode, is_renewal: true, validity_days: 365 });
      expect(Number(lines[0].quantity)).toBe(5);
      expect(Number(lines[0].unit_price_kobo)).toBe(600_000);
      expect(auditEntries).toContain("system.billing.renewal_invoice_issued");

      const second = await service.run(NOW);
      expect(second.issued).toBe(0);
      expect(await renewalInvoices(t.tenantId)).toHaveLength(1);
    });

    it("sends the renewal notice once through the real notice table", async () => {
      const t = await tenant("notice", { periodEnd: "2026-10-09" });
      await service.run(NOW);
      await service.run(NOW);

      const rows = await query(`select * from enforcement_notices where tenant_id = ?`, [t.tenantId]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "renewal_issued", status: "sent", dedup_key: `renewal_issued:${t.tenantId}:2026-10-09` });
      expect(sent.filter((mail) => mail.kind === "renewal_issued" && mail.to.startsWith(t.tenantId))).toHaveLength(1);
    });

    it("leaves a licence outside the lead window alone, and uses a changed lead time", async () => {
      const t = await tenant("window", { periodEnd: "2026-10-20" });
      await service.run(NOW);
      expect(await renewalInvoices(t.tenantId)).toHaveLength(0);

      await settings.update({ renewalLeadDays: 20 }, "test");
      await service.run(NOW);
      await settings.update({ renewalLeadDays: 7 }, "test");
      expect(await renewalInvoices(t.tenantId)).toHaveLength(1);
    });

    it("bills at least the purchased devices and every device installed for the application", async () => {
      const t = await tenant("fleet", { periodEnd: "2026-10-08", devices: 2 });
      await query(
        `insert into installation_orders (id, order_number, application_id, tenant_id, scheduled_date, time_slot,
           address_line, city, state, site_contact_name, site_contact_phone)
         values (?, ?, ?, ?, now(), 'morning', 'a', 'b', 'c', 'd', '+2348000000000')`,
        [id("order"), `ORD-${tag}`, t.applicationId, t.tenantId],
      );
      for (let i = 0; i < 4; i += 1) {
        await query(
          `insert into installation_device_assignments (id, order_id, device_index, vehicle_id, fleet_device_id)
           values (?, ?, ?, ?, ?)`,
          [id(`asg${i}`), id("order"), i, id(`veh${i}`), i < 3 ? id(`dev${i}`) : null],
        );
      }

      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const [line] = await query(`select quantity from billing_invoice_lines where invoice_id = ?`, [invoice.id]);
      expect(Number(line.quantity)).toBe(3);

      await query(`delete from installation_device_assignments where order_id = ?`, [id("order")]);
      await query(`delete from installation_orders where id = ?`, [id("order")]);
    });

    it("skips terminated tenants, tenants without users, and tenants whose plan is gone", async () => {
      const dead = await tenant("dead", { periodEnd: "2026-10-08" });
      await query(
        `insert into tenant_terminations (tenant_id, reason, terminated_by) values (?, 'ended for the test', 'staff')`,
        [dead.tenantId],
      );
      const empty = await tenant("empty", { periodEnd: "2026-10-08" });
      await query(`delete from auth_users where tenant_id = ?`, [empty.tenantId]);
      const lost = await tenant("lost", { periodEnd: "2026-10-08", plan: `${planCode}_gone` });

      await service.run(NOW);

      for (const t of [dead, empty, lost]) expect(await renewalInvoices(t.tenantId)).toHaveLength(0);
      await query(`delete from tenant_terminations where tenant_id = ?`, [dead.tenantId]);
    });

    it("never produces two invoices when many sweeps race", async () => {
      const t = await tenant("race", { periodEnd: "2026-10-08" });
      await Promise.all(Array.from({ length: 6 }, () => service.run(NOW)));
      expect(await renewalInvoices(t.tenantId)).toHaveLength(1);
      const [period] = await periodRows(t.tenantId);
      expect(period.renewal_invoice_id).not.toBeNull();
    });

    it("lets only one of two sweep services hold the advisory lock", async () => {
      const t = await tenant("lock", { periodEnd: "2026-10-08" });
      const first = new RenewalSweepService(config, service);
      const second = new RenewalSweepService(config, service);
      const [a, b] = await Promise.all([first.run(NOW), second.run(NOW)]);

      expect(await renewalInvoices(t.tenantId)).toHaveLength(1);
      expect(a.issued + b.issued).toBeGreaterThanOrEqual(1);
      expect(RENEWAL_SWEEP_LOCK_ID).toBe(8_246_113_070_004);
    });
  });

  describe("period seeding", () => {
    it("seeds a period from a paid first-time invoice and applies the thirty day backfill floor", async () => {
      const t = await tenant("seed");
      const invoiceId = id("seed-inv");
      await query(
        `insert into billing_invoices (id, number, prefix, year, sequence, quotation_id, application_id, tenant_id, customer_name,
           customer_type, billing_email, status, issue_date, due_date, subtotal_kobo, total_kobo, amount_paid_kobo)
         values (?, ?, 'T', 2026, ?, null, ?, ?, 'c', 'enterprise', 'b@x.test', 'paid', '2025-01-01', '2025-01-15', 100, 100, 100)`,
        [invoiceId, `${tag}-S1`, 800000 + ++seq, t.applicationId, t.tenantId],
      );
      await query(
        `insert into billing_invoice_lines (id, invoice_id, position, kind, plan_code, name, quantity, unit_price_kobo, validity_days, is_renewal)
         values (?, ?, 0, 'plan', ?, 'Plan', 4, 25, 365, false)`,
        [id("seed-line"), invoiceId, planCode],
      );
      await payments.save({
        id: id("seed-pay"), applicationId: t.applicationId, reference: id("seed-ref"), provider: "paystack", amountKobo: 100,
        authorizationUrl: null, billingEmail: "b@x.test", planCode, deviceCount: 4, orderSummary: null, quotationId: null,
        invoiceId, method: "card", customerName: null, note: null, autoReconciled: true, status: "paid",
        paidAt: new Date("2025-01-10T09:00:00Z"), createdAt: new Date(), updatedAt: new Date(),
      });

      const seeds = (await periods.purchaseSeeds()).filter((seed) => seed.tenantId === t.tenantId);
      expect(seeds).toEqual([expect.objectContaining({ planCode, quantity: 4, validityDays: 365 })]);

      await service.seedPeriods(TODAY);
      const [period] = await periodRows(t.tenantId);
      expect(period).toMatchObject({ origin: "backfill", finish: "2026-11-04", status: "active", plan_code: planCode });
      expect(period.start).toBe("2025-01-10");
      expect(Number(period.device_count)).toBe(4);
      expect((await periods.purchaseSeeds()).filter((seed) => seed.tenantId === t.tenantId)).toHaveLength(0);
    });
  });

  describe("cancellation and re-pricing", () => {
    it("reprices an open invoice in place and freezes it once a payment exists", async () => {
      const t = await tenant("price", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [before] = await renewalInvoices(t.tenantId);

      await plans.save(planRow({ perDeviceRenewalNgn: 7_000 }) as never);
      await service.run(NOW);
      const [after] = await renewalInvoices(t.tenantId);
      expect(after.id).toBe(before.id);
      expect(Number(after.total_kobo) - Number(after.tax_kobo)).toBe(3_500_000);
      const [line] = await query(`select unit_price_kobo from billing_invoice_lines where invoice_id = ?`, [after.id]);
      expect(Number(line.unit_price_kobo)).toBe(700_000);

      await pendingCardPayment(t.applicationId, after.id as string, Number(after.total_kobo), id("freeze"));
      await plans.save(planRow({ perDeviceRenewalNgn: 9_000 }) as never);
      await service.run(NOW);
      const [frozen] = await renewalInvoices(t.tenantId);
      expect(Number(frozen.total_kobo)).toBe(Number(after.total_kobo));
      await plans.save(planRow() as never);
    });

    it("cancels on termination, ends the period and drops it from the planner", async () => {
      const t = await tenant("cancel", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      await query(
        `insert into tenant_terminations (tenant_id, reason, terminated_by) values (?, 'ended for the test', 'staff')`,
        [t.tenantId],
      );

      await service.run(NOW);

      const [invoice] = await renewalInvoices(t.tenantId);
      const [period] = await periodRows(t.tenantId);
      expect(invoice.status).toBe("cancelled");
      expect(period.status).toBe("ended");
      expect(await arrears.openItems(t.tenantId)).toHaveLength(0);
      await query(`delete from tenant_terminations where tenant_id = ?`, [t.tenantId]);
    });

    it("cancels on a plan change, releases the period and reissues on the new plan", async () => {
      const otherCode = `${planCode}_pro`;
      await plans.save(planRow({ id: id("plan2"), code: otherCode, perDeviceRenewalNgn: 8_000 }) as never);
      const t = await tenant("swap", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      await query(`update onboarding_applications set m2m_plan_code = ? where id = ?`, [otherCode, t.applicationId]);

      await service.run(NOW);

      const rows = await renewalInvoices(t.tenantId);
      expect(rows.map((row) => row.status)).toEqual(["cancelled", "issued"]);
      const [line] = await query(`select plan_code, unit_price_kobo from billing_invoice_lines where invoice_id = ?`, [rows[1].id]);
      expect(line).toMatchObject({ plan_code: otherCode });
      expect(Number(line.unit_price_kobo)).toBe(800_000);
      await query(`delete from tenant_licence_periods where tenant_id = ?`, [t.tenantId]);
      await query(`delete from m2m_license_plans where code = ?`, [otherCode]);
    });

    it("cancelRenewal and updateRenewalAmounts refuse anything that is paid or already started", async () => {
      const t = await tenant("guard", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      await query(`update billing_invoices set amount_paid_kobo = 1, status = 'partially_paid' where id = ?`, [invoice.id]);

      expect(await invoices.cancelRenewal(invoice.id as string)).toBe(false);
      expect(
        await invoices.updateRenewalAmounts(invoice.id as string, {
          quantity: 1, unitPriceKobo: 1, subtotalKobo: 1, taxRateBp: 0, taxKobo: 0, totalKobo: 1,
        }),
      ).toBe(false);
    });
  });

  describe("grace, suspension and settlement through the planner", () => {
    it("moves an unpaid renewal invoice current, in grace, then past grace, and clears it once paid", async () => {
      const t = await tenant("plan", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const stage = async (today: string) =>
        (await queries.candidates(3, today)).find((row) => row.tenantId === t.tenantId)?.stage;

      expect(await stage("2026-10-12")).toBe("current");
      expect(await stage("2026-10-13")).toBe("in_grace");
      expect(await stage("2026-10-15")).toBe("in_grace");
      expect(await stage("2026-10-16")).toBe("past_grace");
      const row = (await queries.candidates(3, "2026-10-13")).find((r) => r.tenantId === t.tenantId)!;
      expect(row).toMatchObject({ dueDate: "2026-10-12", graceEndsOn: "2026-10-15", owedKobo: Number(invoice.total_kobo) });
      expect(computeTiming("2026-10-12", 3, "2026-10-16").stage).toBe("past_grace");

      await pendingCardPayment(t.applicationId, invoice.id as string, Number(invoice.total_kobo), id("plan-pay"));
      const result = await card(id("plan-pay"), Number(invoice.total_kobo));

      expect(result).toMatchObject({ outcome: "renewed", newPeriodEnd: "2027-10-12" });
      expect(await stage("2026-10-16")).toBeUndefined();
      expect(await arrears.openItems(t.tenantId)).toHaveLength(0);
      expect(restore.onPaymentSettled).toHaveBeenCalledWith(t.tenantId, "invoice_paid");
    });

    it("settles a double delivery once: one extension, one next period, invoice paid exactly", async () => {
      const t = await tenant("double", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const total = Number(invoice.total_kobo);
      await pendingCardPayment(t.applicationId, invoice.id as string, total, id("double-pay"));

      const results = await Promise.all([card(id("double-pay"), total), card(id("double-pay"), total), card(id("double-pay"), total)]);

      expect(results.filter((r) => r.outcome === "renewed")).toHaveLength(1);
      const rows = await periodRows(t.tenantId);
      expect(rows.map((row) => [row.status, row.origin, row.finish])).toEqual([
        ["renewed", "purchase", "2026-10-12"],
        ["active", "renewal", "2027-10-12"],
      ]);
      expect(rows[1]).toMatchObject({ start: "2026-10-13", plan_code: planCode });
      expect(Number(rows[1].device_count)).toBe(5);
      const [paid] = await renewalInvoices(t.tenantId);
      expect(paid).toMatchObject({ status: "paid" });
      expect(Number(paid.amount_paid_kobo)).toBe(total);
    });

    it("extends from the old end date when paid inside grace, and restarts when paid very late", async () => {
      const inGrace = await tenant("grace", { periodEnd: "2026-10-12" });
      const late = await tenant("late", { periodEnd: "2024-01-01" });
      await service.run(NOW);
      for (const [t, reference] of [[inGrace, id("grace-pay")], [late, id("late-pay")]] as const) {
        const [invoice] = await renewalInvoices(t.tenantId);
        await pendingCardPayment(t.applicationId, invoice.id as string, Number(invoice.total_kobo), reference);
      }
      const [graceInvoice] = await renewalInvoices(inGrace.tenantId);
      const [lateInvoice] = await renewalInvoices(late.tenantId);

      const graceResult = await settle.execute(
        { reference: id("grace-pay"), gateway: { succeeded: true, paid: { amountKobo: Number(graceInvoice.total_kobo), currency: "NGN" } } },
        new Date("2026-10-14T10:00:00+01:00"),
      );
      const lateResult = await card(id("late-pay"), Number(lateInvoice.total_kobo));

      expect(graceResult.newPeriodEnd).toBe("2027-10-12");
      expect(lateResult.newPeriodEnd).toBe("2027-10-05");
      expect((await periodRows(late.tenantId)).find((row) => row.status === "active")?.start).toBe(TODAY);
    });

    it("credits an extra payment to the wallet and keeps the invoice total honest", async () => {
      const t = await tenant("dup", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const total = Number(invoice.total_kobo);
      await pendingCardPayment(t.applicationId, invoice.id as string, total, id("dup-1"));
      await pendingCardPayment(t.applicationId, invoice.id as string, total, id("dup-2"));

      await card(id("dup-1"), total);
      const second = await card(id("dup-2"), total);
      await card(id("dup-2"), total);

      expect(second.outcome).toBe("duplicate");
      const [paid] = await renewalInvoices(t.tenantId);
      expect(Number(paid.amount_paid_kobo)).toBe(total);
      const [extra] = await query(`select status, note from onboarding_payments where reference = ?`, [id("dup-2")]);
      expect(extra).toMatchObject({ status: "refunded", note: DUPLICATE_PAYMENT_NOTE });
      expect((await wallets.findByTenantId(t.tenantId))?.balanceKobo).toBe(total);
      const ledger = await query(`select * from wallet_ledger_entries where tenant_id = ?`, [t.tenantId]);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ category: "refund", direction: "credit", idempotency_key: `renewal-dup:${id("dup-2")}` });
      expect((await periodRows(t.tenantId)).filter((row) => row.origin === "renewal")).toHaveLength(1);
    });

    it("refuses a card payment of the wrong amount and extends nothing", async () => {
      const t = await tenant("short", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      await pendingCardPayment(t.applicationId, invoice.id as string, Number(invoice.total_kobo), id("short-pay"));

      const result = await card(id("short-pay"), Number(invoice.total_kobo) - 1);

      expect(result.outcome).toBe("mismatch");
      expect((await renewalInvoices(t.tenantId))[0]).toMatchObject({ status: "issued" });
      expect((await periodRows(t.tenantId)).filter((row) => row.origin === "renewal")).toHaveLength(0);
    });

    it("pays from the wallet: one debit under the subscription category, invoice paid, licence extended", async () => {
      const t = await tenant("wallet", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);
      const total = Number(invoice.total_kobo);
      await wallets.ensure(t.tenantId);
      await wallets.credit(t.tenantId, total + 1_000, {
        category: "top_up", quantity: 1, unitRateKobo: total, reason: "fund", idempotencyKey: `${tag}-fund-wallet`,
      });

      const { data } = await payWallet.execute(t.tenantId, invoice.id as string, NOW);

      expect(data).toMatchObject({ newPeriodEnd: "2027-10-12", invoice: { status: "paid", payable: false } });
      expect((await wallets.findByTenantId(t.tenantId))?.balanceKobo).toBe(1_000);
      const debits = await query(`select * from wallet_ledger_entries where tenant_id = ? and direction = 'debit'`, [t.tenantId]);
      expect(debits).toHaveLength(1);
      expect(debits[0]).toMatchObject({ category: "subscription", idempotency_key: `renewal:${invoice.id}` });
      const [payment] = await query(`select method, status, invoice_id from onboarding_payments where reference = ?`, [`RNW-W-${invoice.number}`]);
      expect(payment).toMatchObject({ method: "wallet", status: "paid", invoice_id: invoice.id });
      await expect(payWallet.execute(t.tenantId, invoice.id as string, NOW)).rejects.toThrow("cannot be paid");
    });
  });

  describe("tenant and admin reads", () => {
    it("lists a tenant's invoices by scope with the open total and next due date", async () => {
      const t = await tenant("list", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);

      const open = await invoices.listForTenant({ tenantId: t.tenantId, scope: "open", page: 1, limit: 10 });
      expect(open).toMatchObject({ total: 1, openTotalKobo: Number(invoice.total_kobo), nextDueDate: "2026-10-12" });
      expect(open.items[0]).toMatchObject({ isRenewal: true, invoice: { id: invoice.id } });
      expect((await invoices.listForTenant({ tenantId: t.tenantId, scope: "paid", page: 1, limit: 10 })).total).toBe(0);
      expect((await invoices.listForTenant({ tenantId: "someone-else", scope: "all", page: 1, limit: 10 })).total).toBe(0);
      expect(await invoices.findForTenant("someone-else", invoice.id as string)).toBeNull();
      expect(await invoices.findForTenant(t.tenantId, invoice.id as string)).toMatchObject({ isRenewal: true });
    });

    it("filters the admin list by kind and reports the period end", async () => {
      const t = await tenant("admin", { periodEnd: "2026-10-12" });
      await service.run(NOW);
      const [invoice] = await renewalInvoices(t.tenantId);

      const renewals = await invoices.list({ kind: "renewal", q: `${tag} admin`, page: 1, limit: 20, today: TODAY });
      const firsts = await invoices.list({ kind: "first", q: `${tag} admin`, page: 1, limit: 20, today: TODAY });

      expect(renewals.items.map((row) => row.invoice.id)).toEqual([invoice.id]);
      expect(renewals.items[0].isRenewal).toBe(true);
      expect(firsts.items).toHaveLength(0);
      expect((await periods.periodEndsForInvoices([invoice.id as string])).get(invoice.id as string)).toBe("2026-10-12");
    });
  });
});
