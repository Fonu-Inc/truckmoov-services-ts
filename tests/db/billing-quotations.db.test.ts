import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";
import { MikroQuotationRepository } from "../../apps/auth/src/contexts/onboarding/infrastructure/persistence/mikro-quotation.repository";
import { MikroOnboardingPaymentRepository } from "../../apps/auth/src/contexts/onboarding/infrastructure/persistence/mikro-onboarding-payment.repository";
import { MikroInvoiceNumberRepository } from "../../apps/auth/src/mikro-invoice-number.repository";
import { InvoiceNumberService } from "../../apps/auth/src/invoice-number.service";
import type { QuotationWithLines } from "../../apps/auth/src/contexts/onboarding/domain/quotation.repository";

type Row = Record<string, unknown>;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!dbEnabled)("quotations on real postgres", () => {
  const config = { db: dbEnabled ? getConfig() : (undefined as never) } as any;
  const repo = new MikroQuotationRepository(config);
  const payments = new MikroOnboardingPaymentRepository(config);
  const numbers = new InvoiceNumberService(new MikroInvoiceNumberRepository(config));
  const tag = uniqueId("qt").slice(0, 12);
  let orm: Awaited<ReturnType<typeof getOrm>>;
  const query = (sql: string, params: unknown[] = []) => orm.em.getConnection().execute(sql, params) as Promise<Row[]>;

  const build = async (over: Partial<QuotationWithLines> = {}): Promise<QuotationWithLines> => {
    const allocated = await numbers.allocatePlatform("quotation", new Date());
    const id = uniqueId("q");
    const now = new Date();
    return {
      id, number: allocated.invoiceNumber, prefix: allocated.prefix, year: allocated.year, sequence: allocated.sequence,
      applicationId: uniqueId("app"), tenantId: null, planCode: "m2m_standard", deviceCount: 2,
      customerName: `${tag} Haulage`, customerType: "fleet_provider", billingEmail: "a@b.com", status: "sent",
      subtotalKobo: 8_000_000, discountKobo: 0, taxRateBp: 750, taxKobo: 600_000, totalKobo: 8_600_000,
      validUntil: new Date(now.getTime() + 30 * DAY), sentAt: now, acceptedAt: null, createdAt: now, updatedAt: now,
      lines: [
        { id: `${id}-1`, quotationId: id, position: 0, kind: "plan", planCode: "m2m_standard", name: "Standard", description: "d", quantity: 2, unitPriceKobo: 2_500_000, validityDays: 365, components: ["GPS", "SIM"], isRenewal: false },
        { id: `${id}-2`, quotationId: id, position: 1, kind: "installation", planCode: null, name: "Installation", description: null, quantity: 2, unitPriceKobo: 1_500_000, validityDays: null, components: null, isRenewal: false },
      ],
      ...over,
    };
  };

  beforeAll(async () => {
    orm = await getOrm();
  });

  afterAll(async () => {
    await query(`delete from onboarding_payments where reference like ?`, [`${tag}%`]);
    await query(`delete from billing_quotations where customer_name like ?`, [`${tag}%`]);
    await orm.close();
  });

  it("applies the migration and survives a re-run", async () => {
    const { Migration20261002020000 } = await import("../../apps/auth/src/migrations/Migration20261002020000");
    const migration = new Migration20261002020000(orm.em.getDriver(), orm.config as any) as any;
    await migration.up();
    const sqls = migration.getQueries() as string[];
    for (const sql of sqls) await query(sql);
    for (const sql of sqls) await query(sql);
    const [{ n }] = (await query(`select count(*)::int as n from mikro_migrations_auth where name = 'Migration20261002020000'`)) as any;
    expect(n).toBe(1);
  });

  it("round-trips a quotation with numbers as numbers and components as jsonb", async () => {
    const q = await build();
    expect((await repo.createIfAbsent(q)).created).toBe(true);

    const found = await repo.findById(q.id);
    expect(found).toEqual({ ...q, validUntil: expect.any(Date), sentAt: expect.any(Date), createdAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(found?.validUntil.getTime()).toBe(q.validUntil.getTime());
    expect(typeof found?.totalKobo).toBe("number");
    expect(found?.lines[0].components).toEqual(["GPS", "SIM"]);
  });

  it("holds one live quotation per key, even under concurrent inserts", async () => {
    const base = await build();
    const racers = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const id = uniqueId("q");
        const allocated = await numbers.allocatePlatform("quotation", new Date());
        return repo.createIfAbsent({
          ...base, id, number: allocated.invoiceNumber, sequence: allocated.sequence,
          lines: base.lines.map((l) => ({ ...l, id: `${id}-${i}-${l.position}`, quotationId: id })),
        });
      }),
    );

    expect(racers.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(racers.map((r) => r.quotation.id)).size).toBe(1);
    const [{ n }] = (await query(`select count(*)::int as n from billing_quotations where application_id = ?`, [base.applicationId])) as any;
    expect(n).toBe(1);
    const [{ l }] = (await query(`select count(*)::int as l from billing_quotation_lines where quotation_id = ?`, [racers[0].quotation.id])) as any;
    expect(l).toBe(2);
  });

  it("frees the key once the quotation is cancelled", async () => {
    const first = await build();
    await repo.createIfAbsent(first);
    await query(`update billing_quotations set status = 'cancelled' where id = ?`, [first.id]);

    const second = await build({ applicationId: first.applicationId });
    expect((await repo.createIfAbsent(second)).created).toBe(true);
  });

  it("extends validity only for a sent quotation that has expired", async () => {
    const q = await build({ validUntil: new Date(Date.now() - DAY) });
    await repo.createIfAbsent(q);
    const next = new Date(Date.now() + 30 * DAY);

    expect(await repo.extendValidity(q.id, next, new Date())).toBe(true);
    expect(await repo.extendValidity(q.id, new Date(next.getTime() + DAY), new Date())).toBe(false);
    expect((await repo.findById(q.id))?.validUntil.getTime()).toBe(next.getTime());
  });

  it("lists with search, expiry-aware status, payment completeness and paging", async () => {
    const base = Date.now();
    const complete = await build({ createdAt: new Date(base - 3000), customerName: `${tag}-L Alpha` });
    const partial = await build({ createdAt: new Date(base - 2000), customerName: `${tag}-L Beta` });
    const expired = await build({ createdAt: new Date(base - 1000), customerName: `${tag}-L Gamma`, validUntil: new Date(base - DAY) });
    const accepted = await build({ createdAt: new Date(base), customerName: `${tag}-L Delta`, status: "accepted", validUntil: new Date(base - DAY) });
    for (const q of [complete, partial, expired, accepted]) await repo.createIfAbsent(q);
    const pay = (suffix: string, quotationId: string, amountKobo: number, status: "paid" | "pending") =>
      payments.save({
        id: uniqueId("p"), applicationId: "app-x", reference: `${tag}-${suffix}`, provider: "paystack", amountKobo,
        authorizationUrl: null, billingEmail: "a@b.com", planCode: "m2m_standard", deviceCount: 2, orderSummary: null,
        quotationId, invoiceId: null, method: null, customerName: null, note: null, autoReconciled: true, status, paidAt: status === "paid" ? new Date() : null, createdAt: new Date(), updatedAt: new Date(),
      });
    await pay("a", complete.id, 8_600_000, "paid");
    await pay("b", partial.id, 4_000_000, "paid");
    await pay("c", partial.id, 4_600_000, "pending");
    const now = new Date();
    const all = { q: `${tag}-L`, page: 1, limit: 10, now };

    const everything = await repo.list(all);
    expect(everything.items.map((r) => r.quotation.customerName)).toEqual([`${tag}-L Delta`, `${tag}-L Gamma`, `${tag}-L Beta`, `${tag}-L Alpha`]);
    expect(everything.total).toBe(4);
    const beta = everything.items.find((r) => r.quotation.id === partial.id);
    expect(beta).toMatchObject({ paidKobo: 4_000_000, lineCount: 2 });
    expect(typeof beta?.paidKobo).toBe("number");

    expect((await repo.list({ ...all, status: "expired" })).items.map((r) => r.quotation.id)).toEqual([expired.id]);
    expect((await repo.list({ ...all, status: "sent" })).total).toBe(2);
    expect((await repo.list({ ...all, status: "accepted" })).items.map((r) => r.quotation.id)).toEqual([accepted.id]);
    expect((await repo.list({ ...all, paymentStatus: "complete" })).items.map((r) => r.quotation.id)).toEqual([complete.id]);
    expect((await repo.list({ ...all, paymentStatus: "incomplete" })).total).toBe(3);
    expect((await repo.list({ ...all, q: `${tag}-L gam` })).items.map((r) => r.quotation.id)).toEqual([expired.id]);
    expect((await repo.list({ ...all, q: complete.number })).items.map((r) => r.quotation.id)).toEqual([complete.id]);
    expect((await repo.list({ ...all, q: "100%_" })).total).toBe(0);

    const page2 = await repo.list({ ...all, page: 2, limit: 3 });
    expect(page2).toMatchObject({ total: 4 });
    expect(page2.items).toHaveLength(1);
    expect(await payments.findByQuotationId(partial.id)).toHaveLength(2);
  });
});
