import { describe, expect, it } from "vitest";
import { InMemorySubscriptionPlanRepository } from "../../../apps/auth/src/in-memory-subscription-plan.repository";
import {
  SubscriptionPlanNotFoundError,
  UpdateSubscriptionPlanPriceUseCase,
} from "../../../apps/auth/src/update-subscription-plan-price.use-case";
import type { StoredSubscriptionPlan } from "../../../apps/auth/src/subscription-plan.repository";

const ACTOR = { id: "admin-1", email: "ops@truckmoov.com", role: "SYSTEM_ADMIN" };

const tokenService = {
  resolveAccessToken: () => ({ sub: ACTOR.id, tenantId: "system", role: ACTOR.role }),
} as never;

const userRepository = {
  findById: async () => ({ ...ACTOR, status: "active", tenantId: "system" }),
} as never;

class FakeActivityLog {
  readonly entries: Array<Record<string, unknown>> = [];
  async record(entry: Record<string, unknown>) {
    this.entries.push(entry);
  }
}

function seedPlan(overrides: Partial<StoredSubscriptionPlan> = {}): StoredSubscriptionPlan {
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
    ctaLabel: "Choose plan",
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function harness(seed?: StoredSubscriptionPlan) {
  const plans = new InMemorySubscriptionPlanRepository();
  const activityLog = new FakeActivityLog();
  if (seed) plans.save(seed);
  return {
    plans,
    activityLog,
    useCase: new UpdateSubscriptionPlanPriceUseCase(tokenService, userRepository, plans, activityLog as never),
  };
}

describe("Subscription plan pricing", () => {
  it("updates monthly price and recomputes the yearly discount", async () => {
    const kit = harness(seedPlan());

    const updated = await kit.useCase.execute({
      accessToken: "token",
      planId: "plan-1",
      monthlyPriceNgn: 200000,
    });

    expect(updated.monthlyPriceNgn).toBe(200000);
    // Yearly-equivalent untouched, so the discount widens against the new monthly price.
    expect(updated.yearlyMonthlyEquivalentNgn).toBe(135000);
    expect(updated.yearlyDiscountPercent).toBe(32);
  });

  it("updates only the yearly-equivalent price when monthly is omitted", async () => {
    const kit = harness(seedPlan());

    const updated = await kit.useCase.execute({
      accessToken: "token",
      planId: "plan-1",
      yearlyMonthlyEquivalentNgn: 120000,
    });

    expect(updated.monthlyPriceNgn).toBe(150000);
    expect(updated.yearlyMonthlyEquivalentNgn).toBe(120000);
    expect(updated.yearlyDiscountPercent).toBe(20);
  });

  it("saves each price independently: two separate calls, each taking effect", async () => {
    const kit = harness(seedPlan());

    await kit.useCase.execute({ accessToken: "token", planId: "plan-1", monthlyPriceNgn: 180000 });
    const updated = await kit.useCase.execute({
      accessToken: "token",
      planId: "plan-1",
      yearlyMonthlyEquivalentNgn: 160000,
    });

    expect(updated.monthlyPriceNgn).toBe(180000);
    expect(updated.yearlyMonthlyEquivalentNgn).toBe(160000);
  });

  it("records who changed the price and what it was before", async () => {
    const kit = harness(seedPlan());

    await kit.useCase.execute({ accessToken: "token", planId: "plan-1", monthlyPriceNgn: 200000 });

    const logged = kit.activityLog.entries.at(-1);
    expect(logged?.action).toBe("subscription_plan.price_changed");
    expect(logged?.actorId).toBe(ACTOR.id);
    expect((logged?.metadata as Record<string, unknown>)?.previousMonthlyPriceNgn).toBe(150000);
  });

  it("throws for a plan that does not exist", async () => {
    const kit = harness();

    await expect(() =>
      kit.useCase.execute({ accessToken: "token", planId: "missing", monthlyPriceNgn: 100000 }),
    ).rejects.toBeInstanceOf(SubscriptionPlanNotFoundError);
  });
});
