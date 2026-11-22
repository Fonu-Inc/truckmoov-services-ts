import { describe, expect, it, vi } from "vitest";
import { OnboardingGate, OnboardingSettledGuard } from "../../../apps/auth/src/onboarding-gate";

const gateWith = (application: unknown) =>
  new OnboardingGate({ findLatestByTenantId: vi.fn().mockResolvedValue(application) } as never);

const contextWith = (authorization?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as never;

describe("onboarding gate", () => {
  it("holds a tenant whose latest application has not reached fleet_ready", async () => {
    const gate = gateWith({ stage: "installation" });

    expect(await gate.isPending("tenant-a")).toBe(true);
    await expect(gate.assertSettled("tenant-a")).rejects.toMatchObject({
      status: 409,
      response: { code: "onboarding_in_progress" },
    });
  });

  it("lets a fleet_ready tenant through", async () => {
    await expect(gateWith({ stage: "fleet_ready" }).assertSettled("tenant-a")).resolves.toBeUndefined();
  });

  it("never holds a tenant created without an application", async () => {
    expect(await gateWith(null).isPending("tenant-a")).toBe(false);
  });

  it("never holds platform staff", async () => {
    const findLatestByTenantId = vi.fn();
    const gate = new OnboardingGate({ findLatestByTenantId } as never);

    expect(await gate.isPending("system")).toBe(false);
    expect(findLatestByTenantId).not.toHaveBeenCalled();
  });
});

describe("onboarding settled guard", () => {
  const guard = (application: unknown) =>
    new OnboardingSettledGuard(
      { resolveAccessToken: (token: string) => (token === "good" ? { tenantId: "tenant-a" } : null) } as never,
      gateWith(application),
    );

  it("refuses a signed-in tenant still onboarding", async () => {
    await expect(guard({ stage: "payment" }).canActivate(contextWith("Bearer good"))).rejects.toMatchObject({ status: 409 });
  });

  it("leaves a missing or unknown token to the handler", async () => {
    expect(await guard({ stage: "payment" }).canActivate(contextWith())).toBe(true);
    expect(await guard({ stage: "payment" }).canActivate(contextWith("Bearer bad"))).toBe(true);
  });
});
