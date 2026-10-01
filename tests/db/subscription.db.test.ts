import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActivateSubscriptionUseCase } from "../../apps/auth/src/activate-subscription.use-case";
import {
  CreatePaymentIntentUseCase,
  InvalidPlanPriceError,
  PlanChangeNotAllowedError,
} from "../../apps/auth/src/create-payment-intent.use-case";
import { MikroSubscriptionPlanRepository } from "../../apps/auth/src/mikro-subscription-plan.repository";
import { MikroTenantOnboardingRepository } from "../../apps/auth/src/mikro-tenant-onboarding.repository";
import type { StoredSubscriptionPlan } from "../../apps/auth/src/subscription-plan.repository";
import type { StoredTenantOnboarding } from "../../apps/auth/src/tenant-onboarding.repository";
import { dbEnabled, getConfig, getOrm, uniqueId } from "./helper";

const PRICED = { monthly: 150000, yearly: 135000 };

describe.skipIf(!dbEnabled)("subscription payment on postgres", () => {
  let orm: Awaited<ReturnType<typeof getOrm>>;
  let plans: MikroSubscriptionPlanRepository;
  let onboardings: MikroTenantOnboardingRepository;
  let priced: StoredSubscriptionPlan;
  let free: StoredSubscriptionPlan;
  const tenants: string[] = [];

  async function ensurePlan(
    tier: string,
    monthly: number | null,
    yearly: number | null,
  ): Promise<StoredSubscriptionPlan> {
    const id = uniqueId("subscription");
    await orm.em.getConnection().execute(
      `insert into system_subscription_plans (id, code, tier, name, description, monthly_price_ngn, yearly_monthly_equivalent_ngn, cta_label)
       values (?, ?, ?, ?, '', ?, ?, 'Choose') on conflict do nothing`,
      [id, `${tier}-${id}`, tier, tier, monthly, yearly],
    );
    const plan = await plans.findByTier(tier as StoredSubscriptionPlan["tier"]);
    if (!plan) throw new Error(`plan ${tier} missing`);
    return plan;
  }

  async function seedTenant(activePlanCode = ""): Promise<string> {
    const tenantId = uniqueId("subscription");
    tenants.push(tenantId);
    const now = new Date();
    await onboardings.save({
      id: uniqueId("subscription-ob"),
      tenantId,
      invitedEmail: `${tenantId}@test.co`,
      organizationType: "fleet_provider",
      bootstrapRole: "FLEET_ADMIN",
      status: "pending_activation",
      company: {},
      subscription: { planCode: activePlanCode, billingCycle: "monthly" },
      deviceProvisioning: {},
      simAssignment: {},
      features: {},
      createdByUserId: "u1",
      createdAt: now,
      updatedAt: now,
    } as unknown as StoredTenantOnboarding);
    return tenantId;
  }

  function build(tenantId: string) {
    const gateway = {
      initiateCharge: vi.fn(async (input: { reference: string }) => ({
        provider: "paystack",
        reference: input.reference,
        authorizationUrl: "https://pay.test/x",
      })),
    };
    const intent = new CreatePaymentIntentUseCase(
      { resolveAccessToken: () => ({ id: "u1" }) } as never,
      { findById: async () => ({ id: "u1", email: "a@b.co", tenantId, accountStatus: "active" }) } as never,
      plans,
      onboardings,
      {} as never,
      gateway as never,
    );
    return { intent, gateway, activate: new ActivateSubscriptionUseCase(onboardings) };
  }

  const request = (planCode: string, billingCycle: "monthly" | "yearly" = "monthly") =>
    ({ planCode, billingCycle, gateway: "paystack" }) as const;

  const paid = (amountKobo: number) => ({ amountKobo, currency: "NGN" });

  async function pendingCharges(tenantId: string) {
    return (await onboardings.findByTenantId(tenantId))!.subscription.pendingCharges ?? [];
  }

  beforeAll(async () => {
    orm = await getOrm();
    const db = { db: getConfig() } as never;
    plans = new MikroSubscriptionPlanRepository(db);
    onboardings = new MikroTenantOnboardingRepository(db);
    priced = await ensurePlan("professional", PRICED.monthly, PRICED.yearly);
    free = await ensurePlan("enterprise", null, null);
  });

  afterAll(async () => {
    for (const tenantId of tenants) await onboardings.deleteByTenantId(tenantId);
    await orm?.close();
  });

  it("charges the monthly price for monthly and 12 x the yearly equivalent for yearly", async () => {
    const tenantId = await seedTenant();
    const { intent, gateway } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    await intent.execute("t", request(priced.code, "yearly"));
    const amounts = gateway.initiateCharge.mock.calls.map((call) => call[0].amountKobo);
    expect(amounts).toEqual([
      priced.monthlyPriceNgn! * 100,
      priced.yearlyMonthlyEquivalentNgn! * 100 * 12,
    ]);
  });

  it("refuses a null price before any gateway call and records nothing", async () => {
    const tenantId = await seedTenant();
    const { intent, gateway } = build(tenantId);
    expect(free.monthlyPriceNgn).toBeNull();
    for (const cycle of ["monthly", "yearly"] as const) {
      await expect(intent.execute("t", request(free.code, cycle))).rejects.toBeInstanceOf(
        InvalidPlanPriceError,
      );
    }
    expect(gateway.initiateCharge).not.toHaveBeenCalled();
    expect(await pendingCharges(tenantId)).toEqual([]);
  });

  it("keeps both pending charges for two attempts", async () => {
    const tenantId = await seedTenant();
    const { intent, gateway } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    await intent.execute("t", request(priced.code, "yearly"));
    const refs = gateway.initiateCharge.mock.calls.map((call) => call[0].reference);
    expect((await pendingCharges(tenantId)).map((c) => c.reference)).toEqual(refs);
  });

  it("keeps every pending charge when attempts run concurrently", async () => {
    const tenantId = await seedTenant();
    const { intent, gateway } = build(tenantId);
    await Promise.all(
      Array.from({ length: 4 }, () => intent.execute("t", request(priced.code, "monthly"))),
    );
    const refs = gateway.initiateCharge.mock.calls.map((call) => call[0].reference).sort();
    expect((await pendingCharges(tenantId)).map((c) => c.reference).sort()).toEqual(refs);
  });

  it("activates once with the right reference and amount, and a repeat keeps the time", async () => {
    const tenantId = await seedTenant();
    const { intent, activate } = build(tenantId);
    await intent.execute("t", request(priced.code, "yearly"));
    const charge = (await pendingCharges(tenantId))[0];
    await activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo));
    const first = (await onboardings.findByTenantId(tenantId))!;
    expect(first.subscription).toEqual({ planCode: priced.code, billingCycle: "yearly" });
    expect(first.paymentReference).toBe(charge.reference);
    expect(first.subscriptionActivatedAt).toBeInstanceOf(Date);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo));
    const second = (await onboardings.findByTenantId(tenantId))!;
    expect(second.subscriptionActivatedAt).toEqual(first.subscriptionActivatedAt);
  });

  it("changes nothing for a wrong amount or an unknown reference", async () => {
    const tenantId = await seedTenant();
    const { intent, activate } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    const charge = (await pendingCharges(tenantId))[0];
    await activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo - 1));
    await activate.execute(tenantId, "TM-unknown", undefined, paid(charge.amountKobo));
    const after = (await onboardings.findByTenantId(tenantId))!;
    expect(after.subscriptionActivatedAt ?? null).toBeNull();
    expect(after.paymentReference ?? null).toBeNull();
    expect(after.subscription.planCode).toBe("");
    expect(after.subscription.pendingCharges).toEqual([charge]);
  });

  it("activates once under concurrent deliveries", async () => {
    const tenantId = await seedTenant();
    const { intent, activate } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    const charge = (await pendingCharges(tenantId))[0];
    await Promise.all(
      Array.from({ length: 6 }, () =>
        activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo)),
      ),
    );
    const after = (await onboardings.findByTenantId(tenantId))!;
    expect(after.paymentReference).toBe(charge.reference);
    expect(after.subscriptionActivatedAt).toBeInstanceOf(Date);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo));
    expect((await onboardings.findByTenantId(tenantId))!.subscriptionActivatedAt).toEqual(
      after.subscriptionActivatedAt,
    );
  });

  it("concurrent delivery and a new attempt never lose the other's write", async () => {
    const tenantId = await seedTenant();
    const { intent, activate } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    const charge = (await pendingCharges(tenantId))[0];
    const [, attempt] = await Promise.allSettled([
      activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo)),
      intent.execute("t", request(priced.code, "yearly")),
    ]);
    const after = (await onboardings.findByTenantId(tenantId))!;
    expect(after.subscriptionActivatedAt).toBeInstanceOf(Date);
    expect(after.paymentReference).toBe(charge.reference);
    expect(after.subscription.planCode).toBe(priced.code);
    const cycles = (after.subscription.pendingCharges ?? []).map((c) => c.billingCycle);
    expect(cycles).toEqual(attempt.status === "fulfilled" ? ["yearly"] : []);
  });

  it("refuses an already-active same plan before charging", async () => {
    const tenantId = await seedTenant();
    const { intent, gateway, activate } = build(tenantId);
    await intent.execute("t", request(priced.code, "monthly"));
    const charge = (await pendingCharges(tenantId))[0];
    await activate.execute(tenantId, charge.reference, undefined, paid(charge.amountKobo));
    gateway.initiateCharge.mockClear();
    await expect(intent.execute("t", request(priced.code, "monthly"))).rejects.toBeInstanceOf(
      PlanChangeNotAllowedError,
    );
    expect(gateway.initiateCharge).not.toHaveBeenCalled();
  });
});
