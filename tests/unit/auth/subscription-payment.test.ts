import { describe, expect, it, vi } from "vitest";
import { ActivateSubscriptionUseCase } from "../../../apps/auth/src/activate-subscription.use-case";
import {
  CreatePaymentIntentUseCase,
  InvalidPlanPriceError,
  PlanChangeNotAllowedError,
} from "../../../apps/auth/src/create-payment-intent.use-case";
import { InMemorySubscriptionPlanRepository } from "../../../apps/auth/src/in-memory-subscription-plan.repository";
import { InMemoryTenantOnboardingRepository } from "../../../apps/auth/src/in-memory-tenant-onboarding.repository";
import type { StoredSubscriptionPlan } from "../../../apps/auth/src/subscription-plan.repository";
import type { StoredTenantOnboarding } from "../../../apps/auth/src/tenant-onboarding.repository";

const TENANT = "tenant-1";

function plan(overrides: Partial<StoredSubscriptionPlan> = {}): StoredSubscriptionPlan {
  return {
    id: "plan-1",
    code: "professional",
    tier: "professional",
    name: "Professional",
    description: "",
    monthlyPriceNgn: 150000,
    yearlyMonthlyEquivalentNgn: 135000,
    yearlyDiscountPercent: 10,
    maxActiveVehicles: null,
    maxUsers: null,
    customPricing: false,
    trialDays: null,
    badge: null,
    ctaLabel: "Choose",
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function onboarding(planCode = ""): StoredTenantOnboarding {
  return {
    id: "ob-1",
    tenantId: TENANT,
    subscription: { planCode, billingCycle: "monthly" },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as StoredTenantOnboarding;
}

async function setup(opts: { plan?: StoredSubscriptionPlan; planCode?: string } = {}) {
  const plans = new InMemorySubscriptionPlanRepository();
  await plans.save(opts.plan ?? plan());
  const onboardings = new InMemoryTenantOnboardingRepository();
  await onboardings.save(onboarding(opts.planCode));
  const gateway = {
    initiateCharge: vi.fn(async (input: { reference: string }) => ({
      provider: "paystack",
      reference: input.reference,
      authorizationUrl: "https://pay.test/x",
    })),
  };
  const intent = new CreatePaymentIntentUseCase(
    { resolveAccessToken: () => ({ id: "u1" }) } as never,
    { findById: async () => ({ id: "u1", email: "a@b.co", tenantId: TENANT, accountStatus: "active" }) } as never,
    plans,
    onboardings,
    {} as never,
    gateway as never,
  );
  return { intent, onboardings, gateway, activate: new ActivateSubscriptionUseCase(onboardings) };
}

const pay = (billingCycle: "monthly" | "yearly" = "monthly", planCode = "professional") =>
  ({ planCode, billingCycle, gateway: "paystack" }) as const;

describe("subscription payment intent", () => {
  it("charges the monthly price for monthly", async () => {
    const { intent, gateway } = await setup();
    await intent.execute("t", pay("monthly"));
    expect(gateway.initiateCharge.mock.calls[0][0].amountKobo).toBe(15_000_000);
  });

  it("charges 12 x the yearly monthly equivalent for yearly", async () => {
    const { intent, gateway } = await setup();
    await intent.execute("t", pay("yearly"));
    expect(gateway.initiateCharge.mock.calls[0][0].amountKobo).toBe(135000 * 100 * 12);
  });

  it.each([null, 0])("refuses a %s price before calling the gateway", async (price) => {
    const { intent, gateway } = await setup({ plan: plan({ monthlyPriceNgn: price }) });
    await expect(intent.execute("t", pay("monthly"))).rejects.toBeInstanceOf(InvalidPlanPriceError);
    expect(gateway.initiateCharge).not.toHaveBeenCalled();
  });

  it("refuses a yearly charge when the yearly price is missing", async () => {
    const { intent, gateway } = await setup({ plan: plan({ yearlyMonthlyEquivalentNgn: null }) });
    await expect(intent.execute("t", pay("yearly"))).rejects.toBeInstanceOf(InvalidPlanPriceError);
    expect(gateway.initiateCharge).not.toHaveBeenCalled();
  });

  it("refuses a different plan for a tenant that already has one, before charging", async () => {
    const { intent, gateway } = await setup({ planCode: "starter" });
    await expect(intent.execute("t", pay())).rejects.toBeInstanceOf(PlanChangeNotAllowedError);
    expect(gateway.initiateCharge).not.toHaveBeenCalled();
  });

  it("records a pending charge per attempt with unique references and keeps earlier ones", async () => {
    const { intent, onboardings, gateway } = await setup();
    await intent.execute("t", pay("monthly"));
    await intent.execute("t", pay("yearly"));
    const [first, second] = gateway.initiateCharge.mock.calls.map((c) => c[0].reference);
    expect(first).not.toBe(second);
    const saved = await onboardings.findByTenantId(TENANT);
    expect(saved?.subscription.pendingCharges?.map((c) => c.reference)).toEqual([first, second]);
    expect(saved?.subscription.pendingCharges?.[1]).toMatchObject({
      amountKobo: 135000 * 100 * 12,
      planCode: "professional",
      billingCycle: "yearly",
    });
  });
});

describe("subscription activation", () => {
  async function pending(cycle: "monthly" | "yearly" = "monthly") {
    const ctx = await setup();
    await ctx.intent.execute("t", pay(cycle));
    const saved = await ctx.onboardings.findByTenantId(TENANT);
    const charge = saved!.subscription.pendingCharges![0];
    return { ...ctx, charge };
  }

  it("activates with the pending plan when the paid amount matches", async () => {
    const { activate, onboardings, charge } = await pending("yearly");
    await activate.execute(TENANT, charge.reference, undefined, { amountKobo: charge.amountKobo, currency: "NGN" });
    const saved = await onboardings.findByTenantId(TENANT);
    expect(saved?.subscription).toEqual({ planCode: "professional", billingCycle: "yearly" });
    expect(saved?.paymentReference).toBe(charge.reference);
    expect(saved?.subscriptionActivatedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["underpaid", { amountKobo: 1, currency: "NGN" }],
    ["unknown amount", { amountKobo: null, currency: null }],
    ["wrong currency", { amountKobo: 15_000_000, currency: "USD" }],
    ["no paid info", undefined],
  ])("does nothing when %s", async (_label, paid) => {
    const { activate, onboardings, charge } = await pending();
    await activate.execute(TENANT, charge.reference, undefined, paid);
    const saved = await onboardings.findByTenantId(TENANT);
    expect(saved?.subscriptionActivatedAt ?? null).toBeNull();
    expect(saved?.subscription.planCode).toBe("");
  });

  it("does nothing for a reference that was never pending", async () => {
    const { activate, onboardings, charge } = await pending();
    await activate.execute(TENANT, "TM-other", undefined, { amountKobo: charge.amountKobo, currency: "NGN" });
    expect((await onboardings.findByTenantId(TENANT))?.subscriptionActivatedAt ?? null).toBeNull();
  });

  it("does not reset the activation time on a repeated delivery", async () => {
    vi.useFakeTimers();
    try {
      const { activate, onboardings, charge } = await pending();
      const paid = { amountKobo: charge.amountKobo, currency: "NGN" };
      await activate.execute(TENANT, charge.reference, undefined, paid);
      const first = (await onboardings.findByTenantId(TENANT))!.subscriptionActivatedAt;
      vi.advanceTimersByTime(60_000);
      await activate.execute(TENANT, charge.reference, undefined, paid);
      expect((await onboardings.findByTenantId(TENANT))!.subscriptionActivatedAt).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not apply a paid charge targeting a different plan than the current one", async () => {
    const { activate, onboardings, charge } = await pending();
    const saved = (await onboardings.findByTenantId(TENANT))!;
    await onboardings.save({ ...saved, subscription: { ...saved.subscription, planCode: "starter" } });
    await activate.execute(TENANT, charge.reference, undefined, { amountKobo: charge.amountKobo, currency: "NGN" });
    const after = await onboardings.findByTenantId(TENANT);
    expect(after?.subscription.planCode).toBe("starter");
    expect(after?.subscriptionActivatedAt ?? null).toBeNull();
  });
});
